/**
 * External API slots. Every provider is optional; while `connected` is false the UI must
 * label prices/routes as SAMPLE or user-entered and never claim real-time data.
 * To connect one in Phase 7, implement the interface and register it below.
 */
export interface Provider {
  id: string;
  label: string;
  phase: number;
  connected: boolean;
  note: string;
}

export interface FlightSearchProvider extends Provider { /* search(query): Promise<Flight[]> */ }
export interface HotelSearchProvider extends Provider { /* search(query): Promise<Hotel[]> */ }
export interface MapProvider extends Provider { /* renderMap(places): ... */ }
export interface RoutingProvider extends Provider { /* route(from, to, mode): Promise<Route> */ }
export interface FxProvider extends Provider { /* rate(from, to): Promise<number> */ }
export interface WeatherProvider extends Provider { /* forecast(city, dates) */ }
export interface LlmProvider extends Provider { /* recommend(profile, options) */ }

export const PROVIDERS: Provider[] = [
  { id: 'flights', label: '항공권 검색 API', phase: 7, connected: false, note: '실시간 가격 API는 미연결 · 스카이스캐너/구글 항공권 바로가기 링크 제공' },
  { id: 'hotels', label: '호텔 검색 API', phase: 7, connected: false, note: '실시간 가격 API는 미연결 · 부킹닷컴/호텔스닷컴/구글 호텔 바로가기 링크 제공' },
  { id: 'maps', label: '지도 API', phase: 3, connected: false, note: '연결 전: 간이 좌표 지도 사용' },
  { id: 'routing', label: '교통 경로 API', phase: 3, connected: false, note: '앱 안의 이동시간·교통비는 예상값 · 구간별 구글 지도 길찾기 링크 제공' },
  { id: 'fx', label: '환율 API', phase: 4, connected: true, note: 'ExchangeRate-API (키 불필요, 하루 1회 갱신) · 실패 시 Frankfurter → 샘플' },
  { id: 'weather', label: '날씨 API', phase: 7, connected: true, note: 'Open-Meteo (키 불필요) · 16일 예보 / 지난 여행은 실제 날씨 / 먼 여행은 작년 같은 기간' },
];

/** Live connection status, given the current API settings. */
export function providerStatus(s: { googleMapsKey: string; flightProxyUrl: string }): Provider[] {
  return PROVIDERS.map((p) => {
    if (p.id === 'maps' && s.googleMapsKey) return { ...p, connected: true, note: 'Google Maps JavaScript API + Places API (New) 장소 검색' };
    if (p.id === 'routing' && s.googleMapsKey) return { ...p, connected: true, note: 'Google Routes API · 일정에서 ‘실제 경로로 계산’을 누르면 반영' };
    if (p.id === 'maps') return { ...p, connected: true, note: 'OpenStreetMap 무료 지도 + Photon 장소 검색 (가입 불필요) · Google 키를 넣으면 Google로 전환' };
    if (p.id === 'routing') return { ...p, connected: true, note: '도보·택시·렌터카: OSRM 실제 경로 (가입 불필요) · 대중교통은 예상값 (Google 키 필요)' };
    if (p.id === 'flights' && s.flightProxyUrl) return { ...p, connected: true, note: '내 중계 서버 → SerpApi (Google 항공권) · 스카이스캐너 링크도 제공' };
    return p;
  });
}
