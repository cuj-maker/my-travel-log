/**
 * Phase 4: budget, expenses, FX and settlement.
 *
 * Booking money vs real spending (no double counting):
 *  - A booking with paymentStatus 'paid' counts as ACTUAL spend, unless an expense is linked to it
 *    via `bookingId` — then only the expense counts.
 *  - A booking that is reserved but 'unpaid' is COMMITTED (예약 미결제), never actual.
 *  - Considering/cancelled/refunded bookings count as neither.
 */
import * as db from '@/db/database';
import { CurrencyCode, Expense, ExpenseCategory, EXPENSE_CATEGORIES, ID, PlaceCategory, StoredFile, Trip, TripBudget } from '@/types/models';
import { plannedCosts } from './plannerService';
import { fileToCompressedDataUrl } from '@/lib/format';

/* ---------------- FX ---------------- */

export const CURRENCIES: { code: CurrencyCode; label: string }[] = [
  { code: 'KRW', label: '원화 (KRW)' }, { code: 'USD', label: '미국 달러 (USD)' }, { code: 'JPY', label: '일본 엔 (JPY)' }, { code: 'EUR', label: '유로 (EUR)' },
  { code: 'TWD', label: '대만 달러 (TWD)' }, { code: 'THB', label: '태국 바트 (THB)' }, { code: 'GBP', label: '영국 파운드 (GBP)' }, { code: 'CNY', label: '위안 (CNY)' },
  { code: 'VND', label: '베트남 동 (VND)' }, { code: 'HKD', label: '홍콩 달러 (HKD)' },
];

/** SAMPLE rates (KRW per 1 unit). Not live — replace via the FX provider slot or per-trip input. */
export const SAMPLE_FX: Record<CurrencyCode, number> = { KRW: 1, USD: 1380, JPY: 9.1, EUR: 1500, TWD: 43, THB: 40, GBP: 1750, CNY: 190, VND: 0.055, HKD: 177 };

export const getBudget = (tripId: ID) => db.byTrip('budgets', tripId)[0];

export function fxRate(tripId: ID, c: CurrencyCode): { rate: number; source: 'user' | 'sample' } {
  if (c === 'KRW') return { rate: 1, source: 'user' };
  const r = getBudget(tripId)?.fx?.[c];
  return r ? { rate: r, source: 'user' } : { rate: SAMPLE_FX[c], source: 'sample' };
}

export function saveBudget(tripId: ID, patch: { totalKRW?: number; byCategory?: TripBudget['byCategory']; fx?: TripBudget['fx'] }) {
  const cur = getBudget(tripId);
  const next = { totalKRW: patch.totalKRW ?? cur?.totalKRW ?? 0, byCategory: patch.byCategory ?? cur?.byCategory ?? {}, fx: patch.fx ?? cur?.fx };
  if (cur) db.update('budgets', cur.id, next); else db.insert('budgets', { tripId, ...next });
  if (patch.totalKRW !== undefined) db.update('trips', tripId, { budgetTotalKRW: patch.totalKRW || undefined });
}

export function budgetTotal(trip: Trip) { return getBudget(trip.id)?.totalKRW || trip.budgetTotalKRW || 0; }

/* ---------------- expenses ---------------- */

export type ExpenseInput = Omit<Expense, 'id' | 'createdAt' | 'updatedAt' | 'isSample' | 'amountKRW'>;
const toKRW = (amount: number, rate: number) => Math.round(amount * rate);

export const addExpense = (d: ExpenseInput) => db.insert('expenses', { ...d, amountKRW: toKRW(d.amount, d.fxRate) });
export const saveExpense = (id: ID, d: ExpenseInput) => db.update('expenses', id, { ...d, amountKRW: toKRW(d.amount, d.fxRate) });
export function removeExpense(id: ID) {
  const e = db.get('expenses', id);
  if (e?.receiptFileId) db.remove('files', e.receiptFileId);
  db.remove('expenses', id);
}

export async function attachReceipt(tripId: ID, file: File): Promise<StoredFile> {
  if (file.type === 'application/pdf') {
    if (file.size > 1_500_000) throw new Error('PDF가 너무 커요 (최대 1.5MB).');
    const dataUrl = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = () => rej(new Error('파일을 읽지 못했습니다.')); r.readAsDataURL(file); });
    return db.insert('files', { tripId, name: file.name, mime: file.type, size: file.size, dataUrl });
  }
  const dataUrl = await fileToCompressedDataUrl(file, 1000, 0.7); // receipts are shrunk to fit local storage
  return db.insert('files', { tripId, name: file.name, mime: 'image/jpeg', size: dataUrl.length, dataUrl });
}

/* ---------------- ledger ---------------- */

export interface LedgerRow {
  key: string;
  date: string;
  label: string;
  category: ExpenseCategory;
  amountKRW: number;
  origin: 'expense' | 'booking';
  expense?: Expense;
  bookingId?: ID;
  bookingKind?: string;
}

const BOOKING_CATEGORY: Record<string, ExpenseCategory> = {
  flight: '항공', hotel: '숙박', restaurant: '식비', ticket: '관광·액티비티', show: '관광·액티비티', activity: '관광·액티비티', rentcar: '교통', pickup: '교통',
};

interface BookingItem { id: ID; kind: string; label: string; date: string; amountKRW: number; paid: boolean; counts: boolean }

function bookingItems(tripId: ID): BookingItem[] {
  const nights = (a: string, b: string) => Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000));
  const f: BookingItem[] = db.byTrip('flights', tripId).map((x) => ({
    id: x.id, kind: 'flight', label: `${x.airline} ${x.flightNo} (${x.fromAirport}→${x.toAirport})`, date: x.departAt.slice(0, 10), amountKRW: x.priceKRW,
    paid: x.paymentStatus === 'paid', counts: x.status !== 'considering' && x.status !== 'cancelled' && x.paymentStatus !== 'refunded',
  }));
  const h: BookingItem[] = db.byTrip('hotels', tripId).map((x) => ({
    id: x.id, kind: 'hotel', label: `${x.name} ${nights(x.checkIn, x.checkOut)}박`, date: x.checkIn, amountKRW: x.pricePerNightKRW * nights(x.checkIn, x.checkOut),
    paid: x.paymentStatus === 'paid', counts: x.status !== 'considering' && x.status !== 'cancelled' && x.paymentStatus !== 'refunded',
  }));
  const b: BookingItem[] = db.byTrip('bookings', tripId).filter((x) => x.amountKRW !== undefined).map((x) => ({
    id: x.id, kind: x.kind, label: x.title, date: (x.useAt ?? x.bookedOn ?? '').slice(0, 10), amountKRW: x.amountKRW!, paid: x.paymentStatus === 'paid', counts: x.paymentStatus !== 'refunded',
  }));
  return [...f, ...h, ...b];
}

export function tripLedger(tripId: ID) {
  const expenses = db.byTrip('expenses', tripId);
  const linked = new Set(expenses.map((e) => e.bookingId).filter(Boolean) as ID[]);
  const items = bookingItems(tripId);

  const actual: LedgerRow[] = expenses.map((e) => ({ key: e.id, date: e.date, label: e.vendor, category: e.category, amountKRW: e.amountKRW, origin: 'expense', expense: e, bookingId: e.bookingId }));
  const committed: LedgerRow[] = [];
  items.forEach((it) => {
    if (!it.counts || linked.has(it.id)) return;
    const row: LedgerRow = { key: `bk-${it.id}`, date: it.date, label: it.label, category: BOOKING_CATEGORY[it.kind] ?? '기타', amountKRW: it.amountKRW, origin: 'booking', bookingId: it.id, bookingKind: it.kind };
    (it.paid ? actual : committed).push(row);
  });
  actual.sort((a, b) => a.date.localeCompare(b.date));
  const sum = (r: LedgerRow[]) => r.reduce((s, x) => s + x.amountKRW, 0);
  return { actual, committed, actualKRW: sum(actual), committedKRW: sum(committed) };
}

export const tripActualKRW = (tripId: ID) => tripLedger(tripId).actualKRW;

/** Turn a paid-booking row into a real expense (lets you set payer / split). */
export function recordBookingAsExpense(tripId: ID, row: LedgerRow, paidBy = '나') {
  if (!row.bookingId) return;
  addExpense({ tripId, bookingId: row.bookingId, date: row.date || new Date().toISOString().slice(0, 10), vendor: row.label, category: row.category, amount: row.amountKRW, currency: 'KRW', fxRate: 1, method: '카드', paidBy, shared: true });
}

export const bookingChoices = (tripId: ID) => bookingItems(tripId).map((b) => ({ id: b.id, label: `${b.label} · ${b.amountKRW.toLocaleString('ko-KR')}원`, paid: b.paid }));

/* ---------------- summaries ---------------- */

const PLACE_TO_EXPENSE: Record<PlaceCategory, ExpenseCategory> = { 관광지: '관광·액티비티', 맛집: '식비', 카페: '식비', 쇼핑: '쇼핑', 숙소: '숙박', 액티비티: '관광·액티비티', 이동: '교통', 기타: '기타' };

export function planByCategory(tripId: ID) {
  const out: Partial<Record<ExpenseCategory, number>> = {};
  db.byTrip('places', tripId).filter((p) => !p.linkedType).forEach((p) => { const c = PLACE_TO_EXPENSE[p.category]; out[c] = (out[c] ?? 0) + (p.estCostKRW ?? 0); });
  const t = plannedCosts(tripId).transportKRW;
  if (t) out['교통'] = (out['교통'] ?? 0) + t;
  return out;
}

export function summarize(trip: Trip) {
  const { actual, committed, actualKRW, committedKRW } = tripLedger(trip.id);
  const total = budgetTotal(trip);
  const plan = planByCategory(trip.id);
  const planKRW = Object.values(plan).reduce((s, v) => s + (v ?? 0), 0);
  const cat = getBudget(trip.id)?.byCategory ?? {};
  const rows = EXPENSE_CATEGORIES.map((c) => ({
    category: c,
    budget: cat[c] ?? 0,
    actual: actual.filter((r) => r.category === c).reduce((s, r) => s + r.amountKRW, 0),
    committed: committed.filter((r) => r.category === c).reduce((s, r) => s + r.amountKRW, 0),
    planned: plan[c] ?? 0,
  }));
  const byDay = new Map<string, number>();
  actual.forEach((r) => byDay.set(r.date, (byDay.get(r.date) ?? 0) + r.amountKRW));
  const done = trip.status === 'completed';
  return {
    total, actualKRW, committedKRW, planKRW, rows, actual, committed,
    remaining: total - actualKRW - committedKRW,
    usePct: total ? Math.round((actualKRW / total) * 100) : 0,
    perPerson: Math.round(actualKRW / Math.max(1, trip.travelers)),
    projected: done ? actualKRW : actualKRW + committedKRW + planKRW,
    daily: [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, krw]) => ({ date: date.slice(5), krw })),
  };
}

/* ---------------- settlement ---------------- */

export const ME = '나';
export const peopleOf = (t: Trip) => [ME, ...t.companions.filter((n) => n && n !== ME)];

export interface Transfer { from: string; to: string; amountKRW: number }

export function settle(trip: Trip) {
  const people = peopleOf(trip);
  const paid: Record<string, number> = {}, share: Record<string, number> = {};
  people.forEach((p) => { paid[p] = 0; share[p] = 0; });
  const unknown = new Set<string>();
  db.byTrip('expenses', trip.id).forEach((e) => {
    const payer = e.paidBy && people.includes(e.paidBy) ? e.paidBy : ME;
    if (e.paidBy && !people.includes(e.paidBy)) unknown.add(e.paidBy);
    paid[payer] += e.amountKRW;
    if (e.shared === false) { share[payer] += e.amountKRW; return; }
    const part = (e.participants?.length ? e.participants : people).filter((p) => people.includes(p));
    const among = part.length ? part : people;
    // split in whole won; remainder goes to the first participant so totals always match
    const each = Math.floor(e.amountKRW / among.length);
    among.forEach((p, i) => (share[p] += each + (i === 0 ? e.amountKRW - each * among.length : 0)));
  });
  const net = Object.fromEntries(people.map((p) => [p, paid[p] - share[p]]));
  const debtors = people.filter((p) => net[p] < 0).map((p) => ({ p, v: -net[p] })).sort((a, b) => b.v - a.v);
  const creditors = people.filter((p) => net[p] > 0).map((p) => ({ p, v: net[p] })).sort((a, b) => b.v - a.v);
  const transfers: Transfer[] = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amt = Math.min(debtors[i].v, creditors[j].v);
    if (amt > 0) transfers.push({ from: debtors[i].p, to: creditors[j].p, amountKRW: amt });
    debtors[i].v -= amt; creditors[j].v -= amt;
    if (debtors[i].v <= 0) i++;
    if (creditors[j].v <= 0) j++;
  }
  return { people, paid, share, net, transfers, unknownPayers: [...unknown], missingPeople: Math.max(0, trip.travelers - people.length) };
}
