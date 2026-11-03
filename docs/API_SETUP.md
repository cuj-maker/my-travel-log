# API 연결 가이드

**가입 없이 이미 연결된 것** (아무것도 안 해도 됨)
- 실시간 환율 (ExchangeRate-API), 날씨 (Open-Meteo)
- 실제 지도 (OpenStreetMap), 장소 검색 (Photon — 해외 장소는 영어·현지어로 검색)
- 도보·택시·렌터카 실제 경로 (OSRM) — 일정에서 ‘실제 경로로 계산’
- 스카이스캐너·구글 항공권·부킹닷컴·호텔스닷컴 바로가기, 구글 지도 장소·길찾기 링크

아래 두 가지는 **선택 사항**이에요. 더 좋아지는 점이 있을 때만 하세요 (내 계정이 필요해요).
- Google 키: 대중교통 실제 시간·요금, 한글 장소 검색, 영업시간 자동 입력, Google 지도 화면
- 항공권 중계 서버: 앱 안에서 실시간 항공권 가격 목록 (없어도 스카이스캐너 버튼으로 검색 가능)

| 기능 | 필요한 것 | 비용 |
|---|---|---|
| Google 지도·장소 검색·실제 이동시간/교통비 | Google Cloud API 키 | 결제 카드 등록 필수, 개인 사용량은 대부분 매월 무료 한도 안 |
| 앱 안에서 실시간 항공권 가격 | SerpApi 계정 + Cloudflare Worker(중계 서버) | 둘 다 무료 플랜으로 시작 가능 (SerpApi 무료 검색 횟수는 가입 시 확인) |

---

## 1. Google Maps API 키 (약 10분)

1. <https://console.cloud.google.com/> 접속 → 새 프로젝트 만들기 (예: `my-travel-log`)
2. **결제 계정 연결** (카드 등록. 무료 한도를 넘지 않으면 청구되지 않아요)
3. **API 및 서비스 → 라이브러리**에서 아래 3개를 **사용 설정**
   - Maps JavaScript API
   - Places API (New) ← 이름에 **(New)** 가 붙은 것
   - Routes API
4. **API 및 서비스 → 사용자 인증 정보 → 사용자 인증 정보 만들기 → API 키**
5. 만든 키를 눌러 **키 제한** 설정 (중요! 키가 웹페이지에 공개되기 때문)
   - 애플리케이션 제한: **웹사이트**
     - `https://<깃허브아이디>.github.io/*`
     - `http://localhost:5173/*` (PC에서 개발할 때)
   - API 제한: **키 제한** → 위 3개 API만 선택
6. (권장) **할당량**에서 하루 요청 수 상한을 걸어 두면 혹시 모를 과금을 막을 수 있어요.

### 키 넣기 — 둘 중 하나

- **A. GitHub에 넣기 (추천 · PC와 아이폰 앱에 한 번에 적용)**
  저장소 → Settings → Secrets and variables → Actions → **New repository secret**
  - Name: `GOOGLE_MAPS_API_KEY` / Secret: 키 값
  - 그다음 Actions 탭에서 배포를 다시 실행(또는 아무 커밋이나 push)
- **B. 앱에서 넣기 (이 기기에만 적용)**
  MY PROFILE → **API 설정** → Google Maps API 키 입력 → **연결 테스트**

### 연결되면 바뀌는 것
- 일정 화면 지도가 실제 Google 지도로 바뀜 (번호 마커, ★ 숙소)
- 장소 추가 / 숙소 등록 화면에 **‘구글 지도에서 찾기’** 검색창 → 이름·주소·좌표·영업시간·휴무일 자동 입력
- 일정의 각 날짜에 **‘실제 경로로 계산’** 버튼 → 구간별 실제 이동시간·거리·환승·대중교통 요금 (`Google` 표시)
  - 요금이 나오지 않는 도시도 있어요. 택시·렌터카 요금은 실제 거리 기준 추정값이에요.
  - 비용 절약을 위해 자동으로 계속 부르지 않고, 버튼을 누르거나 이동수단을 바꿀 때만 계산해요.

---

## 2. 실시간 항공권 가격 (약 15분)

스카이스캐너 API는 제휴 기업만 받을 수 있어서, **Google 항공권 데이터를 제공하는 SerpApi**를 씁니다.
SerpApi 키는 비밀이라 웹페이지에 넣으면 안 되므로, 키를 숨겨주는 작은 중계 서버(Cloudflare Worker)를 거쳐요.
중계 서버 코드는 이 저장소의 `flight-proxy/` 폴더에 있어요.

1. **SerpApi 가입** → <https://serpapi.com/> → 대시보드에서 **API Key** 복사
2. **Cloudflare 가입** → <https://dash.cloudflare.com/sign-up> (무료)
3. `flight-proxy/wrangler.toml` 의 `ALLOWED_ORIGINS` 에서 이미 `https://cuj-maker.github.io` 로 설정돼 있어요
4. PC 터미널에서 (Node 설치되어 있으면 됨):
   ```bash
   cd flight-proxy
   npx wrangler login              # 브라우저에서 Cloudflare 로그인
   npx wrangler secret put SERPAPI_KEY   # 1번에서 복사한 키 붙여넣기
   npx wrangler deploy             # 끝나면 https://my-travel-log-flights.<이름>.workers.dev 주소가 나와요
   ```
5. 나온 주소를 앱에 넣기 — 둘 중 하나
   - **GitHub**: Settings → Secrets and variables → Actions → **Variables** 탭 → `FLIGHT_PROXY_URL` = 주소 → 다시 배포
   - **앱**: MY PROFILE → API 설정 → 항공권 중계 서버 주소 → **연결 테스트**

### 연결되면 바뀌는 것
- 항공·숙소 → FLIGHT 탭의 ‘항공권 검색하기’에 **‘앱에서 실시간 가격 보기’** 버튼
- 항공편 목록(시간·소요시간·경유·가격, 최저가/가격 수준) → **등록**을 누르면 항공권 폼이 자동으로 채워지고 ‘실시간 조회’ 가격으로 저장
- 왕복 검색이면 가격은 **왕복 총액**이에요.
- 같은 검색은 6시간 동안 중계 서버에 저장돼 무료 검색 횟수를 아껴요.

---

## 문제 해결

| 메시지 | 확인할 것 |
|---|---|
| Google API 키가 올바르지 않아요 | 키 복사 확인 |
| 이 주소에서는 키를 쓸 수 없게 제한돼 있어요 | 키 제한(웹사이트)에 `https://<아이디>.github.io/*` 추가 |
| 필요한 Google API가 켜져 있지 않아요 | Places API **(New)** / Routes API 사용 설정 |
| 지도 인증 실패 · 간이 지도로 표시 중 | Maps JavaScript API 사용 설정, 웹사이트 제한 |
| 중계 서버에 연결하지 못했어요 / 허용되지 않은 사이트 | `wrangler.toml` 의 `ALLOWED_ORIGINS` 에 지금 사이트 주소가 있는지 → 고친 뒤 `npx wrangler deploy` |
| SERPAPI_KEY가 설정되지 않았어요 | `npx wrangler secret put SERPAPI_KEY` 다시 실행 |
