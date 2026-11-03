import * as db from './database';
import { DESTINATIONS } from './destinations';
import { syncFlight, syncHotel } from '@/services/bookingService';
import { recalcTrip } from '@/services/plannerService';
import { buildReport } from '@/services/archiveService';
import { BookingStatus, Expense, ExpenseCategory, PaymentStatus, PlaceCategory } from '@/types/models';

const img = (id: string, w = 1200) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=70`;
const dest = (id: string) => DESTINATIONS.find((d) => d.id === id)!;
const S = { isSample: true };

type P = [time: string, name: string, cat: PlaceCategory, cost: number, stay: number, addr?: string, extra?: { lat: number; lng: number }];

function addDays(date: string, n: number) {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDay(tripId: string, startDate: string, idx: number, title: string, places: P[], visited: boolean) {
  const day = db.insert('itineraries', { tripId, dayIndex: idx + 1, date: addDays(startDate, idx), title, ...S });
  places.forEach((p, i) =>
    db.insert('places', {
      tripId, itineraryId: day.id, order: i, time: p[0], name: p[1], category: p[2], estCostKRW: p[3], stayMin: p[4],
      address: p[5], lat: p[6]?.lat, lng: p[6]?.lng, visited, ...S,
    }),
  );
}

function exp(tripId: string, date: string, vendor: string, category: ExpenseCategory, amount: number, currency: Expense['currency'], fx: number, paidBy = '나') {
  db.insert('expenses', { tripId, date, vendor, category, amount, currency, fxRate: fx, amountKRW: Math.round(amount * fx), method: '카드', paidBy, ...S });
}

export function seedSampleData(force = false) {
  const s = db.load();
  if (!force && s.meta.seededAt) return;

  const user = db.insert('users', { name: '여행자', homeCountry: '대한민국', homeCity: '서울', homeAirport: 'ICN', baseCurrency: 'KRW', ...S });
  db.insert('travel_preferences', { userId: user.id, styles: ['미식', '감성 여행', '문화·역사'], climates: ['온화한'], activities: ['산책', '카페', '미술관'], transport: ['도보', '지하철'], budgetPerPersonKRW: 1500000, ...S });

  /* ---------- TOKYO (completed) ---------- */
  const tk = db.insert('trips', {
    title: '도쿄, 느린 봄 산책', country: '일본', countryCode: 'JP', city: '도쿄', cities: ['도쿄'], startDate: '2026-03-12', endDate: '2026-03-16',
    travelers: 2, companions: ['친구 지연'], styles: ['미식', '문화·역사'], status: 'completed', coverImage: dest('d-tokyo').image,
    budgetTotalKRW: 1800000, memo: '벚꽃이 피기 직전의 도쿄.', destinationId: 'd-tokyo', completedAt: '2026-03-17T09:00:00.000Z', ...S,
  });
  const tkF = (dir: 'outbound' | 'return', from: string, to: string, dep: string, arr: string, no: string, price: number) =>
    db.insert('flights', {
      tripId: tk.id, direction: dir, airline: '샘플항공', flightNo: no, fromAirport: from, toAirport: to, departAt: dep, arriveAt: arr,
      durationMin: 140, stops: 0, priceKRW: price, priceSource: 'sample', checkedBaggage: '23kg', cabinBaggage: '10kg', cabinClass: 'economy',
      refundPolicy: '출발 7일 전까지 수수료 50%', bookingRef: 'DEMO-TK1', status: 'paid' as BookingStatus, paymentStatus: 'paid' as PaymentStatus, ...S,
    });
  tkF('outbound', 'ICN', 'NRT', '2026-03-12T09:10', '2026-03-12T11:30', 'SL 701', 342000);
  tkF('return', 'NRT', 'ICN', '2026-03-16T17:40', '2026-03-16T20:10', 'SL 702', 351000);
  db.insert('hotels', {
    tripId: tk.id, name: '아사쿠사 리버사이드 호텔', address: '도쿄 다이토구 아즈마바시', lat: 35.7101, lng: 139.8107, image: img('1503899036084-c55cdd92da26'),
    rating: 4.4, checkIn: '2026-03-12', checkOut: '2026-03-16', checkInTime: '15:00', checkOutTime: '11:00', pricePerNightKRW: 132000, priceSource: 'sample',
    breakfast: true, freeCancel: true, amenities: ['와이파이', '세탁실', '조식'], bookingRef: 'DEMO-HT1', status: 'paid', paymentStatus: 'paid', ...S,
  });

  addDay(tk.id, tk.startDate, 0, 'TOKYO ARRIVAL', [
    ['11:30', '나리타 공항 도착', '이동', 0, 60], ['15:00', '호텔 체크인', '숙소', 0, 30, '다이토구'],
    ['16:30', '아사쿠사 센소지', '관광지', 0, 90, '다이토구 아사쿠사 2-3-1', { lat: 35.7148, lng: 139.7967 }], ['19:00', '저녁 - 튀김 정식', '맛집', 28000, 70]], true);
  addDay(tk.id, tk.startDate, 1, 'SHIBUYA & HARAJUKU', [
    ['10:00', '메이지 신궁', '관광지', 0, 80, '시부야구 요요기', { lat: 35.6764, lng: 139.6993 }], ['12:30', '하라주쿠 점심', '맛집', 22000, 60, undefined, { lat: 35.6702, lng: 139.7027 }],
    ['15:00', '시부야 스카이', '관광지', 24000, 90, '시부야구', { lat: 35.6595, lng: 139.7005 }]], true);
  addDay(tk.id, tk.startDate, 2, 'TSUKIJI & GINZA', [
    ['09:00', '츠키지 장외시장', '맛집', 35000, 90, '주오구', { lat: 35.6655, lng: 139.7707 }], ['13:00', '긴자 쇼핑', '쇼핑', 120000, 120, undefined, { lat: 35.6717, lng: 139.765 }], ['17:00', '카페 휴식', '카페', 9000, 60, undefined, { lat: 35.6735, lng: 139.77 }]], true);
  addDay(tk.id, tk.startDate, 3, 'DAY TRIP — HAKONE', [
    ['08:30', '하코네 프리패스 출발', '이동', 62000, 60], ['11:00', '오와쿠다니', '관광지', 18000, 90], ['18:00', '온천 료칸 식사', '맛집', 45000, 90]], true);
  addDay(tk.id, tk.startDate, 4, 'FAREWELL', [
    ['09:30', '우에노 공원 산책', '관광지', 0, 80], ['13:00', '마지막 라멘', '맛집', 13000, 50], ['17:40', '귀국 항공', '이동', 0, 0]], true);

  const tkExp: [string, string, ExpenseCategory, number][] = [
    ['2026-03-12', '튀김 정식', '식비', 5600], ['2026-03-13', '시부야 스카이', '관광·액티비티', 4500], ['2026-03-14', '긴자 쇼핑', '쇼핑', 24000],
    ['2026-03-14', '츠키지 시장', '식비', 6800], ['2026-03-15', '하코네 프리패스', '교통', 12000], ['2026-03-15', '온천 식사', '식비', 9000],
  ];
  tkExp.forEach(([d, v, c, a], i) => exp(tk.id, d, v, c, a, 'JPY', 9.1, i % 3 === 2 ? '친구 지연' : '나'));
  db.insert('reviews', { tripId: tk.id, targetType: 'trip', rating: 5, text: '일정을 느슨하게 짠 덕분에 걷는 시간이 가장 좋았다. 아침 시장이 베스트.', revisit: ['아사쿠사', '츠키지'], regrets: '하코네 일정은 하루 더 필요', ...S });
  [['1540959733332-eab4deabeeaf', '아사쿠사의 아침'], ['1503899036084-c55cdd92da26', '숙소 앞 강변']].forEach(([id, c], i) =>
    db.insert('photos', { tripId: tk.id, src: img(id, 900), caption: c, takenAt: `2026-03-1${3 + i}T08:00:00.000Z`, isCover: i === 0, ...S }));

  /* ---------- BANGKOK (completed) ---------- */
  const bk = db.insert('trips', {
    title: '방콕 3박 4일 미식 여행', country: '태국', countryCode: 'TH', city: '방콕', cities: ['방콕'], startDate: '2026-07-08', endDate: '2026-07-11',
    travelers: 2, companions: ['동생'], styles: ['미식', '휴양'], status: 'completed', coverImage: dest('d-bangkok').image,
    budgetTotalKRW: 1500000, destinationId: 'd-bangkok', completedAt: '2026-07-12T09:00:00.000Z', ...S,
  });
  db.insert('flights', {
    tripId: bk.id, direction: 'outbound', airline: '샘플항공', flightNo: 'SL 651', fromAirport: 'ICN', toAirport: 'BKK', departAt: '2026-07-08T22:00',
    arriveAt: '2026-07-09T01:50', durationMin: 350, stops: 0, priceKRW: 468000, priceSource: 'user', cabinClass: 'economy', checkedBaggage: '20kg',
    bookingRef: 'DEMO-BK1', status: 'paid', paymentStatus: 'paid', ...S,
  });
  db.insert('hotels', {
    tripId: bk.id, name: '리버뷰 스위트 방콕', address: '방콕 짜오프라야 강변', lat: 13.7216, lng: 100.5145, image: img('1528181304800-259b08848526'), rating: 4.5,
    checkIn: '2026-07-09', checkOut: '2026-07-11', pricePerNightKRW: 95000, priceSource: 'user', breakfast: true, freeCancel: false,
    amenities: ['수영장', '조식', '스파'], status: 'paid', paymentStatus: 'paid', ...S,
  });
  addDay(bk.id, bk.startDate, 0, 'ARRIVAL', [['01:50', '수완나품 공항 도착', '이동', 0, 60], ['10:00', '호텔 조식', '맛집', 0, 60]], true);
  addDay(bk.id, bk.startDate, 1, 'OLD TOWN', [
    ['09:00', '왓포', '관광지', 12000, 90, undefined, { lat: 13.7468, lng: 100.4927 }], ['13:00', '팟타이 맛집', '맛집', 8000, 60, undefined, { lat: 13.752, lng: 100.501 }], ['16:00', '마사지', '액티비티', 28000, 90, undefined, { lat: 13.744, lng: 100.498 }]], true);
  addDay(bk.id, bk.startDate, 2, 'MARKETS', [
    ['10:00', '짜뚜짝 시장', '쇼핑', 90000, 150, undefined, { lat: 13.7999, lng: 100.5503 }], ['19:00', '루프탑 바', '맛집', 55000, 100]], true);
  addDay(bk.id, bk.startDate, 3, 'DEPARTURE', [['10:00', '카페 브런치', '카페', 15000, 60], ['16:00', '귀국', '이동', 0, 0]], true);
  const bkExp: [string, string, ExpenseCategory, number][] = [
    ['2026-07-09', '팟타이', '식비', 3200], ['2026-07-09', '마사지', '관광·액티비티', 900], ['2026-07-10', '짜뚜짝 쇼핑', '쇼핑', 3500], ['2026-07-10', '루프탑 바', '식비', 2100],
  ];
  bkExp.forEach(([d, v, c, a], i) => exp(bk.id, d, v, c, a, 'THB', 40, i % 2 ? '동생' : '나'));
  db.insert('reviews', { tripId: bk.id, targetType: 'trip', rating: 4, text: '가성비 최고. 낮에는 너무 더워서 일정을 오전/저녁으로 몰아야 한다.', revisit: ['짜뚜짝'], regrets: '낮 시간 야외 일정', ...S });
  db.insert('photos', { tripId: bk.id, src: img('1508009603885-50cf7c579365', 900), caption: '왓포 사원', isCover: true, takenAt: '2026-07-10T03:00:00.000Z', ...S });

  /* ---------- PARIS (upcoming) ---------- */
  const pr = db.insert('trips', {
    title: '파리 5박 6일, 겨울의 미술관', country: '프랑스', countryCode: 'FR', city: '파리', cities: ['파리', '베르사유'], startDate: '2026-12-14', endDate: '2026-12-19',
    travelers: 2, companions: ['연인'], styles: ['문화·역사', '감성 여행', '커플 여행'], status: 'booked', coverImage: dest('d-paris').image,
    budgetTotalKRW: 5200000, memo: '크리스마스 마켓 시즌.', destinationId: 'd-paris', ...S,
  });
  db.insert('flights', {
    tripId: pr.id, direction: 'outbound', airline: '샘플항공', flightNo: 'SL 901', fromAirport: 'ICN', toAirport: 'CDG', departAt: '2026-12-14T13:30',
    arriveAt: '2026-12-14T19:10', durationMin: 880, stops: 0, priceKRW: 1480000, priceSource: 'sample', cabinClass: 'economy', checkedBaggage: '23kg',
    cabinBaggage: '10kg', refundPolicy: '출발 14일 전까지 무료 변경 (샘플)', bookingRef: 'DEMO-PR1', status: 'reserved', paymentStatus: 'unpaid', ...S,
  });
  db.insert('flights', {
    tripId: pr.id, direction: 'return', airline: '샘플항공', flightNo: 'SL 902', fromAirport: 'CDG', toAirport: 'ICN', departAt: '2026-12-19T12:20',
    arriveAt: '2026-12-20T07:30', durationMin: 910, stops: 0, priceKRW: 1480000, priceSource: 'sample', cabinClass: 'economy', status: 'reserved', paymentStatus: 'unpaid', ...S,
  });
  db.insert('hotels', {
    tripId: pr.id, name: '마레 부티크 호텔', address: '파리 4구 마레 지구', lat: 48.8575, lng: 2.3622, image: img('1499856871958-5b9627545d1a'), rating: 4.6,
    checkIn: '2026-12-14', checkOut: '2026-12-19', checkInTime: '15:00', checkOutTime: '11:00', pricePerNightKRW: 245000, priceSource: 'sample',
    breakfast: false, freeCancel: true, amenities: ['와이파이', '엘리베이터'], status: 'reserved', paymentStatus: 'unpaid', ...S,
  });
  addDay(pr.id, pr.startDate, 0, 'ARRIVAL IN PARIS', [], false);
  addDay(pr.id, pr.startDate, 5, 'DEPARTURE', [], false);
  addDay(pr.id, pr.startDate, 1, 'LOUVRE & SEINE', [
    ['09:30', '루브르 박물관', '관광지', 30000, 210, '파리 1구', { lat: 48.8606, lng: 2.3376 }],
    ['14:00', '튈르리 정원 산책', '관광지', 0, 60, undefined, { lat: 48.8635, lng: 2.3275 }], ['19:00', '비스트로 저녁', '맛집', 90000, 100, undefined, { lat: 48.859, lng: 2.36 }]], false);
  addDay(pr.id, pr.startDate, 2, 'MONTMARTRE', [
    ['10:00', '사크레쾨르', '관광지', 0, 90, undefined, { lat: 48.8867, lng: 2.3431 }], ['13:00', '몽마르트르 카페', '카페', 20000, 60, undefined, { lat: 48.887, lng: 2.34 }]], false);

  // Paris flights/hotel generate their itinerary entries through the same sync used by the forms.
  db.byTrip('flights', pr.id).forEach(syncFlight);
  db.byTrip('hotels', pr.id).forEach(syncHotel);

  db.insert('checklists', { tripId: pr.id, label: '여권 유효기간 확인', group: '필수', done: true, ...S });
  db.insert('checklists', { tripId: pr.id, label: '여행자보험', group: '필수', done: false, ...S });

  // Paid flights/hotels are recorded once, as expenses linked to their booking (no double counting).
  [[tk, '2026-03-01'], [bk, '2026-06-20']].forEach(([t, payDate]) => {
    const trip = t as typeof tk;
    db.byTrip('flights', trip.id).filter((f) => f.paymentStatus === 'paid').forEach((f) =>
      db.insert('expenses', { tripId: trip.id, bookingId: f.id, date: payDate as string, vendor: `${f.airline} ${f.flightNo}`, category: '항공', amount: f.priceKRW, currency: 'KRW', fxRate: 1, amountKRW: f.priceKRW, method: '카드', paidBy: '나', shared: true, ...S }));
    db.byTrip('hotels', trip.id).filter((h) => h.paymentStatus === 'paid').forEach((h) => {
      const total = h.pricePerNightKRW * Math.max(0, Math.round((new Date(h.checkOut).getTime() - new Date(h.checkIn).getTime()) / 86400000));
      db.insert('expenses', { tripId: trip.id, bookingId: h.id, date: payDate as string, vendor: h.name, category: '숙박', amount: total, currency: 'KRW', fxRate: 1, amountKRW: total, method: '카드', paidBy: '나', shared: true, ...S });
    });
  });
  [tk, bk, pr].forEach((t) => recalcTrip(t.id));

  // Archive samples: link a photo and a review to a place, then freeze the reports of finished trips.
  const asakusa = db.byTrip('places', tk.id).find((p) => p.name.includes('센소지'));
  const firstPhoto = db.byTrip('photos', tk.id)[0];
  if (asakusa && firstPhoto) {
    db.update('photos', firstPhoto.id, { placeId: asakusa.id });
    db.insert('reviews', { tripId: tk.id, targetType: 'place', targetId: asakusa.id, rating: 5, text: '이른 아침에 가면 조용해서 좋았다.', ...S });
  }
  [tk, bk].forEach((t) => db.update('trips', t.id, { report: buildReport(db.get('trips', t.id)!) }));

  const cur = db.load();
  cur.meta.seededAt = new Date().toISOString();
  db.replaceAll(cur);
}

export function clearSampleData() {
  const s = db.load() as any;
  Object.keys(s).forEach((k) => {
    if (Array.isArray(s[k])) s[k] = s[k].filter((r: any) => !r.isSample);
  });
  s.meta.seededAt = new Date().toISOString(); // do not auto-reseed
  db.replaceAll(s);
}
