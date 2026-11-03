import { useState } from 'react';
import { ArrowLeftRight, ExternalLink, Loader2, Plus, Zap } from 'lucide-react';
import { Trip } from '@/types/models';
import { defaultAirports, flightLinks, hotelLinks, tripHotelQuery } from '@/integrations/links';
import { LiveFlightOption, LiveFlightResult, PRICE_LEVEL, searchLiveFlights } from '@/integrations/flights';
import { useApiSettings } from '@/integrations/settings';
import type { FlightPrefill } from '@/components/booking/FlightFormModal';
import { krw } from '@/lib/format';
import { fmtMin } from '@/services/plannerService';

const linkBtn = 'inline-flex items-center justify-center gap-1.5 rounded-full border border-navy/30 bg-paper px-4 py-2.5 text-sm font-medium text-navy transition hover:bg-navy-light active:scale-[0.98]';

/** Skyscanner / Google Flights search pre-filled with this trip. */
export function FlightSearchLinks({ trip, onRegister }: { trip: Trip; onRegister?: (p: FlightPrefill) => void }) {
  const { flightProxyUrl } = useApiSettings();
  const [live, setLive] = useState<LiveFlightResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const def = defaultAirports(trip);
  const [from, setFrom] = useState(def.from);
  const [to, setTo] = useState(def.to);
  const [roundTrip, setRoundTrip] = useState(true);
  const links = flightLinks({ from, to, depart: trip.startDate, ret: roundTrip ? trip.endDate : undefined, adults: trip.travelers || 1 });

  return (
    <div className="rounded-xl2 border border-beige/80 bg-white/70 p-4 shadow-card sm:p-5">
      <p className="text-sm font-medium">항공권 검색하기</p>
      <p className="mt-0.5 text-xs text-charcoal-mute">여행 날짜·인원({trip.travelers}명)으로 검색 화면을 열어요. 마음에 드는 항공편을 예약한 뒤 아래에서 등록해 주세요.</p>
      <div className="mt-3 flex items-end gap-2">
        <label className="w-full"><span className="field-label">출발 공항</span><input className="field uppercase" maxLength={4} value={from} onChange={(e) => setFrom(e.target.value.toUpperCase())} placeholder="ICN" /></label>
        <button type="button" aria-label="출발·도착 바꾸기" onClick={() => { setFrom(to); setTo(from); }} className="mb-1.5 shrink-0 rounded-full p-2 text-charcoal-soft hover:bg-beige/60"><ArrowLeftRight size={16} /></button>
        <label className="w-full"><span className="field-label">도착 공항</span><input className="field uppercase" maxLength={4} value={to} onChange={(e) => setTo(e.target.value.toUpperCase())} placeholder="CDG" /></label>
      </div>
      <label className="mt-2 inline-flex items-center gap-2 text-xs text-charcoal-soft"><input type="checkbox" checked={roundTrip} onChange={(e) => setRoundTrip(e.target.checked)} /> 왕복 ({trip.startDate} → {trip.endDate})</label>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:flex">
        {links.map((l) => <a key={l.id} href={l.url} target="_blank" rel="noreferrer" className={linkBtn}>{l.label} <ExternalLink size={13} /></a>)}
      </div>
      {!to && <p className="mt-2 text-xs text-clay">도착 공항 코드(예: CDG)를 입력하면 스카이스캐너에서 바로 검색돼요.</p>}

      {flightProxyUrl ? (
        <div className="mt-4 border-t border-beige/70 pt-4">
          <button type="button" disabled={busy || from.length !== 3 || to.length !== 3}
            onClick={async () => {
              setBusy(true); setErr('');
              try { setLive(await searchLiveFlights({ from, to, date: trip.startDate, ret: roundTrip ? trip.endDate : undefined, adults: trip.travelers || 1 })); }
              catch (e) { setErr((e as Error).message); setLive(null); } finally { setBusy(false); }
            }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-navy px-5 py-2.5 text-sm font-medium text-cream transition hover:bg-navy-dark disabled:opacity-50 sm:w-auto">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />} 앱에서 실시간 가격 보기
          </button>
          {err && <p className="mt-2 text-xs text-clay">{err}</p>}
          {live && <LiveFlightList result={live} onRegister={onRegister} />}
        </div>
      ) : (
        <p className="mt-3 text-[11px] text-charcoal-mute">앱 안에서 실시간 가격을 보려면 MY PROFILE › API 설정에 항공권 중계 서버 주소를 넣어 주세요.</p>
      )}
    </div>
  );
}

const hm = (t: string) => t?.slice(11, 16) ?? '';
const airlines = (o: LiveFlightOption) => Array.from(new Set(o.legs.map((l) => l.airline))).join(' · ');

function toPrefill(o: LiveFlightOption, roundTrip: boolean): FlightPrefill {
  const first = o.legs[0], last = o.legs[o.legs.length - 1];
  const cls = (first.travelClass ?? '').toLowerCase();
  return {
    airline: airlines(o),
    flightNo: o.legs.map((l) => l.flightNo).join(' / '),
    fromAirport: first.from, toAirport: last.to,
    depDate: first.depart.slice(0, 10), depTime: hm(first.depart), arrDate: last.arrive.slice(0, 10), arrTime: hm(last.arrive),
    duration: String(o.totalMin), stops: String(o.stops),
    layover: o.layovers.map((l) => `${l.airport} ${l.minutes}분`).join(', '),
    price: o.priceKRW != null ? String(o.priceKRW) : '', priceSource: 'api',
    cabinClass: cls.includes('first') ? 'first' : cls.includes('business') ? 'business' : cls.includes('premium') ? 'premium' : 'economy',
    refund: roundTrip ? '가격은 왕복 총액 (Google 항공권 기준)' : '',
  };
}

function LiveFlightList({ result, onRegister }: { result: LiveFlightResult; onRegister?: (p: FlightPrefill) => void }) {
  const { query, options, priceInsights } = result;
  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-charcoal-soft">
        <span>{query.from} → {query.to} · {query.roundTrip ? '왕복 총액' : '편도'} · {query.adults}명 기준 {options.length}개</span>
        <span className="text-charcoal-mute">{new Date(result.fetchedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 조회{result.cached ? ' (저장된 결과)' : ''}</span>
      </div>
      {priceInsights?.lowest != null && (
        <p className="rounded-xl bg-olive-light/60 px-3 py-2 text-xs text-olive-dark">
          최저 {krw(priceInsights.lowest)}{priceInsights.level ? ` · ${PRICE_LEVEL[priceInsights.level] ?? priceInsights.level}` : ''}{priceInsights.typical ? ` · 일반 가격대 ${krw(priceInsights.typical[0])}~${krw(priceInsights.typical[1])}` : ''}
        </p>
      )}
      {options.length === 0 && <p className="text-sm text-charcoal-mute">검색 결과가 없어요. 공항 코드나 날짜를 확인해 주세요.</p>}
      <ul className="space-y-2">
        {options.map((o, i) => {
          const first = o.legs[0], last = o.legs[o.legs.length - 1];
          return (
            <li key={i} className="rounded-xl border border-beige bg-paper p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-xs text-charcoal-soft">
                    {o.logo && <img src={o.logo} alt="" className="h-4 w-4 object-contain" />}
                    <span className="truncate">{airlines(o)}</span>
                    {o.best && <span className="rounded-full bg-olive-light px-1.5 text-[10px] text-olive-dark">추천</span>}
                  </p>
                  <p className="mt-1 font-serif text-lg leading-tight">{hm(first.depart)} → {hm(last.arrive)}{last.arrive.slice(0, 10) !== first.depart.slice(0, 10) && <sup className="ml-0.5 text-[10px] text-clay">+1</sup>}</p>
                  <p className="text-xs text-charcoal-mute">{first.from} → {last.to} · {fmtMin(o.totalMin)} · {o.stops ? `경유 ${o.stops}회 (${o.layovers.map((l) => l.airport).join(', ')})` : '직항'}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-serif text-lg text-navy">{o.priceKRW != null ? krw(o.priceKRW) : '가격 없음'}</p>
                  {onRegister && <button type="button" onClick={() => onRegister(toPrefill(o, query.roundTrip))} className="mt-1 inline-flex items-center gap-1 rounded-full border border-navy/30 px-2.5 py-1 text-[11px] text-navy hover:bg-navy-light"><Plus size={11} />등록</button>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-charcoal-mute">Google 항공권 기준 가격이며 실제 예약 시점·사이트에 따라 달라질 수 있어요. 등록하면 ‘실시간 조회’ 가격으로 저장돼요.</p>
    </div>
  );
}

/** Booking.com / Hotels.com / Google Hotels search pre-filled with this trip. */
export function HotelSearchLinks({ trip }: { trip: Trip }) {
  const links = hotelLinks(tripHotelQuery(trip));
  return (
    <div className="rounded-xl2 border border-beige/80 bg-white/70 p-4 shadow-card sm:p-5">
      <p className="text-sm font-medium">숙소 검색하기</p>
      <p className="mt-0.5 text-xs text-charcoal-mute">{trip.city} · {trip.startDate} ~ {trip.endDate} · {trip.travelers}명으로 검색 화면을 열어요. 예약한 숙소는 아래에서 등록해 주세요.</p>
      <div className="mt-3 grid grid-cols-3 gap-2 sm:flex">
        {links.map((l) => <a key={l.id} href={l.url} target="_blank" rel="noreferrer" className={`${linkBtn} !px-2 sm:!px-4`}>{l.label} <ExternalLink size={13} className="hidden sm:block" /></a>)}
      </div>
    </div>
  );
}
