/**
 * Google Maps Platform, called straight from the browser with a referrer-restricted key:
 *  - Maps JavaScript API  → real map tiles (components/planner/GoogleMap.tsx)
 *  - Places API (New)     → place search + details (address, coordinates, opening hours)
 *  - Routes API           → real travel time / distance / transit fare between places
 * Required APIs to enable in Google Cloud: Maps JavaScript API, Places API (New), Routes API.
 */
import { TransportMode } from '@/types/models';
import { apiSettings } from './settings';

const key = () => apiSettings().googleMapsKey;
export const googleReady = () => !!key();

async function gfetch<T>(url: string, init: RequestInit & { fieldMask?: string } = {}): Promise<T> {
  const { fieldMask, ...rest } = init;
  const r = await fetch(url, {
    ...rest,
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key(), ...(fieldMask ? { 'X-Goog-FieldMask': fieldMask } : {}), ...(rest.headers ?? {}) },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(googleError(j?.error?.message ?? `HTTP ${r.status}`));
  return j as T;
}

/** Turn Google's English errors into something actionable. */
function googleError(msg: string) {
  if (/not valid/i.test(msg)) return 'Google API 키가 올바르지 않아요. MY PROFILE › API 설정을 확인해 주세요.';
  if (/referer|referrer/i.test(msg)) return '이 주소에서는 키를 쓸 수 없게 제한돼 있어요. Google Cloud의 키 제한(웹사이트)에 이 사이트 주소를 추가해 주세요.';
  if (/has not been used|is disabled|not enabled/i.test(msg)) return '필요한 Google API가 켜져 있지 않아요 (Places API (New) / Routes API). Google Cloud에서 사용 설정해 주세요.';
  if (/billing/i.test(msg)) return 'Google Cloud 결제 계정이 연결되어 있지 않아요.';
  return `Google API 오류: ${msg}`;
}

/* ---------------- Maps JavaScript API loader ---------------- */

export const MAPS_AUTH_MSG = 'Google 지도 인증 실패: 키, Maps JavaScript API 사용 설정, 웹사이트 제한을 확인해 주세요.';
export let mapsAuthFailed = false;
let mapsPromise: Promise<any> | null = null;
let loadedKey = '';
export function loadGoogleMaps(): Promise<any> {
  const k = key();
  if (!k) return Promise.reject(new Error('Google Maps API 키가 없어요.'));
  if (mapsPromise && loadedKey === k) return mapsPromise;
  if (loadedKey && loadedKey !== k && (window as any).google?.maps) { return Promise.reject(new Error('API 키를 바꿨어요. 페이지를 새로고침하면 새 키로 지도를 불러와요.')); }
  loadedKey = k;
  mapsPromise = new Promise((resolve, reject) => {
    const w = window as any;
    if (w.google?.maps?.importLibrary) return resolve(w.google.maps);
    const cb = '__mtlGoogleMapsReady';
    w[cb] = () => resolve(w.google.maps);
    // Google calls this (even after load) when the key is invalid or the site isn't allowed.
    w.gm_authFailure = () => {
      mapsAuthFailed = true;
      reject(new Error(MAPS_AUTH_MSG));
      window.dispatchEvent(new Event('mtl-gmaps-auth-failed'));
    };
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(k)}&v=weekly&loading=async&language=ko&region=KR&callback=${cb}`;
    s.async = true;
    s.onerror = () => { mapsPromise = null; reject(new Error('Google Maps를 불러오지 못했어요 (오프라인일 수 있어요).')); };
    document.head.appendChild(s);
  });
  return mapsPromise;
}

/* ---------------- Places API (New) ---------------- */

export interface PlaceSuggestion { placeId: string; main: string; secondary: string }
export interface PlaceDetail {
  name: string; address: string; lat: number; lng: number;
  openTime?: string; closeTime?: string; closedDays?: number[]; googleMapsUri?: string;
}

export const newSessionToken = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

export async function autocompletePlaces(input: string, sessionToken: string, near?: { lat: number; lng: number }): Promise<PlaceSuggestion[]> {
  const body: Record<string, unknown> = { input, languageCode: 'ko', sessionToken };
  if (near) body.locationBias = { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 40000 } };
  const j = await gfetch<{ suggestions?: { placePrediction?: { placeId: string; text?: { text: string }; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } } } }[] }>(
    'https://places.googleapis.com/v1/places:autocomplete', { method: 'POST', body: JSON.stringify(body) });
  return (j.suggestions ?? []).flatMap((s) => (s.placePrediction ? [{
    placeId: s.placePrediction.placeId,
    main: s.placePrediction.structuredFormat?.mainText?.text ?? s.placePrediction.text?.text ?? '',
    secondary: s.placePrediction.structuredFormat?.secondaryText?.text ?? '',
  }] : []));
}

const hhmm = (h?: number, m?: number) => (h == null ? undefined : `${String(h).padStart(2, '0')}:${String(m ?? 0).padStart(2, '0')}`);

export async function placeDetails(placeId: string, sessionToken: string): Promise<PlaceDetail> {
  const j = await gfetch<any>(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=ko&sessionToken=${encodeURIComponent(sessionToken)}`,
    { method: 'GET', fieldMask: 'displayName,formattedAddress,location,regularOpeningHours,googleMapsUri' });
  const periods: { open?: { day: number; hour: number; minute: number }; close?: { day: number; hour: number; minute: number } }[] = j.regularOpeningHours?.periods ?? [];
  // Use the most common opening/closing time; days without any period are closed days.
  const pick = (xs: (string | undefined)[]) => { const c: Record<string, number> = {}; xs.forEach((x) => x && (c[x] = (c[x] ?? 0) + 1)); return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0]; };
  const always = periods.length === 1 && periods[0].open && !periods[0].close; // open 24h
  const openDays = new Set(periods.map((p) => p.open?.day));
  return {
    name: j.displayName?.text ?? '',
    address: j.formattedAddress ?? '',
    lat: j.location?.latitude,
    lng: j.location?.longitude,
    googleMapsUri: j.googleMapsUri,
    openTime: always ? undefined : pick(periods.map((p) => hhmm(p.open?.hour, p.open?.minute))),
    closeTime: always ? undefined : pick(periods.map((p) => hhmm(p.close?.hour, p.close?.minute))),
    closedDays: periods.length && !always ? [0, 1, 2, 3, 4, 5, 6].filter((d) => !openDays.has(d)) : undefined,
  };
}

/* ---------------- Routes API ---------------- */

const TRAVEL_MODE: Record<TransportMode, 'WALK' | 'TRANSIT' | 'DRIVE'> = { walk: 'WALK', subway: 'TRANSIT', bus: 'TRANSIT', train: 'TRANSIT', taxi: 'DRIVE', rentcar: 'DRIVE' };

export interface RouteResult { distanceKm: number; durationMin: number; transfers?: number; fare?: { currency: string; amount: number } }

export async function computeRoute(a: { lat: number; lng: number }, b: { lat: number; lng: number }, mode: TransportMode): Promise<RouteResult | null> {
  const travelMode = TRAVEL_MODE[mode];
  const body: Record<string, unknown> = {
    origin: { location: { latLng: { latitude: a.lat, longitude: a.lng } } },
    destination: { location: { latLng: { latitude: b.lat, longitude: b.lng } } },
    travelMode, languageCode: 'ko', units: 'METRIC',
  };
  if (travelMode === 'DRIVE') body.routingPreference = 'TRAFFIC_UNAWARE';
  if (travelMode === 'TRANSIT' && (mode === 'bus' || mode === 'subway' || mode === 'train')) {
    body.transitPreferences = { allowedTravelModes: [mode === 'bus' ? 'BUS' : mode === 'train' ? 'TRAIN' : 'SUBWAY', ...(mode === 'subway' ? ['LIGHT_RAIL', 'RAIL'] : [])] };
  }
  const j = await gfetch<any>('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST', body: JSON.stringify(body),
    fieldMask: 'routes.distanceMeters,routes.duration,routes.travelAdvisory.transitFare,routes.legs.steps.travelMode',
  });
  let r = j.routes?.[0];
  if (!r && travelMode === 'TRANSIT' && body.transitPreferences) {
    // No route with only that vehicle type → retry with any public transport
    delete body.transitPreferences;
    const j2 = await gfetch<any>('https://routes.googleapis.com/directions/v2:computeRoutes', { method: 'POST', body: JSON.stringify(body), fieldMask: 'routes.distanceMeters,routes.duration,routes.travelAdvisory.transitFare,routes.legs.steps.travelMode' });
    r = j2.routes?.[0];
  }
  if (!r) return null;
  const transitSteps = (r.legs ?? []).flatMap((l: any) => l.steps ?? []).filter((s: any) => s.travelMode === 'TRANSIT').length;
  const fare = r.travelAdvisory?.transitFare;
  return {
    distanceKm: Math.round(((r.distanceMeters ?? 0) / 1000) * 10) / 10,
    durationMin: Math.max(1, Math.round(parseInt(String(r.duration ?? '0').replace('s', ''), 10) / 60)),
    transfers: travelMode === 'TRANSIT' ? Math.max(0, transitSteps - 1) : undefined,
    fare: fare ? { currency: fare.currencyCode, amount: Number(fare.units ?? 0) + (fare.nanos ?? 0) / 1e9 } : undefined,
  };
}
