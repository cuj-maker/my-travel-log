/**
 * Free, no-sign-up services built on OpenStreetMap (used when no Google key is set):
 *  - Photon (komoot)              → place search as you type
 *  - OSRM @ routing.openstreetmap.de (FOSSGIS) → real walking / driving routes
 * Public community servers: fine for personal use, please don't hammer them.
 * Public transport routing has no free key-less service → transit legs stay estimates.
 */
import { TransportMode } from '@/types/models';
import { haversineKm } from '@/services/plannerService';
import type { PlaceDetail, PlaceSuggestion, RouteResult } from './google';

export interface OsmSuggestion extends PlaceSuggestion { detail: PlaceDetail; km?: number }

const KIND: Record<string, string> = {
  museum: '박물관', attraction: '관광지', restaurant: '음식점', cafe: '카페', hotel: '호텔', guest_house: '게스트하우스', hostel: '호스텔',
  park: '공원', viewpoint: '전망대', gallery: '갤러리', station: '역', bar: '바', pub: '펍', fast_food: '패스트푸드', bakery: '베이커리',
  supermarket: '슈퍼마켓', mall: '쇼핑몰', department_store: '백화점', place_of_worship: '종교시설', castle: '성', monument: '기념물', zoo: '동물원', aquarium: '아쿠아리움',
};

export async function photonSearch(q: string, near?: { lat: number; lng: number }): Promise<OsmSuggestion[]> {
  const p = new URLSearchParams({ q, limit: '10' });
  if (near) { p.set('lat', String(near.lat)); p.set('lon', String(near.lng)); p.set('location_bias_scale', '0.5'); }
  const r = await fetch(`https://photon.komoot.io/api/?${p}`);
  if (!r.ok) throw new Error('장소 검색 서버가 응답하지 않아요. 잠시 후 다시 시도해 주세요.');
  const j = await r.json();
  const all: OsmSuggestion[] = (j.features ?? []).map((f: any) => {
    const pr = f.properties ?? {};
    const [lng, lat] = f.geometry?.coordinates ?? [];
    const street = [pr.street, pr.housenumber].filter(Boolean).join(' ');
    const address = [street, pr.district, pr.city ?? pr.county, pr.country].filter(Boolean).join(', ');
    const name = pr.name ?? street ?? pr.city ?? q;
    const km = near && lat != null ? haversineKm(near, { lat, lng }) : undefined;
    return {
      placeId: `${pr.osm_type}${pr.osm_id}`,
      main: name,
      secondary: [KIND[pr.osm_value], pr.city ?? pr.county, pr.country].filter(Boolean).join(' · '),
      detail: { name, address, lat, lng },
      km,
    };
  }).filter((s: OsmSuggestion) => s.detail.lat != null);
  // Prefer results around the trip city; if nothing is nearby show everything.
  const nearby = all.filter((s) => s.km == null || s.km < 80);
  return (nearby.length ? nearby : all).slice(0, 6);
}

const PROFILE: Partial<Record<TransportMode, string>> = { walk: 'routed-foot/route/v1/foot', taxi: 'routed-car/route/v1/driving', rentcar: 'routed-car/route/v1/driving' };
export const osmRoutable = (mode: TransportMode) => !!PROFILE[mode];

export async function osrmRoute(a: { lat: number; lng: number }, b: { lat: number; lng: number }, mode: TransportMode): Promise<RouteResult | null> {
  const path = PROFILE[mode];
  if (!path) return null;
  const r = await fetch(`https://routing.openstreetmap.de/${path}/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false`);
  if (!r.ok) throw new Error('경로 서버가 응답하지 않아요. 잠시 후 다시 시도해 주세요.');
  const j = await r.json();
  const route = j.routes?.[0];
  if (j.code !== 'Ok' || !route) return null;
  // City driving: OSRM assumes free-flowing traffic, add a little for lights/traffic.
  const minutes = route.duration / 60 * (mode === 'walk' ? 1 : 1.25);
  return { distanceKm: Math.round(route.distance / 100) / 10, durationMin: Math.max(1, Math.round(minutes)) };
}
