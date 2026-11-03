/**
 * Phase 3 planner logic. Distances are straight-line (haversine) and all travel
 * times/costs are rough ESTIMATES until a routing API is connected (integrations/).
 */
import * as db from '@/db/database';
import { ID, ItineraryDay, Place, PlaceCategory, Route, TransportMode } from '@/types/models';

/* ---------------- geo & estimates ---------------- */

export const MODE_LABEL: Record<TransportMode, string> = { walk: '도보', subway: '지하철', bus: '버스', taxi: '택시', rentcar: '렌터카', train: '기차' };
export const MODES = Object.keys(MODE_LABEL) as TransportMode[];

export const hasGeo = <T extends { lat?: number; lng?: number }>(p: T): p is T & { lat: number; lng: number } => typeof p.lat === 'number' && typeof p.lng === 'number';

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// speed km/h, fixed wait minutes, base fare, per-km fare (KRW, rough sample values)
const MODE_MODEL: Record<TransportMode, { speed: number; wait: number; base: number; perKm: number }> = {
  walk: { speed: 4.5, wait: 0, base: 0, perKm: 0 },
  subway: { speed: 30, wait: 6, base: 1500, perKm: 90 },
  bus: { speed: 18, wait: 8, base: 1400, perKm: 50 },
  taxi: { speed: 25, wait: 3, base: 4000, perKm: 1100 },
  rentcar: { speed: 30, wait: 5, base: 0, perKm: 250 },
  train: { speed: 55, wait: 10, base: 2000, perKm: 140 },
};

/** Roads/paths are longer than straight lines. */
export const pathKm = (straightKm: number) => straightKm * 1.3;

export function estimateRoute(mode: TransportMode, straightKm: number) {
  const m = MODE_MODEL[mode], km = pathKm(straightKm);
  return {
    distanceKm: Math.round(km * 10) / 10,
    durationMin: Math.max(1, Math.round((km / m.speed) * 60 + m.wait)),
    estCostKRW: Math.round((m.base + m.perKm * km) / 100) * 100,
    transfers: mode === 'subway' && km > 6 ? 1 : mode === 'bus' && km > 10 ? 1 : 0,
  };
}

export function defaultMode(straightKm: number): TransportMode {
  const km = pathKm(straightKm);
  return km < 1.5 ? 'walk' : km < 15 ? 'subway' : 'taxi';
}

/* ---------------- time helpers ---------------- */

export const toMin = (t?: string) => (t && /^\d{2}:\d{2}$/.test(t) ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) : undefined);
export const fromMin = (m: number) => {
  const x = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
};
export const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}` : `${m}분`);

/* ---------------- queries ---------------- */

export const dayPlaces = (itineraryId: ID) => db.where('places', (p) => p.itineraryId === itineraryId).sort((a, b) => a.order - b.order);
export const tripDays = (tripId: ID) => db.byTrip('itineraries', tripId).sort((a, b) => a.dayIndex - b.dayIndex);
export const tripHotelPoint = (tripId: ID) => {
  const h = db.byTrip('hotels', tripId).find((x) => hasGeo(x));
  return h && hasGeo(h) ? { lat: h.lat, lng: h.lng, name: h.name } : undefined;
};
const routeOf = (from: ID, to: ID) => db.where('routes', (r) => r.fromPlaceId === from && r.toPlaceId === to)[0];
export const routesOfDay = (itineraryId: ID) => {
  const ps = dayPlaces(itineraryId);
  const out: (Route | undefined)[] = [];
  for (let i = 0; i < ps.length - 1; i++) out.push(routeOf(ps[i].id, ps[i + 1].id));
  return out;
};

/* ---------------- recalculation ---------------- */

/** Rebuild the Route rows for a day (called after every place change). */
export function recalcDay(itineraryId: ID) {
  const day = db.get('itineraries', itineraryId);
  if (!day) return;
  const ps = dayPlaces(itineraryId);
  const keep = new Set<ID>();
  for (let i = 0; i < ps.length - 1; i++) {
    const a = ps[i], b = ps[i + 1];
    if (!hasGeo(a) || !hasGeo(b)) continue;
    const km = haversineKm(a, b);
    const old = routeOf(a.id, b.id);
    const mode = old?.mode ?? defaultMode(km);
    const est = estimateRoute(mode, km);
    if (old) { db.update('routes', old.id, { ...est, mode }); keep.add(old.id); }
    else keep.add(db.insert('routes', { tripId: day.tripId, fromPlaceId: a.id, toPlaceId: b.id, mode, source: 'estimate', ...est }).id);
  }
  const ids = new Set(ps.map((p) => p.id));
  db.byTrip('routes', day.tripId).filter((r) => (ids.has(r.fromPlaceId) || ids.has(r.toPlaceId)) && !keep.has(r.id)).forEach((r) => db.remove('routes', r.id));
}

export const recalcTrip = (tripId: ID) => tripDays(tripId).forEach((d) => recalcDay(d.id));

export function setRouteMode(routeId: ID, mode: TransportMode) {
  const r = db.get('routes', routeId);
  const a = r && db.get('places', r.fromPlaceId), b = r && db.get('places', r.toPlaceId);
  if (!r || !a || !b || !hasGeo(a) || !hasGeo(b)) return;
  db.update('routes', routeId, { mode, source: 'user', ...estimateRoute(mode, haversineKm(a, b)) });
}

function sortByTime(itineraryId: ID) {
  const ps = dayPlaces(itineraryId);
  const slots = ps.map((p, i) => (p.time ? i : -1)).filter((i) => i >= 0);
  const timed = slots.map((i) => ps[i]).sort((a, b) => a.time!.localeCompare(b.time!));
  const next = [...ps];
  slots.forEach((slot, k) => (next[slot] = timed[k]));
  next.forEach((p, i) => p.order !== i && db.update('places', p.id, { order: i }));
}

/* ---------------- place CRUD ---------------- */

export type PlaceInput = Omit<Place, 'id' | 'createdAt' | 'updatedAt' | 'isSample' | 'order'>;

export function addPlace(data: PlaceInput) {
  const row = db.insert('places', { ...data, order: dayPlaces(data.itineraryId).length });
  sortByTime(data.itineraryId);
  recalcDay(data.itineraryId);
  return row;
}

/** Reuse a saved place (name, coords, hours…) on another day; time/booking links are not copied. */
export function copyPlaceToDay(src: Place, tripId: ID, itineraryId: ID) {
  const { name, category, address, lat, lng, image, purpose, stayMin, estCostKRW, memo, openTime, closeTime, closedDays, indoor } = src;
  return addPlace({ tripId, itineraryId, name, category, address, lat, lng, image, purpose, stayMin, estCostKRW, memo, openTime, closeTime, closedDays, indoor, visited: false });
}

export function savePlace(id: ID, patch: Partial<Place>) {
  const old = db.get('places', id);
  if (!old) return;
  db.update('places', id, patch);
  if (patch.itineraryId && patch.itineraryId !== old.itineraryId) {
    db.update('places', id, { order: dayPlaces(patch.itineraryId).length - 0 });
    dayPlaces(old.itineraryId).forEach((p, i) => p.order !== i && db.update('places', p.id, { order: i }));
    sortByTime(old.itineraryId);
    recalcDay(old.itineraryId);
  }
  const target = patch.itineraryId ?? old.itineraryId;
  sortByTime(target);
  recalcDay(target);
}

export function removePlace(id: ID) {
  const p = db.get('places', id);
  if (!p) return;
  db.remove('places', id);
  dayPlaces(p.itineraryId).forEach((x, i) => x.order !== i && db.update('places', x.id, { order: i }));
  recalcDay(p.itineraryId);
}

/** Swap with the nearest movable (non-linked) neighbour. */
export function movePlace(id: ID, dir: -1 | 1) {
  const p = db.get('places', id);
  if (!p || p.linkedType) return;
  const ps = dayPlaces(p.itineraryId);
  const i = ps.findIndex((x) => x.id === id);
  let j = i + dir;
  while (j >= 0 && j < ps.length && ps[j].linkedType) j += dir;
  if (j < 0 || j >= ps.length) return;
  db.update('places', ps[i].id, { order: ps[j].order });
  db.update('places', ps[j].id, { order: ps[i].order });
  recalcDay(p.itineraryId);
}

export function applyOrder(itineraryId: ID, orderedIds: ID[], times?: Record<ID, string>) {
  orderedIds.forEach((pid, i) => db.update('places', pid, { order: i, ...(times?.[pid] ? { time: times[pid] } : {}) }));
  recalcDay(itineraryId);
}

export function renameDay(id: ID, title: string) { db.update('itineraries', id, { title: title.trim() || undefined }); }

/* ---------------- analysis ---------------- */

export interface DayStats { travelMin: number; stayMin: number; transportKRW: number; placesKRW: number; spanMin?: number }
export interface DayIssue { level: 'warn' | 'info'; text: string }

export function analyzeDay(day: ItineraryDay): { stats: DayStats; issues: DayIssue[] } {
  const ps = dayPlaces(day.id);
  const routes = routesOfDay(day.id);
  const issues: DayIssue[] = [];
  const travelMin = routes.reduce((s, r) => s + (r?.durationMin ?? 0), 0);
  const transportKRW = routes.reduce((s, r) => s + (r?.estCostKRW ?? 0), 0);
  const stayMin = ps.reduce((s, p) => s + (p.stayMin ?? 0), 0);
  const placesKRW = ps.reduce((s, p) => s + (p.estCostKRW ?? 0), 0);
  const first = toMin(ps.find((p) => p.time)?.time), lastP = [...ps].reverse().find((p) => p.time);
  const last = lastP ? toMin(lastP.time)! + (lastP.stayMin ?? 0) : undefined;
  const spanMin = first !== undefined && last !== undefined ? last - first : undefined;

  if (travelMin + stayMin > 600) issues.push({ level: 'warn', text: `하루 활동(이동+체류)이 ${fmtMin(travelMin + stayMin)}로 빡빡해요. 장소를 줄이거나 나눠 보세요.` });
  if (travelMin > 180) issues.push({ level: 'warn', text: `하루 이동시간이 ${fmtMin(travelMin)}예요. 가까운 곳끼리 묶는 동선 최적화를 권장해요.` });
  if (ps.filter((p) => !p.linkedType).length > 6) issues.push({ level: 'info', text: '하루 방문 장소가 6곳을 넘어요.' });

  const dow = new Date(day.date + 'T00:00:00').getDay();
  const names = ['일', '월', '화', '수', '목', '금', '토'];
  ps.forEach((p, i) => {
    if (p.closedDays?.includes(dow)) issues.push({ level: 'warn', text: `「${p.name}」은(는) ${names[dow]}요일 휴무로 입력되어 있어요.` });
    const t = toMin(p.time), open = toMin(p.openTime), close = toMin(p.closeTime);
    if (t !== undefined && open !== undefined && t < open) issues.push({ level: 'warn', text: `「${p.name}」 도착(${p.time})이 오픈(${p.openTime}) 전이에요.` });
    if (t !== undefined && close !== undefined && t + (p.stayMin ?? 0) > close) issues.push({ level: 'warn', text: `「${p.name}」 체류가 마감(${p.closeTime})을 넘겨요.` });
    const nxt = ps[i + 1];
    if (nxt && t !== undefined && toMin(nxt.time) !== undefined) {
      const need = t + (p.stayMin ?? 0) + (routes[i]?.durationMin ?? 0);
      if (toMin(nxt.time)! < need) issues.push({ level: 'warn', text: `「${p.name}」→「${nxt.name}」 이동이 시간에 맞지 않아요 (${fromMin(need)} 도착 예상, 일정은 ${nxt.time}).` });
    }
  });
  const timed = ps.filter((p) => p.time);
  if (timed.some((p, i) => i > 0 && p.time! < timed[i - 1].time!)) issues.push({ level: 'info', text: '순서와 시간이 서로 맞지 않는 장소가 있어요. ‘시간 정렬’이나 ‘동선 최적화’를 사용해 보세요.' });
  const meal = (a: number, b: number) => ps.some((p) => p.category === '맛집' && toMin(p.time) !== undefined && toMin(p.time)! >= a && toMin(p.time)! <= b);
  if (ps.some((p) => !p.linkedType) && timed.length > 2 && !meal(690, 840)) issues.push({ level: 'info', text: '점심시간대(11:30~14:00) 식사 일정이 없어요.' });
  const noGeo = ps.filter((p) => !hasGeo(p) && !p.linkedType).length;
  if (noGeo) issues.push({ level: 'info', text: `좌표가 없는 장소 ${noGeo}곳은 지도와 이동시간 계산에서 빠져요.` });
  return { stats: { travelMin, stayMin, transportKRW, placesKRW, spanMin }, issues };
}

/* ---------------- optimizer ---------------- */

export interface OptimizeResult { orderIds: ID[]; times: Record<ID, string>; beforeKm: number; afterKm: number; beforeMin: number; afterMin: number; skipped: number; moved: boolean }

const straightBetween = (a?: Place, b?: Place) => (a && b && hasGeo(a) && hasGeo(b) ? haversineKm(a, b) : undefined);
const legKm = (ps: Place[]) => ps.reduce((s, p, i) => { const km = i ? straightBetween(ps[i - 1], p) : undefined; return km === undefined ? s : s + pathKm(km); }, 0);
const legMin = (ps: Place[]) => ps.reduce((s, p, i) => { const km = i ? straightBetween(ps[i - 1], p) : undefined; return km === undefined ? s : s + estimateRoute(defaultMode(km), km).durationMin; }, 0);

/** Booking-linked, reserved, or timed meals keep their slot and time. */
const fixedTime = (p: Place) => (!!p.linkedType || !!p.needsReservation || p.category === '맛집') && !!p.time;

/**
 * Time-aware nearest-neighbour scheduler. Fixed items (booking-linked, reserved or timed
 * meals) keep their times; free places fill the gaps nearest-first, starting from the hotel,
 * and only if they still leave time to reach the next fixed item. Opening hours are
 * respected and meals are not placed before 11:30. Places without coordinates go last.
 */
export function optimizeDay(day: ItineraryDay, startTime = '09:00'): OptimizeResult {
  const ps = dayPlaces(day.id);
  const hotel = tripHotelPoint(day.tripId);
  const fixed = ps.filter(fixedTime).sort((a, b) => a.time!.localeCompare(b.time!));
  const free = ps.filter((p) => !fixedTime(p));
  const geoFree = free.filter(hasGeo), noGeo = free.filter((p) => !hasGeo(p));
  const travel = (a?: { lat?: number; lng?: number }, b?: { lat?: number; lng?: number }) => {
    if (!a || !b || !hasGeo(a) || !hasGeo(b)) return 0;
    const km = haversineKm(a, b);
    return estimateRoute(defaultMode(km), km).durationMin;
  };
  const dist = (a: { lat?: number; lng?: number } | undefined, b: Place) => (a && hasGeo(a) && hasGeo(b) ? haversineKm(a, b) : 0);

  const result: Place[] = [];
  const times: Record<ID, string> = {};
  let clock = toMin(startTime)!;
  let cur: { lat?: number; lng?: number } | undefined = hotel;

  const arrival = (c: Place) => {
    let t = clock + travel(cur, c);
    const open = toMin(c.openTime);
    if (open !== undefined && t < open) t = open;
    if (c.category === '맛집' && t < 690) t = 690;
    return t;
  };

  for (const f of [...fixed, undefined]) {
    const limit = f ? toMin(f.time) : undefined;
    for (;;) {
      const ranked = [...geoFree].sort((a, b) => dist(cur, a) - dist(cur, b));
      const fit = ranked.find((c) => limit === undefined || arrival(c) + (c.stayMin ?? 60) + travel(c, f) <= limit);
      if (!fit) break;
      const at = arrival(fit);
      times[fit.id] = fromMin(at);
      result.push(fit);
      geoFree.splice(geoFree.indexOf(fit), 1);
      clock = at + (fit.stayMin ?? 60);
      cur = fit;
    }
    if (f) {
      result.push(f);
      clock = Math.max(clock, toMin(f.time)!) + (f.stayMin ?? 0);
      cur = hasGeo(f) ? f : cur;
    }
  }
  noGeo.forEach((p) => { result.push(p); });

  const moved = result.some((p, i) => p.id !== ps[i]?.id);
  return { orderIds: result.map((p) => p.id), times, beforeKm: legKm(ps), afterKm: legKm(result), beforeMin: legMin(ps), afterMin: legMin(result), skipped: noGeo.length, moved };
}

/* ---------------- suggestions ---------------- */

export interface Suggestion { place: Place; km: number; from: string }

/** Nearby places the user already saved in other days/trips (no external search API yet). */
export function nearbySuggestions(day: ItineraryDay, categories: PlaceCategory[], limit = 4): Suggestion[] {
  const ps = dayPlaces(day.id);
  const anchor = ps.filter(hasGeo)[0] ?? tripHotelPoint(day.tripId);
  if (!anchor) return [];
  const onDay = new Set(ps.map((p) => p.name));
  const seen = new Set<string>();
  return db.all('places')
    .filter((p) => hasGeo(p) && p.itineraryId !== day.id && categories.includes(p.category) && !onDay.has(p.name) && !p.linkedType)
    .map((p) => ({ place: p, km: haversineKm(anchor as { lat: number; lng: number }, p as { lat: number; lng: number }), from: db.get('trips', p.tripId)?.city ?? '' }))
    .filter((s) => s.km < 25)
    .sort((a, b) => a.km - b.km)
    .filter((s) => (seen.has(s.place.name) ? false : (seen.add(s.place.name), true)))
    .slice(0, limit);
}

/** Outdoor stops of the day, with indoor swaps from the same trip. */
export function rainPlan(day: ItineraryDay) {
  const ps = dayPlaces(day.id);
  const outdoor = ps.filter((p) => !p.linkedType && !p.indoor && ['관광지', '액티비티'].includes(p.category));
  const pool = db.byTrip('places', day.tripId).filter((p) => p.itineraryId !== day.id && !p.linkedType && (p.indoor || ['카페', '쇼핑', '맛집'].includes(p.category)));
  return { outdoor, alternatives: pool.slice(0, 4) };
}

/* ---------------- budget hook ---------------- */

/** Estimated spend from the plan (place costs + transport), used by the budget page. */
export function plannedCosts(tripId: ID) {
  const placesKRW = db.byTrip('places', tripId).reduce((s, p) => s + (p.estCostKRW ?? 0), 0);
  const transportKRW = db.byTrip('routes', tripId).reduce((s, r) => s + (r.estCostKRW ?? 0), 0);
  return { placesKRW, transportKRW };
}
