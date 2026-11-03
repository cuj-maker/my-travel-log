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
  { id: 'flights', label: '항공권 검색 API', phase: 7, connected: false, note: '연결 전: 사용자 입력·샘플 가격만 사용' },
  { id: 'hotels', label: '호텔 검색 API', phase: 7, connected: false, note: '연결 전: 사용자 입력·샘플 가격만 사용' },
  { id: 'maps', label: '지도 API', phase: 3, connected: false, note: '연결 전: 간이 좌표 지도 사용' },
  { id: 'routing', label: '교통 경로 API', phase: 3, connected: false, note: '연결 전: 이동시간·교통비는 예상값' },
  { id: 'fx', label: '환율 API', phase: 4, connected: false, note: '연결 전: 직접 입력 또는 샘플 환율' },
  { id: 'weather', label: '날씨 API', phase: 7, connected: false, note: '연결 전: 계절 정보는 정적 데이터' },
  { id: 'llm', label: 'AI 추천 API (LLM)', phase: 6, connected: false, note: '연결 전: 규칙 기반 추천 엔진 사용' },
];
