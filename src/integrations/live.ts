/**
 * Live data that needs no API key and can be called straight from the browser
 * (works the same on GitHub Pages, PC and the iPhone home-screen app).
 *
 *  - FX:      ExchangeRate-API open endpoint (open.er-api.com), Frankfurter as fallback
 *  - Weather: Open-Meteo geocoding + forecast (≤16 days) + archive (past / last year)
 *
 * Results are cached in localStorage so the app still shows the last known values offline.
 */
import { CurrencyCode, Trip } from '@/types/models';
import { DESTINATIONS } from '@/db/destinations';
import { notify } from '@/db/database';

const CURRENCY_CODES: CurrencyCode[] = ['USD', 'JPY', 'EUR', 'TWD', 'THB', 'GBP', 'CNY', 'VND', 'HKD'];

const read = <T,>(k: string): T | undefined => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : undefined; } catch { return undefined; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full — live cache is optional */ } };

async function getJSON<T>(url: string, timeoutMs = 8000): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as T;
  } finally { clearTimeout(t); }
}

/* ======================= FX ======================= */

export interface LiveFx {
  /** KRW per 1 unit of each currency */
  rates: Partial<Record<CurrencyCode, number>>;
  /** When the provider last updated its rates */
  asOf: string;
  fetchedAt: number;
  provider: string;
}
const FX_KEY = 'my-travel-log:live-fx:v1';
const FX_TTL = 3 * 60 * 60 * 1000; // 3h
let fx: LiveFx | undefined = read<LiveFx>(FX_KEY);
let fxLoading: Promise<void> | null = null;

export const liveFx = () => fx;

/** KRW per unit, rounded so it reads naturally (e.g. JPY 9.12, USD 1,380.5). */
const round = (v: number) => (v >= 100 ? Math.round(v * 10) / 10 : v >= 1 ? Math.round(v * 100) / 100 : Math.round(v * 10000) / 10000);

export function refreshLiveFx(force = false): Promise<void> {
  if (!force && fx && Date.now() - fx.fetchedAt < FX_TTL) return Promise.resolve();
  if (fxLoading) return fxLoading;
  fxLoading = (async () => {
    try {
      const j = await getJSON<{ result: string; rates: Record<string, number>; time_last_update_utc: string }>('https://open.er-api.com/v6/latest/KRW');
      if (j.result !== 'success') throw new Error('er-api failed');
      const rates: LiveFx['rates'] = {};
      CURRENCY_CODES.forEach((c) => { if (j.rates[c]) rates[c] = round(1 / j.rates[c]); });
      fx = { rates, asOf: new Date(j.time_last_update_utc).toISOString(), fetchedAt: Date.now(), provider: 'ExchangeRate-API' };
    } catch {
      try {
        const j = await getJSON<{ date: string; rates: Record<string, number> }>(`https://api.frankfurter.dev/v1/latest?base=KRW&symbols=${CURRENCY_CODES.join(',')}`);
        const rates: LiveFx['rates'] = { ...(fx?.rates ?? {}) };
        Object.entries(j.rates).forEach(([c, v]) => { rates[c as CurrencyCode] = round(1 / v); });
        fx = { rates, asOf: new Date(j.date).toISOString(), fetchedAt: Date.now(), provider: 'Frankfurter (ECB)' };
      } catch { return; /* offline: keep last cached values */ }
    }
    write(FX_KEY, fx);
    notify();
  })().finally(() => { fxLoading = null; });
  return fxLoading;
}

/* ======================= Weather ======================= */

export interface DayWeather { date: string; code: number; max: number; min: number; rainPct?: number; rainMm?: number }
export interface TripWeather {
  kind: 'forecast' | 'actual' | 'lastYear';
  label: string;
  place: string;
  days: DayWeather[];
}

const GEO_KEY = 'my-travel-log:geo:v1';
const WX_KEY = 'my-travel-log:weather:v1';
const WX_TTL = 3 * 60 * 60 * 1000;
type Geo = { lat: number; lng: number; name: string };
const geoCache: Record<string, Geo | null> = read(GEO_KEY) ?? {};
const wxCache: Record<string, { at: number; data: TripWeather | null }> = read(WX_KEY) ?? {};

/** English city name helps the geocoder; falls back to the Korean name. */
export function cityQuery(trip: Pick<Trip, 'city' | 'destinationId'>) {
  const d = DESTINATIONS.find((x) => x.id === trip.destinationId) ?? DESTINATIONS.find((x) => x.city === trip.city);
  return d?.cityEn ?? trip.city;
}

export async function geocode(name: string): Promise<Geo | null> {
  if (name in geoCache) return geoCache[name];
  const j = await getJSON<{ results?: { latitude: number; longitude: number; name: string }[] }>(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=ko`);
  const r = j.results?.[0];
  geoCache[name] = r ? { lat: r.latitude, lng: r.longitude, name: r.name } : null;
  write(GEO_KEY, geoCache);
  return geoCache[name];
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (s: string, n: number) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return iso(d); };
const minusYear = (s: string) => `${Number(s.slice(0, 4)) - 1}${s.slice(4)}`;

export async function tripWeather(trip: Trip): Promise<TripWeather | null> {
  const key = `${trip.id}|${trip.city}|${trip.startDate}|${trip.endDate}`;
  const hit = wxCache[key];
  if (hit && Date.now() - hit.at < WX_TTL) return hit.data;

  const geo = await geocode(cityQuery(trip));
  if (!geo) return null;
  const today = iso(new Date());
  const lastForecastDay = addDays(today, 15);
  const end = trip.endDate < trip.startDate ? trip.startDate : trip.endDate;
  const { lat, lng } = geo;
  let data: TripWeather;

  if (trip.startDate <= lastForecastDay && end >= today) {
    // Upcoming / ongoing and inside the 16-day forecast window
    const s = trip.startDate < today ? today : trip.startDate;
    const e = end > lastForecastDay ? lastForecastDay : end;
    const j = await getJSON<any>(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&start_date=${s}&end_date=${e}`);
    data = { kind: 'forecast', label: '일기예보', place: geo.name, days: j.daily.time.map((d: string, i: number) => ({ date: d, code: j.daily.weather_code[i], max: j.daily.temperature_2m_max[i], min: j.daily.temperature_2m_min[i], rainPct: j.daily.precipitation_probability_max?.[i] ?? undefined })) };
  } else {
    // Past trip → the actual weather. Far-future trip → same dates last year, as a reference.
    const past = end < today;
    const s = past ? trip.startDate : minusYear(trip.startDate);
    let e = past ? end : minusYear(end);
    const archiveLimit = addDays(today, -6); // archive lags ~5 days
    if (e > archiveLimit) e = archiveLimit;
    if (s > e) return null;
    const j = await getJSON<any>(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto&start_date=${s}&end_date=${e}`);
    data = {
      kind: past ? 'actual' : 'lastYear', label: past ? '여행 당시 실제 날씨' : '작년 같은 기간 날씨 (참고)', place: geo.name,
      days: j.daily.time.map((d: string, i: number) => ({ date: past ? d : `${Number(d.slice(0, 4)) + 1}${d.slice(4)}`, code: j.daily.weather_code[i], max: j.daily.temperature_2m_max[i], min: j.daily.temperature_2m_min[i], rainMm: j.daily.precipitation_sum?.[i] ?? undefined })),
    };
  }
  data.days = data.days.filter((d) => d.max != null && d.min != null);
  wxCache[key] = { at: Date.now(), data };
  write(WX_KEY, wxCache);
  return data;
}

/** WMO weather code → Korean label + emoji */
export function wmo(code: number): { icon: string; label: string; rainy: boolean } {
  if (code === 0) return { icon: '☀️', label: '맑음', rainy: false };
  if (code <= 2) return { icon: '🌤️', label: '구름 조금', rainy: false };
  if (code === 3) return { icon: '☁️', label: '흐림', rainy: false };
  if (code <= 48) return { icon: '🌫️', label: '안개', rainy: false };
  if (code <= 57) return { icon: '🌦️', label: '이슬비', rainy: true };
  if (code <= 67) return { icon: '🌧️', label: '비', rainy: true };
  if (code <= 77) return { icon: '🌨️', label: '눈', rainy: true };
  if (code <= 82) return { icon: '🌧️', label: '소나기', rainy: true };
  if (code <= 86) return { icon: '🌨️', label: '눈보라', rainy: true };
  return { icon: '⛈️', label: '뇌우', rainy: true };
}
