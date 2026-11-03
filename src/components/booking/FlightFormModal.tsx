import { useEffect, useState } from 'react';
import { Button, Modal, toast } from '@/components/ui';
import FileField, { FileDraft } from './FileField';
import { BookingStatus, Flight, ID, PaymentStatus, PriceSource, Trip } from '@/types/models';
import { addFlight, attachFile, saveFlight } from '@/services/bookingService';
import { errMsg } from '@/lib/format';

export const BOOKING_STATUS: Record<BookingStatus, string> = { considering: '검토 중', reserved: '예약됨', paid: '결제 완료', cancelled: '취소됨' };
export const PAYMENT_STATUS: Record<PaymentStatus, string> = { unpaid: '미결제', paid: '결제 완료', refunded: '환불됨' };
export const PRICE_SOURCE: Record<PriceSource, string> = { sample: '샘플 가격', user: '직접 입력한 가격', api: '실시간 조회' };

const dtLocal = (d: string, t: string) => (d && t ? `${d}T${t}` : '');
const blank = (trip: Trip, dir: Flight['direction']) => {
  const date = dir === 'return' ? trip.endDate : trip.startDate;
  return {
    direction: dir, airline: '', flightNo: '', fromAirport: '', toAirport: '', depDate: date, depTime: '09:00', arrDate: date, arrTime: '12:00',
    duration: '', stops: '0', layover: '', price: '', priceSource: 'user' as PriceSource, checked: '', cabin: '', cabinClass: 'economy' as Flight['cabinClass'],
    refund: '', bookingRef: '', status: 'considering' as BookingStatus, paymentStatus: 'unpaid' as PaymentStatus,
  };
};
type Draft = ReturnType<typeof blank>;
export type FlightPrefill = Partial<Draft>;

const toDraft = (f: Flight): Draft => ({
  direction: f.direction, airline: f.airline, flightNo: f.flightNo, fromAirport: f.fromAirport, toAirport: f.toAirport,
  depDate: f.departAt.slice(0, 10), depTime: f.departAt.slice(11, 16), arrDate: f.arriveAt.slice(0, 10), arrTime: f.arriveAt.slice(11, 16),
  duration: String(f.durationMin), stops: String(f.stops), layover: f.layovers?.map((l) => `${l.airport} ${l.minutes}분`).join(', ') ?? '',
  price: String(f.priceKRW), priceSource: f.priceSource, checked: f.checkedBaggage ?? '', cabin: f.cabinBaggage ?? '', cabinClass: f.cabinClass,
  refund: f.refundPolicy ?? '', bookingRef: f.bookingRef ?? '', status: f.status, paymentStatus: f.paymentStatus,
});

export default function FlightFormModal({ open, onClose, trip, flight, direction = 'outbound', prefill }: { open: boolean; onClose: () => void; trip: Trip; flight?: Flight; direction?: Flight['direction']; prefill?: FlightPrefill }) {
  const [d, setD] = useState<Draft>(blank(trip, direction));
  const [files, setFiles] = useState<FileDraft>({ keep: [], add: [] });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setD(flight ? toDraft(flight) : { ...blank(trip, direction), ...(prefill ?? {}) });
    setFiles({ keep: flight?.fileIds ?? [], add: [] });
    setErr('');
  }, [open, flight, trip, direction, prefill]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const input = (k: keyof Draft, label: string, props: Record<string, unknown> = {}) => (
    <div><label className="field-label">{label}</label><input className="field" value={d[k] as string} onChange={(e) => set(k, e.target.value as never)} {...props} /></div>
  );

  const submit = async () => {
    const depart = dtLocal(d.depDate, d.depTime), arrive = dtLocal(d.arrDate, d.arrTime);
    if (!d.airline.trim() || !d.flightNo.trim()) return setErr('항공사와 항공편명을 입력해 주세요.');
    if (!d.fromAirport.trim() || !d.toAirport.trim()) return setErr('출발·도착 공항을 입력해 주세요.');
    if (!depart || !arrive) return setErr('출발·도착 날짜와 시간을 입력해 주세요.');
    if (arrive <= depart && Number(d.duration) <= 0) return setErr('도착 시각이 출발보다 빨라요. 시차가 있다면 비행시간을 직접 입력해 주세요.');
    if (!(Number(d.price) >= 0) || d.price === '') return setErr('항공권 가격을 입력해 주세요. (모르면 0)');
    setBusy(true);
    try {
      const ids: ID[] = [...files.keep];
      for (const f of files.add) ids.push((await attachFile(trip.id, f)).id);
      // removed attachments are deleted from storage
      (flight?.fileIds ?? []).filter((x) => !files.keep.includes(x)).forEach((x) => import('@/services/bookingService').then((m) => m.removeFile(x)));
      const dur = Number(d.duration) || Math.max(0, Math.round((new Date(arrive).getTime() - new Date(depart).getTime()) / 60000));
      const payload = {
        direction: d.direction, airline: d.airline.trim(), flightNo: d.flightNo.trim().toUpperCase(), fromAirport: d.fromAirport.trim().toUpperCase(), toAirport: d.toAirport.trim().toUpperCase(),
        departAt: depart, arriveAt: arrive, durationMin: dur, stops: Number(d.stops) || 0,
        layovers: d.layover.trim() ? [{ airport: d.layover.trim(), minutes: 0 }] : undefined,
        priceKRW: Number(d.price), priceSource: d.priceSource, checkedBaggage: d.checked || undefined, cabinBaggage: d.cabin || undefined, cabinClass: d.cabinClass,
        refundPolicy: d.refund || undefined, bookingRef: d.bookingRef || undefined, status: d.status, paymentStatus: d.paymentStatus, fileIds: ids,
      };
      if (flight) saveFlight(flight.id, payload); else addFlight({ tripId: trip.id, ...payload });
      toast(flight ? '항공권을 수정하고 일정에 반영했어요' : '항공권을 저장하고 일정에 반영했어요');
      onClose();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={flight ? '항공권 수정' : '항공권 등록'}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div><label className="field-label">구분</label><select className="field" value={d.direction} onChange={(e) => set('direction', e.target.value as Draft['direction'])}><option value="outbound">출국</option><option value="return">귀국</option><option value="internal">국내선·구간</option></select></div>
          {input('airline', '항공사 *')}{input('flightNo', '편명 *', { placeholder: 'KE 703' })}
          {input('fromAirport', '출발 공항 *', { placeholder: 'ICN' })}{input('toAirport', '도착 공항 *', { placeholder: 'NRT' })}
          <div><label className="field-label">좌석 등급</label><select className="field" value={d.cabinClass} onChange={(e) => set('cabinClass', e.target.value as Draft['cabinClass'])}><option value="economy">일반석</option><option value="premium">프리미엄</option><option value="business">비즈니스</option><option value="first">일등석</option></select></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="field-label">출발 날짜 *</label><input type="date" className="field" value={d.depDate} onChange={(e) => set('depDate', e.target.value)} /></div>
          <div><label className="field-label">출발 시각 *</label><input type="time" className="field" value={d.depTime} onChange={(e) => set('depTime', e.target.value)} /></div>
          <div><label className="field-label">도착 날짜 *</label><input type="date" className="field" value={d.arrDate} onChange={(e) => set('arrDate', e.target.value)} /></div>
          <div><label className="field-label">도착 시각 *</label><input type="time" className="field" value={d.arrTime} onChange={(e) => set('arrTime', e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {input('duration', '비행시간(분)', { type: 'number', placeholder: '자동 계산' })}
          <div><label className="field-label">경유 횟수</label><select className="field" value={d.stops} onChange={(e) => set('stops', e.target.value)}><option value="0">직항</option><option value="1">1회</option><option value="2">2회</option></select></div>
          {input('layover', '경유 공항·대기', { placeholder: 'HND 3시간' })}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {input('price', '가격 (원) *', { type: 'number', min: 0 })}
          <div><label className="field-label">가격 출처</label><select className="field" value={d.priceSource} onChange={(e) => set('priceSource', e.target.value as PriceSource)}><option value="user">직접 입력</option><option value="sample">샘플</option>{d.priceSource === 'api' && <option value="api">실시간 조회 (Google 항공권)</option>}</select></div>
          {input('checked', '위탁수하물', { placeholder: '23kg' })}{input('cabin', '기내수하물', { placeholder: '10kg' })}
        </div>
        {input('refund', '환불·변경 조건', { placeholder: '출발 7일 전까지 무료 변경' })}
        <div className="grid grid-cols-3 gap-3">
          {input('bookingRef', '예약 번호')}
          <div><label className="field-label">예약 상태</label><select className="field" value={d.status} onChange={(e) => set('status', e.target.value as BookingStatus)}>{Object.entries(BOOKING_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div><label className="field-label">결제 상태</label><select className="field" value={d.paymentStatus} onChange={(e) => set('paymentStatus', e.target.value as PaymentStatus)}>{Object.entries(PAYMENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        </div>
        <FileField value={files} onChange={setFiles} />
        {err && <p role="alert" className="rounded-lg bg-clay/10 px-3 py-2 text-sm text-clay">{err}</p>}
        <p className="text-xs text-charcoal-mute">저장하면 출발·도착 항공편이 여행 일정의 해당 날짜에 자동으로 추가됩니다.</p>
        <div className="modal-actions"><Button variant="ghost" onClick={onClose}>취소</Button><Button onClick={submit} disabled={busy}>{busy ? '저장 중…' : '저장'}</Button></div>
      </div>
    </Modal>
  );
}
