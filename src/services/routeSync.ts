import * as db from '@/db/database';
import { ID, CurrencyCode } from '@/types/models';
import { computeRoute, googleReady } from '@/integrations/google';
import { liveFx } from '@/integrations/live';
import { dayPlaces, estimateRoute, hasGeo, routesOfDay } from './plannerService';

/** KRW for a fare in any currency (live FX; undefined when unknown). */
function fareKRW(f: { currency: string; amount: number }) {
  if (f.currency === 'KRW') return Math.round(f.amount);
  const r = liveFx()?.rates[f.currency as CurrencyCode];
  return r ? Math.round(f.amount * r) : undefined;
}

/** Replace one leg's estimate with Google Routes data. Returns false when Google found no route. */
export async function syncRouteFromGoogle(routeId: ID): Promise<boolean> {
  const r = db.get('routes', routeId);
  const a = r && db.get('places', r.fromPlaceId), b = r && db.get('places', r.toPlaceId);
  if (!r || !a || !b || !hasGeo(a) || !hasGeo(b)) return false;
  const res = await computeRoute(a, b, r.mode);
  if (!res) return false;
  // Transit: Google's fare when given. Taxi / rental car: our per-km estimate on the REAL distance.
  const fallbackCost = estimateRoute(r.mode, res.distanceKm / 1.3).estCostKRW;
  const cost = r.mode === 'walk' ? 0 : res.fare ? fareKRW(res.fare) ?? fallbackCost : fallbackCost;
  db.update('routes', routeId, { distanceKm: res.distanceKm, durationMin: res.durationMin, transfers: res.transfers, estCostKRW: cost, source: 'api' });
  return true;
}

/** Update every leg of a day. Returns how many legs were updated / failed. */
export async function syncDayFromGoogle(itineraryId: ID) {
  if (!googleReady()) throw new Error('Google Maps API 키를 먼저 설정해 주세요 (MY PROFILE › API 설정).');
  const routes = routesOfDay(itineraryId).filter(Boolean) as NonNullable<ReturnType<typeof routesOfDay>[number]>[];
  let ok = 0, miss = 0;
  for (const r of routes) {
    try { (await syncRouteFromGoogle(r.id)) ? ok++ : miss++; } catch (e) { if (ok === 0) throw e; miss++; }
  }
  return { ok, miss, total: routes.length, places: dayPlaces(itineraryId).length };
}
