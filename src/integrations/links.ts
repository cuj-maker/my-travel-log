/**
 * Deep links into booking / map services. No API key, no approval needed:
 * we only open the provider's own search page (or app on iPhone) pre-filled with the trip.
 * Prices seen there are NOT copied back automatically — the user registers what they book.
 */
import { Flight, TransportMode, Trip } from '@/types/models';
import { DESTINATIONS } from '@/db/destinations';
import * as db from '@/db/database';
import { cityQuery } from './live';

/** Main airport per catalog city (used when the trip has no flight registered yet). */
const CITY_AIRPORT: Record<string, string> = {
  오사카: 'KIX', 후쿠오카: 'FUK', 타이베이: 'TPE', 도쿄: 'NRT', 방콕: 'BKK', 파리: 'CDG', 다낭: 'DAD', 삿포로: 'CTS', 리스본: 'LIS', 시드니: 'SYD',
  서울: 'ICN', 부산: 'PUS', 제주: 'CJU', 오키나와: 'OKA', 나고야: 'NGO', 홍콩: 'HKG', 싱가포르: 'SIN', 런던: 'LHR', 뉴욕: 'JFK', 로마: 'FCO', 바르셀로나: 'BCN', 하노이: 'HAN', 호치민: 'SGN', 세부: 'CEB', 발리: 'DPS', 괌: 'GUM', 상하이: 'PVG', 베이징: 'PEK',
};

export function defaultAirports(trip: Trip): { from: string; to: string } {
  const user = db.all('users')[0];
  const out = db.byTrip('flights', trip.id).find((f: Flight) => f.direction === 'outbound');
  return {
    from: (out?.fromAirport || user?.homeAirport || 'ICN').toUpperCase(),
    to: (out?.toAirport || CITY_AIRPORT[trip.city] || '').toUpperCase(),
  };
}

const yymmdd = (d: string) => d.slice(2, 4) + d.slice(5, 7) + d.slice(8, 10);

export interface FlightQuery { from: string; to: string; depart: string; ret?: string; adults: number }

export function flightLinks(q: FlightQuery) {
  const from = q.from.trim().toLowerCase();
  const to = q.to.trim().toLowerCase();
  const sky = from && to
    ? `https://www.skyscanner.co.kr/transport/flights/${from}/${to}/${yymmdd(q.depart)}/${q.ret ? yymmdd(q.ret) + '/' : ''}?adultsv2=${q.adults}&cabinclass=economy&rtn=${q.ret ? 1 : 0}`
    : 'https://www.skyscanner.co.kr/';
  const gText = `Flights from ${q.from.toUpperCase()} to ${q.to.toUpperCase()} on ${q.depart}${q.ret ? ` through ${q.ret}` : ' one way'} ${q.adults} adults`;
  return [
    { id: 'skyscanner', label: '스카이스캐너', url: sky },
    { id: 'google-flights', label: '구글 항공권', url: `https://www.google.com/travel/flights?hl=ko&curr=KRW&q=${encodeURIComponent(gText)}` },
  ];
}

export interface HotelQuery { city: string; checkIn: string; checkOut: string; adults: number }

export function hotelLinks(q: HotelQuery) {
  return [
    { id: 'booking', label: '부킹닷컴', url: `https://www.booking.com/searchresults.ko.html?ss=${encodeURIComponent(q.city)}&checkin=${q.checkIn}&checkout=${q.checkOut}&group_adults=${q.adults}&no_rooms=1&selected_currency=KRW` },
    { id: 'hotels-com', label: '호텔스닷컴', url: `https://kr.hotels.com/Hotel-Search?destination=${encodeURIComponent(q.city)}&startDate=${q.checkIn}&endDate=${q.checkOut}&adults=${q.adults}&rooms=1` },
    { id: 'google-hotels', label: '구글 호텔', url: `https://www.google.com/travel/search?hl=ko&q=${encodeURIComponent(`hotels in ${q.city}`)}&checkin=${q.checkIn}&checkout=${q.checkOut}` },
  ];
}

export const tripHotelQuery = (trip: Trip): HotelQuery => ({ city: cityQuery(trip), checkIn: trip.startDate, checkOut: trip.endDate, adults: trip.travelers || 1 });

/* ---------- Google Maps (official URL scheme, opens the Maps app on iPhone) ---------- */

type Pt = { name: string; lat?: number; lng?: number; address?: string };
const ptQuery = (p: Pt, city?: string) => (p.lat != null && p.lng != null ? `${p.lat},${p.lng}` : [p.name, p.address, city].filter(Boolean).join(' '));

/** Planner rows for hotels are named "<hotel> 체크인/체크아웃" — search for the hotel itself. */
const cleanName = (n: string) => n.replace(/\s*(체크인|체크아웃)\s*$/, '');
export const mapsPlaceUrl = (p: Pt, city?: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.lat != null && p.lng != null ? `${cleanName(p.name)} ${p.lat},${p.lng}` : ptQuery({ ...p, name: cleanName(p.name) }, city))}`;

const TRAVELMODE: Record<TransportMode, string> = { walk: 'walking', subway: 'transit', bus: 'transit', train: 'transit', taxi: 'driving', rentcar: 'driving' };
export const mapsDirectionsUrl = (from: Pt, to: Pt, mode: TransportMode, city?: string) =>
  `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(ptQuery(from, city))}&destination=${encodeURIComponent(ptQuery(to, city))}&travelmode=${TRAVELMODE[mode]}`;

export const destinationEn = (city: string) => DESTINATIONS.find((d) => d.city === city)?.cityEn ?? city;
