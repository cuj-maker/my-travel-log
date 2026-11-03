import { useEffect, useState } from 'react';
import { Button, Modal, toast } from '@/components/ui';
import FileField, { FileDraft } from './FileField';
import { PAYMENT_STATUS } from './FlightFormModal';
import { Booking, BookingKind, ID, PaymentStatus, Trip } from '@/types/models';
import { addBooking, attachFile, removeFile, saveBooking } from '@/services/bookingService';
import { errMsg } from '@/lib/format';

export const KIND_LABEL: Record<BookingKind, string> = {
  flight: '항공권', hotel: '호텔', restaurant: '맛집', ticket: '입장권', show: '공연', activity: '액티비티', rentcar: '렌터카', pickup: '공항 픽업',
};
// flight/hotel bookings live in their own tabs, so the generic form offers the rest
const KINDS = (Object.keys(KIND_LABEL) as BookingKind[]).filter((k) => k !== 'flight' && k !== 'hotel');

const blank = () => ({ kind: 'restaurant' as BookingKind, vendor: '', title: '', bookingRef: '', bookedOn: '', useDate: '', useTime: '', amount: '', paymentStatus: 'unpaid' as PaymentStatus, cancelPolicy: '', memo: '' });
type Draft = ReturnType<typeof blank>;

export default function BookingFormModal({ open, onClose, trip, booking }: { open: boolean; onClose: () => void; trip: Trip; booking?: Booking }) {
  const [d, setD] = useState<Draft>(blank());
  const [files, setFiles] = useState<FileDraft>({ keep: [], add: [] });
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setD(booking ? { kind: booking.kind, vendor: booking.vendor, title: booking.title, bookingRef: booking.bookingRef ?? '', bookedOn: booking.bookedOn ?? '', useDate: booking.useAt?.slice(0, 10) ?? '', useTime: booking.useAt?.slice(11, 16) ?? '', amount: booking.amountKRW?.toString() ?? '', paymentStatus: booking.paymentStatus, cancelPolicy: booking.cancelPolicy ?? '', memo: booking.memo ?? '' } : { ...blank(), useDate: trip.startDate });
    setFiles({ keep: booking?.fileIds ?? [], add: [] });
    setErr('');
  }, [open, booking, trip]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const text = (k: keyof Draft, label: string, props: Record<string, unknown> = {}) => (
    <div><label className="field-label">{label}</label><input className="field" value={d[k]} onChange={(e) => set(k, e.target.value as never)} {...props} /></div>
  );

  const submit = async () => {
    if (!d.title.trim()) return setErr('예약 이름을 입력해 주세요.');
    if (!d.vendor.trim()) return setErr('예약처를 입력해 주세요.');
    if (d.amount && Number(d.amount) < 0) return setErr('금액은 0 이상이어야 해요.');
    try {
      const ids: ID[] = [...files.keep];
      for (const f of files.add) ids.push((await attachFile(trip.id, f)).id);
      (booking?.fileIds ?? []).filter((x) => !files.keep.includes(x)).forEach(removeFile);
      const payload = {
        kind: d.kind, vendor: d.vendor.trim(), title: d.title.trim(), bookingRef: d.bookingRef || undefined, bookedOn: d.bookedOn || undefined,
        useAt: d.useDate ? (d.useTime ? `${d.useDate}T${d.useTime}` : d.useDate) : undefined, amountKRW: d.amount ? Number(d.amount) : undefined,
        paymentStatus: d.paymentStatus, cancelPolicy: d.cancelPolicy || undefined, memo: d.memo || undefined, fileIds: ids,
      };
      if (booking) saveBooking(booking.id, payload); else addBooking({ tripId: trip.id, ...payload });
      toast('예약 정보를 저장했어요');
      onClose();
    } catch (e) { setErr(errMsg(e)); }
  };

  return (
    <Modal open={open} onClose={onClose} title={booking ? '예약 수정' : '예약 등록'}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="field-label">종류</label><select className="field" value={d.kind} onChange={(e) => set('kind', e.target.value as BookingKind)}>{KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></div>
          {text('vendor', '예약처 *')}
        </div>
        {text('title', '예약 이름 *', { placeholder: '예: 루브르 입장권 10:00' })}
        <div className="grid grid-cols-2 gap-3">
          {text('bookingRef', '예약 번호')}{text('bookedOn', '예약한 날', { type: 'date' })}
          {text('useDate', '이용 날짜', { type: 'date' })}{text('useTime', '이용 시간', { type: 'time' })}
          {text('amount', '예약 금액 (원)', { type: 'number', min: 0 })}
          <div><label className="field-label">결제 상태</label><select className="field" value={d.paymentStatus} onChange={(e) => set('paymentStatus', e.target.value as PaymentStatus)}>{Object.entries(PAYMENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        </div>
        {text('cancelPolicy', '취소 조건')}
        <div><label className="field-label">메모</label><textarea className="field min-h-[64px]" value={d.memo} onChange={(e) => set('memo', e.target.value)} /></div>
        <FileField value={files} onChange={setFiles} />
        {err && <p role="alert" className="rounded-lg bg-clay/10 px-3 py-2 text-sm text-clay">{err}</p>}
        <div className="modal-actions"><Button variant="ghost" onClick={onClose}>취소</Button><Button onClick={submit}>저장</Button></div>
      </div>
    </Modal>
  );
}
