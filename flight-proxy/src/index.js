/**
 * Flight price proxy for MY TRAVEL LOG.
 * Keeps the SerpApi key secret (stored with `wrangler secret put SERPAPI_KEY`) and
 * returns a trimmed Google Flights result the app can show.
 *
 * GET /flights?from=ICN&to=CDG&date=2026-12-14&return=2026-12-19&adults=2
 */
const json = (body, status, cors) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors } });

const IATA = /^[A-Z]{3}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function trimOption(o) {
  const legs = (o.flights || []).map((f) => ({
    airline: f.airline,
    flightNo: f.flight_number,
    from: f.departure_airport?.id,
    fromName: f.departure_airport?.name,
    depart: f.departure_airport?.time, // "YYYY-MM-DD HH:mm" local
    to: f.arrival_airport?.id,
    toName: f.arrival_airport?.name,
    arrive: f.arrival_airport?.time,
    durationMin: f.duration,
    travelClass: f.travel_class,
    airplane: f.airplane,
    overnight: !!f.overnight,
  }));
  return {
    priceKRW: o.price ?? null,
    totalMin: o.total_duration,
    stops: Math.max(0, legs.length - 1),
    layovers: (o.layovers || []).map((l) => ({ airport: l.id, name: l.name, minutes: l.duration, overnight: !!l.overnight })),
    legs,
    logo: o.airline_logo,
    carbonKg: o.carbon_emissions?.this_flight ? Math.round(o.carbon_emissions.this_flight / 1000) : undefined,
  };
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const ok = allowed.includes(origin);
    const cors = ok ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin', 'Access-Control-Allow-Methods': 'GET, OPTIONS' } : {};

    if (request.method === 'OPTIONS') return new Response(null, { status: ok ? 204 : 403, headers: cors });
    if (!ok) return json({ error: '허용되지 않은 사이트예요. wrangler.toml의 ALLOWED_ORIGINS에 주소를 추가하세요.' }, 403, {});

    const url = new URL(request.url);
    if (url.pathname === '/' || url.pathname === '/health') return json({ ok: true, hasKey: !!env.SERPAPI_KEY }, 200, cors);
    if (url.pathname !== '/flights') return json({ error: 'not found' }, 404, cors);
    if (!env.SERPAPI_KEY) return json({ error: 'SERPAPI_KEY가 설정되지 않았어요 (wrangler secret put SERPAPI_KEY).' }, 500, cors);

    const p = url.searchParams;
    const from = (p.get('from') || '').toUpperCase();
    const to = (p.get('to') || '').toUpperCase();
    const date = p.get('date') || '';
    const ret = p.get('return') || '';
    const adults = Math.min(9, Math.max(1, Number(p.get('adults')) || 1));
    if (!IATA.test(from) || !IATA.test(to)) return json({ error: '공항 코드는 3글자예요 (예: ICN, CDG).' }, 400, cors);
    if (!DATE.test(date) || (ret && !DATE.test(ret))) return json({ error: '날짜 형식이 올바르지 않아요.' }, 400, cors);

    // Cache identical searches (saves the monthly SerpApi quota)
    const cacheKey = new Request(`https://cache.local/flights?${from}-${to}-${date}-${ret}-${adults}`);
    const cache = caches.default;
    const hit = await cache.match(cacheKey);
    if (hit) { const body = await hit.json(); return json({ ...body, cached: true }, 200, cors); }

    const q = new URLSearchParams({
      engine: 'google_flights', departure_id: from, arrival_id: to, outbound_date: date, type: ret ? '1' : '2',
      adults: String(adults), currency: 'KRW', hl: 'ko', gl: 'kr', api_key: env.SERPAPI_KEY,
    });
    if (ret) q.set('return_date', ret);

    const r = await fetch(`https://serpapi.com/search.json?${q}`);
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.error) return json({ error: `항공권 검색 실패: ${data.error || r.status}` }, 502, cors);

    const best = (data.best_flights || []).map((o) => ({ ...trimOption(o), best: true }));
    const other = (data.other_flights || []).map(trimOption);
    const body = {
      query: { from, to, date, return: ret || null, adults, roundTrip: !!ret },
      fetchedAt: new Date().toISOString(),
      priceInsights: data.price_insights ? {
        lowest: data.price_insights.lowest_price, level: data.price_insights.price_level, typical: data.price_insights.typical_price_range,
      } : null,
      googleFlightsUrl: data.search_metadata?.google_flights_url,
      options: [...best, ...other].filter((o) => o.legs.length).slice(0, 15),
    };
    const ttl = Number(env.CACHE_SECONDS) || 21600;
    ctx.waitUntil(cache.put(cacheKey, new Response(JSON.stringify(body), { headers: { 'Cache-Control': `max-age=${ttl}` } })));
    return json(body, 200, cors);
  },
};
