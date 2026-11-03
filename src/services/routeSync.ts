import * as db from '@/db/database';
import { ID, CurrencyCode } from '@/types/models';
import { computeRoute, googleReady } from '@/integrations/google';
import { osmRoutable, osrmRoute } from '@/integrations/osm';
import { liveFx } from '@/integrations/live';
import { estimateRoute, hasGeo, routesOfDay } from './plannerService';

/** KRW for a fare in any currency (live FX; undefined when unknown). */
function fareKRW(f: { currency: string; amount: number }) {
  if (f.currency === 'KRW') return Math.round(f.amount);
  const r = liveFx()?.rates[f.currency as CurrencyCode];
  return r ? Math.round(f.amount * r) : undefined;
}

export type SyncOutcome = 'ok' | 'skip' | 'miss';

/**
 * Replace one leg's estimate with real routing data.
 *  - Google key set → Google Routes for every mode (incl. transit + fare)
 *  - otherwise      → free OSRM for walking / taxi / rental car; transit stays an estimate ('skip')
 */
export async function syncRoute(routeId: ID): Promise<SyncOutcome> {
  const r = db.get('routes', routeId);
  const a = r && db.get('places', r.fromPlaceId), b = r && db.get('places', r.toPlaceId);
  if (!r || !a || !hasGeo(a) || !b || !hasGeo(b)) return 'miss';
  const google = googleReady();
  if (!google && !osmRoutable(r.mode)) return 'skip';
  const res = google ? await computeRoute(a, b, r.mode) : await osrmRoute(a, b, r.mode);
  if (!res) return 'miss';
  // Transit: Google's fare when given. Taxi / rental car: our per-km estimate on the REAL distance.
  const fallbackCost = estimateRoute(r.mode, res.distanceKm / 1.3).estCostKRW;
  const cost = r.mode === 'walk' ? 0 : res.fare ? fareKRW(res.fare) ?? fallbackCost : fallbackCost;
  db.update('routes', routeId, {
    distanceKm: res.distanceKm, durationMin: res.durationMin, transfers: res.transfers ?? (r.mode === 'walk' || r.mode === 'taxi' || r.mode === 'rentcar' ? 0 : r.transfers),
    estCostKRW: cost, source: 'api', provider: google ? 'google' : 'osm',
  });
  return 'ok';
}

/** Update every leg of a day. */
export async function syncDay(itineraryId: ID) {
  const routes = routesOfDay(itineraryId).filter(Boolean) as NonNullable<ReturnType<typeof routesOfDay>[number]>[];
  let ok = 0, miss = 0, skip = 0;
  for (const r of routes) {
    try {
      const o = await syncRoute(r.id);
      if (o === 'ok') ok++; else if (o === 'skip') skip++; else miss++;
    } catch (e) { if (ok === 0 && miss === 0) throw e; miss++; }
  }
  return { ok, miss, skip, total: routes.length, google: googleReady() };
}
