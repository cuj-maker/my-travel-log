import { useEffect, useState } from 'react';
import { FileText, X } from 'lucide-react';
import { Button, Modal, toast } from '@/components/ui';
import * as db from '@/db/database';
import { CurrencyCode, Expense, EXPENSE_CATEGORIES, ExpenseCategory, ID, Trip } from '@/types/models';
import { addExpense, attachReceipt, bookingChoices, CURRENCIES, fxRate, peopleOf, saveBudget, getBudget, saveExpense } from '@/services/budgetService';
import { addDays, errMsg, todayISO } from '@/lib/format';

const METHODS = ['카드', '현금', '간편결제', '기타'] as const;

const defaultDate = (t: Trip) => { const d = todayISO(); return d >= t.startDate && d <= t.endDate ? d : t.startDate; };

const blank = (t: Trip) => ({
  date: defaultDate(t), vendor: '', category: '식비' as ExpenseCategory, amount: '', currency: 'KRW' as CurrencyCode, rate: '1', method: '카드' as Expense['method'],
  paidBy: '나', shared: true, participants: [] as string[], placeId: '', bookingId: '', memo: '', saveRate: false,
});
type Draft = ReturnType<typeof blank>;

export default function ExpenseFormModal({ open, onClose, trip, expense }: { open: boolean; onClose: () => void; trip: Trip; expense?: Expense }) {
  const people = peopleOf(trip);
  const [d, setD] = useState<Draft>(blank(trip));
  const [receipt, setReceipt] = useState<{ keep?: ID; add?: File }>({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErr('');
    if (expense) {
      setD({ date: expense.date, vendor: expense.vendor, category: expense.category, amount: String(expense.amount), currency: expense.currency, rate: String(expense.fxRate), method: expense.method ?? '카드',
        paidBy: expense.paidBy ?? '나', shared: expense.shared !== false, participants: expense.participants ?? [], placeId: expense.placeId ?? '', bookingId: expense.bookingId ?? '', memo: expense.memo ?? '', saveRate: false });
      setReceipt({ keep: expense.receiptFileId });
    } else { setD(blank(trip)); setReceipt({}); }
  }, [open, expense, trip]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const fx = fxRate(trip.id, d.currency);
  const pickCurrency = (c: CurrencyCode) => setD((p) => ({ ...p, currency: c, rate: String(fxRate(trip.id, c).rate), saveRate: false }));
  const krwPreview = Math.round((Number(d.amount) || 0) * (Number(d.rate) || 0));
  const places = db.byTrip('places', trip.id).filter((p) => !p.linkedType);
  const bookings = bookingChoices(trip.id);

  const submit = async () => {
    if (!d.vendor.trim()) return setErr('지출 장소(또는 항목)를 입력해 주세요.');
    if (!(Number(d.amount) > 0)) return setErr('금액은 0보다 커야 해요.');
    if (!(Number(d.rate) > 0)) return setErr('환율을 입력해 주세요.');
    if (d.date < addDays(trip.startDate, -60) || d.date > addDays(trip.endDate, 60)) return setErr('지출 날짜가 여행 기간과 너무 멀어요. 날짜를 확인해 주세요.');
    setBusy(true);
    try {
      let receiptFileId = receipt.keep;
      if (expense?.receiptFileId && expense.receiptFileId !== receipt.keep) db.remove('files', expense.receiptFileId);
      if (receipt.add) receiptFileId = (await attachReceipt(trip.id, receipt.add)).id;
      const payload = {
        tripId: trip.id, date: d.date, vendor: d.vendor.trim(), category: d.category, amount: Number(d.amount), currency: d.currency, fxRate: Number(d.rate), method: d.method,
        paidBy: d.paidBy, shared: d.shared, participants: d.shared && d.participants.length && d.participants.length < people.length ? d.participants : undefined,
        placeId: d.placeId || undefined, bookingId: d.bookingId || undefined, receiptFileId, memo: d.memo || undefined,
      };
      if (d.saveRate && d.currency !== 'KRW') { const cur = getBudget(trip.id); saveBudget(trip.id, { fx: { ...(cur?.fx ?? {}), [d.currency]: Number(d.rate) } }); }
      if (expense) saveExpense(expense.id, payload); else addExpense(payload);
      toast(expense ? '지출을 수정했어요' : '지출을 기록했어요');
      onClose();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  const toggle = (name: string) => set('participants', d.participants.includes(name) ? d.participants.filter((x) => x !== name) : [...d.participants, name]);

  return (
    <Modal open={open} onClose={onClose} title={expense ? '지출 수정' : '지출 입력'}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="field-label">날짜 *</label><input type="date" className="field" value={d.date} onChange={(e) => set('date', e.target.value)} /></div>
          <div><label className="field-label">카테고리</label><select className="field" value={d.category} onChange={(e) => set('category', e.target.value as ExpenseCategory)}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
        </div>
        <div><label className="field-label">지출 장소·항목 *</label><input className="field" value={d.vendor} onChange={(e) => set('vendor', e.target.value)} placeholder="예: 이치란 라멘" autoFocus /></div>
        <div className="grid grid-cols-[1fr_1fr] gap-3">
          <div><label className="field-label">금액 *</label><input type="number" min={0} step="any" className="field" value={d.amount} onChange={(e) => set('amount', e.target.value)} /></div>
          <div><label className="field-label">통화</label><select className="field" value={d.currency} onChange={(e) => pickCurrency(e.target.value as CurrencyCode)}>{CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}</select></div>
        </div>
        {d.currency !== 'KRW' && (
          <div className="rounded-xl bg-cream p-3">
            <div className="grid grid-cols-[1fr_auto] items-end gap-3">
              <div><label className="field-label">환율 (1 {d.currency} = ? 원)</label><input type="number" min={0} step="any" className="field" value={d.rate} onChange={(e) => set('rate', e.target.value)} /></div>
              <p className="pb-2.5 text-sm">≈ <b>₩{krwPreview.toLocaleString('ko-KR')}</b></p>
            </div>
            <p className="mt-2 text-xs text-charcoal-mute">{Number(d.rate) === fx.rate ? (fx.source === 'sample' ? '샘플 환율이에요(실시간 환율을 불러오지 못했어요). 실제 결제 환율로 고쳐 주세요.' : fx.source === 'live' ? '오늘의 시장 환율이에요(카드 결제 환율과 조금 다를 수 있어요).' : '이 여행에 저장된 환율이에요.') : '직접 입력한 환율이에요.'}</p>
            <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={d.saveRate} onChange={(e) => set('saveRate', e.target.checked)} /> 이 여행의 {d.currency} 기본 환율로 저장</label>
          </div>
        )}
        {d.currency === 'KRW' && Number(d.amount) > 0 && <p className="text-xs text-charcoal-mute">원화 {Number(d.amount).toLocaleString('ko-KR')}원</p>}
        <div className="grid grid-cols-2 gap-3">
          <div><label className="field-label">결제 수단</label><select className="field" value={d.method} onChange={(e) => set('method', e.target.value as Draft['method'])}>{METHODS.map((m) => <option key={m}>{m}</option>)}</select></div>
          <div><label className="field-label">결제자</label><select className="field" value={d.paidBy} onChange={(e) => set('paidBy', e.target.value)}>{people.map((p) => <option key={p}>{p}</option>)}</select></div>
        </div>
        <div>
          <div className="flex gap-2">
            {[[true, '공동 경비 (나눠 냄)'], [false, '개인 지출 (정산 제외)']].map(([v, l]) => (
              <button type="button" key={String(v)} onClick={() => set('shared', v as boolean)} className={`chip ${d.shared === v ? 'border-olive bg-olive text-white' : 'border-beige-dark text-charcoal-soft'}`}>{l as string}</button>))}
          </div>
          {d.shared && people.length > 1 && (
            <div className="mt-3"><p className="field-label">함께 부담하는 사람 (선택 없으면 전원)</p>
              <div className="flex flex-wrap gap-2">{people.map((p) => <button type="button" key={p} onClick={() => toggle(p)} className={`chip ${d.participants.includes(p) ? 'border-navy bg-navy text-cream' : 'border-beige-dark text-charcoal-soft'}`}>{p}</button>)}</div></div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="field-label">연결된 일정 장소</label><select className="field" value={d.placeId} onChange={(e) => set('placeId', e.target.value)}><option value="">없음</option>{places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div><label className="field-label">연결된 예약</label><select className="field" value={d.bookingId} onChange={(e) => set('bookingId', e.target.value)}><option value="">없음</option>{bookings.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</select></div>
        </div>
        {d.bookingId && <p className="-mt-2 text-xs text-olive-dark">예약과 연결하면 예약 금액은 이 지출로만 집계돼 중복 계산되지 않아요.</p>}
        <div>
          <label className="field-label">영수증 (이미지 · PDF)</label>
          {(receipt.keep || receipt.add) && (
            <p className="mb-2 flex items-center gap-2 rounded-lg bg-cream px-3 py-2 text-sm"><FileText size={14} className="text-olive" /><span className="flex-1 truncate">{receipt.add?.name ?? db.get('files', receipt.keep!)?.name}</span>
              <button type="button" aria-label="영수증 삭제" onClick={() => setReceipt({})}><X size={14} /></button></p>)}
          <input type="file" accept="image/*,application/pdf" className="text-xs" onChange={(e) => { const f = e.target.files?.[0]; if (f) setReceipt({ add: f }); e.target.value = ''; }} />
        </div>
        <div><label className="field-label">메모</label><input className="field" value={d.memo} onChange={(e) => set('memo', e.target.value)} /></div>
        {err && <p role="alert" className="rounded-lg bg-clay/10 px-3 py-2 text-sm text-clay">{err}</p>}
        <div className="modal-actions"><Button variant="ghost" onClick={onClose}>취소</Button><Button onClick={submit} disabled={busy}>{busy ? '저장 중…' : '저장'}</Button></div>
      </div>
    </Modal>
  );
}
