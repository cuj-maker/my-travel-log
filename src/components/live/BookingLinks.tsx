import { useState } from 'react';
import { ArrowLeftRight, ExternalLink } from 'lucide-react';
import { Trip } from '@/types/models';
import { defaultAirports, flightLinks, hotelLinks, tripHotelQuery } from '@/integrations/links';

const linkBtn = 'inline-flex items-center justify-center gap-1.5 rounded-full border border-navy/30 bg-paper px-4 py-2.5 text-sm font-medium text-navy transition hover:bg-navy-light active:scale-[0.98]';

/** Skyscanner / Google Flights search pre-filled with this trip. */
export function FlightSearchLinks({ trip }: { trip: Trip }) {
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
