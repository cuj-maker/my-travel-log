/**
 * Live flight prices via the user's own proxy (flight-proxy/ → Cloudflare Worker → SerpApi Google Flights).
 * The SerpApi key never reaches the browser.
 */
import { apiSettings } from './settings';

export interface LiveLeg {
  airline: string; flightNo: string; from: string; fromName?: string; depart: string; to: string; toName?: string; arrive: string;
  durationMin: number; travelClass?: string; airplane?: string; overnight?: boolean;
}
export interface LiveFlightOption {
  priceKRW: number | null; totalMin: number; stops: number; best?: boolean; logo?: string; carbonKg?: number;
  layovers: { airport: string; name?: string; minutes: number; overnight?: boolean }[];
  legs: LiveLeg[];
}
export interface LiveFlightResult {
  query: { from: string; to: string; date: string; return: string | null; adults: number; roundTrip: boolean };
  fetchedAt: string; cached?: boolean;
  priceInsights: { lowest?: number; level?: string; typical?: [number, number] } | null;
  googleFlightsUrl?: string;
  options: LiveFlightOption[];
}

export const flightProxyReady = () => !!apiSettings().flightProxyUrl;

export async function searchLiveFlights(q: { from: string; to: string; date: string; ret?: string; adults: number }): Promise<LiveFlightResult> {
  const base = apiSettings().flightProxyUrl;
  if (!base) throw new Error('항공권 중계 서버 주소가 없어요 (MY PROFILE › API 설정).');
  const p = new URLSearchParams({ from: q.from.toUpperCase(), to: q.to.toUpperCase(), date: q.date, adults: String(q.adults) });
  if (q.ret) p.set('return', q.ret);
  let r: Response;
  try { r = await fetch(`${base}/flights?${p}`); } catch { throw new Error('중계 서버에 연결하지 못했어요. 주소와 ALLOWED_ORIGINS 설정을 확인해 주세요.'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `중계 서버 오류 (${r.status})`);
  return j as LiveFlightResult;
}

export async function pingFlightProxy(url: string) {
  const r = await fetch(`${url.replace(/\/+$/, '')}/health`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j as { ok: boolean; hasKey: boolean };
}

export const PRICE_LEVEL: Record<string, string> = { low: '평소보다 저렴', typical: '보통 수준', high: '평소보다 비쌈' };
