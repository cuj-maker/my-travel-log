/**
 * Phase 2: flights, hotels, bookings, files — plus the auto-sync into the itinerary.
 * Flights/hotels create "linked" itinerary places (linkedType/linkedId) that are
 * rewritten whenever the source record changes, so the planner never drifts.
 */
import * as db from '@/db/database';
import { Booking, Flight, Hotel, ID, Place, StoredFile, Trip } from '@/types/models';
import { addDays, daysBetween, fmtDuration } from '@/lib/format';
import { recalcTrip } from './plannerService';

export const MAX_FILE_BYTES = 1_500_000; // localStorage is small; larger files wait for Phase 5 storage

/* ---------------- itinerary sync ---------------- */

function dayFor(tripId: ID, date: string) {
  return db.byTrip('itineraries', tripId).find((d) => d.date === date);
}

function dropLinked(tripId: ID, linkedId: ID) {
  db.byTrip('places', tripId).filter((p) => p.linkedId === linkedId).forEach((p) => db.remove('places', p.id));
}

function putLinked(tripId: ID, date: string, linkedType: NonNullable<Place['linkedType']>, linkedId: ID, p: Partial<Place> & { name: string }) {
  const day = dayFor(tripId, date);
  if (!day) return false; // flight outside the trip's dates: surfaced as a warning in the UI
  const order = db.byTrip('places', tripId).filter((x) => x.itineraryId === day.id).length;
  db.insert('places', {
    tripId, itineraryId: day.id, order, category: '이동', linkedType, linkedId, estCostKRW: 0, ...p,
  } as Omit<Place, 'id' | 'createdAt' | 'updatedAt' | 'isSample'>);
  return true;
}

function reorderDay(tripId: ID, date: string) {
  const day = dayFor(tripId, date);
  if (!day) return;
  db.byTrip('places', tripId).filter((p) => p.itineraryId === day.id)
    .sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99'))
    .forEach((p, i) => p.order !== i && db.update('places', p.id, { order: i }));
}

export function syncFlight(f: Flight) {
  dropLinked(f.tripId, f.id);
  const dep = f.departAt.slice(0, 10), arr = f.arriveAt.slice(0, 10);
  const label = `${f.airline} ${f.flightNo}`;
  putLinked(f.tripId, dep, 'flight', f.id, { name: `${f.fromAirport} 출발 · ${label}`, time: f.departAt.slice(11, 16), stayMin: 0, memo: `${fmtDuration(f.durationMin)} · ${f.stops === 0 ? '직항' : `경유 ${f.stops}회`}` });
  putLinked(f.tripId, arr, 'flight', f.id, { name: `${f.toAirport} 도착 · ${label}`, time: f.arriveAt.slice(11, 16), stayMin: 60 });
  [dep, arr].forEach((d) => reorderDay(f.tripId, d));
  recalcTrip(f.tripId);
}

export function syncHotel(h: Hotel) {
  dropLinked(h.tripId, h.id);
  putLinked(h.tripId, h.checkIn, 'hotel-in', h.id, { name: `${h.name} 체크인`, category: '숙소', address: h.address, lat: h.lat, lng: h.lng, image: h.image, time: h.checkInTime ?? '15:00', stayMin: 30 });
  putLinked(h.tripId, h.checkOut, 'hotel-out', h.id, { name: `${h.name} 체크아웃`, category: '숙소', address: h.address, lat: h.lat, lng: h.lng, time: h.checkOutTime ?? '11:00', stayMin: 20 });
  [h.checkIn, h.checkOut].forEach((d) => reorderDay(h.tripId, d));
  recalcTrip(h.tripId);
}

/* ---------------- flights ---------------- */

type NewFlight = Omit<Flight, 'id' | 'createdAt' | 'updatedAt' | 'isSample'>;

export function addFlight(data: NewFlight) {
  const row = db.insert('flights', { ...data, priceHistory: [{ at: new Date().toISOString(), priceKRW: data.priceKRW, source: data.priceSource }] });
  syncFlight(row);
  return row;
}

export function saveFlight(id: ID, patch: Partial<Flight>) {
  const old = db.get('flights', id)!;
  const history = [...(old.priceHistory ?? [])];
  if (patch.priceKRW !== undefined && (patch.priceKRW !== old.priceKRW || patch.priceSource !== old.priceSource)) {
    history.push({ at: new Date().toISOString(), priceKRW: patch.priceKRW, source: patch.priceSource ?? old.priceSource });
  }
  const row = db.update('flights', id, { ...patch, priceHistory: history })!;
  syncFlight(row);
  return row;
}

export function removeFlight(id: ID) {
  const f = db.get('flights', id);
  if (!f) return;
  dropLinked(f.tripId, id);
  (f.fileIds ?? []).forEach(removeFile);
  db.remove('flights', id);
  recalcTrip(f.tripId);
}

/* ---------------- hotels ---------------- */

type NewHotel = Omit<Hotel, 'id' | 'createdAt' | 'updatedAt' | 'isSample'>;

export const hotelNights = (h: Pick<Hotel, 'checkIn' | 'checkOut'>) => Math.max(0, daysBetween(h.checkIn, h.checkOut));
export const hotelTotal = (h: Hotel) => h.pricePerNightKRW * hotelNights(h);

export function addHotel(data: NewHotel) {
  const row = db.insert('hotels', data);
  syncHotel(row);
  return row;
}
export function saveHotel(id: ID, patch: Partial<Hotel>) {
  const row = db.update('hotels', id, patch)!;
  syncHotel(row);
  return row;
}
export function removeHotel(id: ID) {
  const h = db.get('hotels', id);
  if (!h) return;
  dropLinked(h.tripId, id);
  (h.fileIds ?? []).forEach(removeFile);
  db.remove('hotels', id);
  recalcTrip(h.tripId);
}

/* ---------------- bookings ---------------- */

export function addBooking(data: Omit<Booking, 'id' | 'createdAt' | 'updatedAt' | 'isSample'>) { return db.insert('bookings', data); }
export function saveBooking(id: ID, patch: Partial<Booking>) { return db.update('bookings', id, patch)!; }
export function removeBooking(id: ID) {
  db.get('bookings', id)?.fileIds.forEach(removeFile);
  db.remove('bookings', id);
}

/* ---------------- files ---------------- */

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onerror = () => rej(new Error('파일을 읽지 못했습니다.'));
    r.onload = () => res(r.result as string);
    r.readAsDataURL(file);
  });
}

export async function attachFile(tripId: ID, file: File): Promise<StoredFile> {
  const ok = file.type === 'application/pdf' || file.type.startsWith('image/');
  if (!ok) throw new Error('PDF 또는 이미지 파일만 첨부할 수 있어요.');
  if (file.size > MAX_FILE_BYTES) throw new Error(`파일이 너무 커요 (최대 ${(MAX_FILE_BYTES / 1e6).toFixed(1)}MB). 이미지는 줄여서 올려 주세요.`);
  const dataUrl = await readFileAsDataUrl(file);
  return db.insert('files', { tripId, name: file.name, mime: file.type, size: file.size, dataUrl });
}
export function removeFile(id: ID) { db.remove('files', id); }
export const getFile = (id: ID) => db.get('files', id);

/* ---------------- warnings ---------------- */

export interface Warning { level: 'warn' | 'info'; text: string }

/** Cross-checks flights, hotels and bookings against the trip's dates and each other. */
export function tripWarnings(trip: Trip): Warning[] {
  const w: Warning[] = [];
  const flights = db.byTrip('flights', trip.id);
  const hotels = db.byTrip('hotels', trip.id).sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  const bookings = db.byTrip('bookings', trip.id);
  const inRange = (d: string) => d >= addDays(trip.startDate, -1) && d <= addDays(trip.endDate, 1);

  flights.forEach((f) => {
    if (!inRange(f.departAt.slice(0, 10))) w.push({ level: 'warn', text: `${f.flightNo} 출발일이 여행 기간과 맞지 않아 일정에 반영되지 않았어요.` });
    if (f.arriveAt <= f.departAt) w.push({ level: 'warn', text: `${f.flightNo} 도착 시각이 출발보다 빨라요.` });
  });

  const out = flights.find((f) => f.direction === 'outbound');
  const first = hotels[0];
  if (out && first && first.checkIn === out.arriveAt.slice(0, 10)) {
    const arr = out.arriveAt.slice(11, 16), cin = first.checkInTime ?? '15:00';
    if (arr < cin) w.push({ level: 'info', text: `${arr}에 도착하고 ${cin}에 체크인이에요. 첫날 오전 일정은 짐 보관 후 가볍게 두는 것을 권장해요.` });
  }
  if (out && first && out.arriveAt.slice(0, 10) < first.checkIn) w.push({ level: 'info', text: '도착일과 호텔 체크인 날짜가 달라요. 첫날 숙소가 비어 있지 않은지 확인하세요.' });

  const ret = flights.find((f) => f.direction === 'return');
  const last = hotels[hotels.length - 1];
  if (ret && last && last.checkOut < ret.departAt.slice(0, 10)) w.push({ level: 'warn', text: '귀국 항공편 전에 호텔 체크아웃이 끝나요. 마지막 밤 숙소를 확인하세요.' });

  for (let i = 1; i < hotels.length; i++) {
    if (hotels[i].checkIn < hotels[i - 1].checkOut) w.push({ level: 'warn', text: `${hotels[i - 1].name}와 ${hotels[i].name}의 숙박 날짜가 겹쳐요.` });
    else if (hotels[i].checkIn > hotels[i - 1].checkOut) w.push({ level: 'info', text: `${hotels[i - 1].name} 체크아웃 후 ${hotels[i].name} 체크인까지 숙소가 없는 날이 있어요.` });
  }

  const seen = new Map<string, string>();
  bookings.forEach((b) => {
    if (b.useAt) {
      if (!inRange(b.useAt.slice(0, 10))) w.push({ level: 'warn', text: `「${b.title}」 이용일이 여행 기간 밖이에요.` });
      const prev = seen.get(b.useAt);
      if (prev) w.push({ level: 'warn', text: `「${prev}」와 「${b.title}」 예약 시간이 같아요.` });
      seen.set(b.useAt, b.title);
    }
  });
  // booking time versus planned places at the same time
  const places = db.byTrip('places', trip.id);
  const days = db.byTrip('itineraries', trip.id);
  bookings.forEach((b) => {
    if (!b.useAt || b.useAt.length < 16) return;
    const day = days.find((d) => d.date === b.useAt!.slice(0, 10));
    const clash = day && places.find((p) => p.itineraryId === day.id && p.time === b.useAt!.slice(11, 16) && !p.linkedId && p.name !== b.title);
    if (clash) w.push({ level: 'warn', text: `「${b.title}」 예약 시간이 일정의 「${clash.name}」와 겹쳐요.` });
  });
  return w;
}

/* ---------------- comparison ---------------- */

export interface Ranked<T> { item: T; tags: string[]; score: number }

/** Not price-only: price 40, time 20, stops 15, baggage 10, refund 10, timing 5. */
export function rankFlights(list: Flight[]): Ranked<Flight>[] {
  if (!list.length) return [];
  const minP = Math.min(...list.map((f) => f.priceKRW)), maxP = Math.max(...list.map((f) => f.priceKRW));
  const minD = Math.min(...list.map((f) => f.durationMin)), maxD = Math.max(...list.map((f) => f.durationMin));
  const norm = (v: number, lo: number, hi: number) => (hi === lo ? 1 : 1 - (v - lo) / (hi - lo));
  return list.map((f) => {
    const hour = Number(f.departAt.slice(11, 13));
    let score = norm(f.priceKRW, minP, maxP) * 40 + norm(f.durationMin, minD, maxD) * 20 + (f.stops === 0 ? 15 : f.stops === 1 ? 7 : 0);
    score += (f.checkedBaggage ? 6 : 0) + (f.cabinBaggage ? 4 : 0) + (f.refundPolicy ? 10 : 0) + (hour >= 7 && hour <= 21 ? 5 : 0);
    const tags: string[] = [];
    if (f.priceKRW === minP) tags.push('최저가');
    if (f.durationMin === minD) tags.push('최단 비행');
    if (f.stops === 0) tags.push('직항');
    if (f.checkedBaggage) tags.push('위탁수하물');
    if (f.refundPolicy) tags.push('변경·환불 조건');
    return { item: f, tags, score: Math.round(score) };
  }).sort((a, b) => b.score - a.score);
}

export function rankHotels(list: Hotel[]): Ranked<Hotel>[] {
  if (!list.length) return [];
  const prices = list.map(hotelTotal);
  const lo = Math.min(...prices), hi = Math.max(...prices);
  return list.map((h) => {
    const norm = hi === lo ? 1 : 1 - (hotelTotal(h) - lo) / (hi - lo);
    const score = norm * 35 + ((h.rating ?? 3) / 5) * 20 + ((h.sightsScore ?? 3) / 5) * 10 + ((h.transitScore ?? 3) / 5) * 10
      + (h.airportMin ? Math.max(0, 1 - h.airportMin / 120) * 5 : 2.5) + (h.breakfast ? 8 : 0) + (h.freeCancel ? 7 : 0) + Math.min(5, h.amenities.length);
    const tags: string[] = [];
    if (hotelTotal(h) === lo) tags.push('최저가');
    if (h.rating && h.rating === Math.max(...list.map((x) => x.rating ?? 0))) tags.push('최고 평점');
    if (h.breakfast) tags.push('조식');
    if (h.freeCancel) tags.push('무료 취소');
    return { item: h, tags, score: Math.round(score) };
  }).sort((a, b) => b.score - a.score);
}
