import { useEffect, useState } from 'react';
import { Button, Modal, toast } from '@/components/ui';
import FileField, { FileDraft } from './FileField';
import { BOOKING_STATUS, PAYMENT_STATUS } from './FlightFormModal';
import { BookingStatus, Hotel, ID, PaymentStatus, PriceSource, Trip } from '@/types/models';
import { addHotel, attachFile, removeFile, saveHotel } from '@/services/bookingService';
import { daysBetween, errMsg, fileToCompressedDataUrl } from '@/lib/format';
import PlaceSearch from '@/components/live/PlaceSearch';
import { cityQuery } from '@/integrations/live';

const AMENITIES = ['와이파이', '조식', '수영장', '세탁실', '피트니스', '스파', '주차', '엘리베이터'];

const blank = (t: Trip) => ({
  name: '', address: '', lat: '', lng: '', image: undefined as string | undefined, rating: '', checkIn: t.startDate, checkOut: t.endDate, checkInTime: '15:00', checkOutTime: '11:00',
  price: '', priceSource: 'user' as PriceSource, breakfast: false, freeCancel: false, amenities: [] as string[], bookingRef: '',
  status: 'considering' as BookingStatus, paymentStatus: 'unpaid' as PaymentStatus, airportMin: '', transitScore: '3', sightsScore: '3',
});
type Draft = ReturnType<typeof blank>;

const toDraft = (h: Hotel): Draft => ({
  name: h.name, address: h.address, lat: h.lat?.toString() ?? '', lng: h.lng?.toString() ?? '', image: h.image, rating: h.rating?.toString() ?? '',
  checkIn: h.checkIn, checkOut: h.checkOut, checkInTime: h.checkInTime ?? '15:00', checkOutTime: h.checkOutTime ?? '11:00', price: String(h.pricePerNightKRW),
  priceSource: h.priceSource, breakfast: h.breakfast, freeCancel: h.freeCancel, amenities: h.amenities, bookingRef: h.bookingRef ?? '', status: h.status,
  paymentStatus: h.paymentStatus, airportMin: h.airportMin?.toString() ?? '', transitScore: String(h.transitScore ?? 3), sightsScore: String(h.sightsScore ?? 3),
});

export default function HotelFormModal({ open, onClose, trip, hotel }: { open: boolean; onClose: () => void; trip: Trip; hotel?: Hotel }) {
  const [d, setD] = useState<Draft>(blank(trip));
  const [files, setFiles] = useState<FileDraft>({ keep: [], add: [] });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setD(hotel ? toDraft(hotel) : blank(trip));
    setFiles({ keep: hotel?.fileIds ?? [], add: [] });
    setErr('');
  }, [open, hotel, trip]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const text = (k: keyof Draft, label: string, props: Record<string, unknown> = {}) => (
    <div><label className="field-label">{label}</label><input className="field" value={(d[k] as string) ?? ''} onChange={(e) => set(k, e.target.value as never)} {...props} /></div>
  );

  const submit = async () => {
    if (!d.name.trim()) return setErr('호텔 이름을 입력해 주세요.');
    if (daysBetween(d.checkIn, d.checkOut) < 1) return setErr('체크아웃은 체크인 다음 날 이후여야 해요.');
    if (d.price === '' || Number(d.price) < 0) return setErr('1박 가격을 입력해 주세요.');
    if (d.rating && (Number(d.rating) < 0 || Number(d.rating) > 5)) return setErr('평점은 0~5 사이로 입력해 주세요.');
    if ((d.lat && !d.lng) || (!d.lat && d.lng)) return setErr('위도와 경도를 함께 입력하거나 둘 다 비워 주세요.');
    setBusy(true);
    try {
      const ids: ID[] = [...files.keep];
      for (const f of files.add) ids.push((await attachFile(trip.id, f)).id);
      (hotel?.fileIds ?? []).filter((x) => !files.keep.includes(x)).forEach(removeFile);
      const payload = {
        name: d.name.trim(), address: d.address.trim(), lat: d.lat ? Number(d.lat) : undefined, lng: d.lng ? Number(d.lng) : undefined, image: d.image,
        rating: d.rating ? Number(d.rating) : undefined, checkIn: d.checkIn, checkOut: d.checkOut, checkInTime: d.checkInTime, checkOutTime: d.checkOutTime,
        pricePerNightKRW: Number(d.price), priceSource: d.priceSource, breakfast: d.breakfast, freeCancel: d.freeCancel, amenities: d.amenities,
        bookingRef: d.bookingRef || undefined, status: d.status, paymentStatus: d.paymentStatus, airportMin: d.airportMin ? Number(d.airportMin) : undefined,
        transitScore: Number(d.transitScore), sightsScore: Number(d.sightsScore), fileIds: ids,
      };
      if (hotel) saveHotel(hotel.id, payload); else addHotel({ tripId: trip.id, ...payload });
      toast(hotel ? '숙소를 수정하고 일정에 반영했어요' : '숙소를 저장하고 체크인·체크아웃을 일정에 반영했어요');
      onClose();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  const score = (k: 'transitScore' | 'sightsScore', label: string) => (
    <div><label className="field-label">{label} (1~5)</label><select className="field" value={d[k]} onChange={(e) => set(k, e.target.value)}>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></div>
  );

  return (
    <Modal open={open} onClose={onClose} title={hotel ? '숙소 수정' : '숙소 등록'}>
      <div className="space-y-4">
        {!hotel && <PlaceSearch city={cityQuery(trip)} placeholder="예: 호텔 이름 (호텔)" onPick={(p) => setD((x) => ({ ...x, name: p.name, address: p.address, lat: String(p.lat), lng: String(p.lng) }))} />}
        {text('name', '호텔명 *')}
        {text('address', '주소')}
        <div className="grid grid-cols-3 gap-3">{text('lat', '위도', { type: 'number', step: 'any', placeholder: '35.71' })}{text('lng', '경도', { type: 'number', step: 'any', placeholder: '139.81' })}{text('rating', '평점', { type: 'number', step: '0.1', max: 5 })}</div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="field-label">체크인 *</label><input type="date" className="field" value={d.checkIn} onChange={(e) => set('checkIn', e.target.value)} /></div>
          <div><label className="field-label">체크아웃 *</label><input type="date" className="field" min={d.checkIn} value={d.checkOut} onChange={(e) => set('checkOut', e.target.value)} /></div>
          <div><label className="field-label">체크인 시간</label><input type="time" className="field" value={d.checkInTime} onChange={(e) => set('checkInTime', e.target.value)} /></div>
          <div><label className="field-label">체크아웃 시간</label><input type="time" className="field" value={d.checkOutTime} onChange={(e) => set('checkOutTime', e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {text('price', '1박 가격 (원) *', { type: 'number', min: 0 })}
          <div><label className="field-label">가격 출처</label><select className="field" value={d.priceSource} onChange={(e) => set('priceSource', e.target.value as PriceSource)}><option value="user">직접 입력</option><option value="sample">샘플</option></select></div>
        </div>
        {d.price && daysBetween(d.checkIn, d.checkOut) > 0 && <p className="text-xs text-charcoal-soft">{daysBetween(d.checkIn, d.checkOut)}박 총 숙박비 ₩{(Number(d.price) * daysBetween(d.checkIn, d.checkOut)).toLocaleString()}</p>}
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={d.breakfast} onChange={(e) => set('breakfast', e.target.checked)} /> 조식 포함</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={d.freeCancel} onChange={(e) => set('freeCancel', e.target.checked)} /> 무료 취소</label>
        </div>
        <div>
          <label className="field-label">편의시설</label>
          <div className="flex flex-wrap gap-2">{AMENITIES.map((a) => (
            <button type="button" key={a} onClick={() => set('amenities', d.amenities.includes(a) ? d.amenities.filter((x) => x !== a) : [...d.amenities, a])}
              className={`chip ${d.amenities.includes(a) ? 'border-olive bg-olive text-white' : 'border-beige-dark text-charcoal-soft'}`}>{a}</button>))}</div>
        </div>
        <div className="grid grid-cols-3 gap-3">{text('airportMin', '공항까지(분)', { type: 'number', min: 0 })}{score('transitScore', '대중교통')}{score('sightsScore', '관광지 접근성')}</div>
        <p className="-mt-2 text-xs text-charcoal-mute">공항·교통·관광지 접근성은 직접 판단해 입력하는 비교용 값이에요.</p>
        <div className="grid grid-cols-3 gap-3">
          {text('bookingRef', '예약 번호')}
          <div><label className="field-label">예약 상태</label><select className="field" value={d.status} onChange={(e) => set('status', e.target.value as BookingStatus)}>{Object.entries(BOOKING_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div><label className="field-label">결제 상태</label><select className="field" value={d.paymentStatus} onChange={(e) => set('paymentStatus', e.target.value as PaymentStatus)}>{Object.entries(PAYMENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        </div>
        <div>
          <label className="field-label">대표 이미지</label>
          <input type="file" accept="image/*" className="text-xs" onChange={async (e) => { const f = e.target.files?.[0]; if (f) try { set('image', await fileToCompressedDataUrl(f, 900)); } catch (x) { toast(errMsg(x), 'error'); } }} />
          {d.image && <img src={d.image} alt="" className="mt-2 h-20 rounded-lg object-cover" />}
        </div>
        <FileField value={files} onChange={setFiles} />
        {err && <p role="alert" className="rounded-lg bg-clay/10 px-3 py-2 text-sm text-clay">{err}</p>}
        <p className="text-xs text-charcoal-mute">저장하면 체크인·체크아웃이 여행 일정에 자동 추가되고, 좌표가 있으면 지도(Phase 3)에 숙소 위치로 쓰입니다.</p>
        <div className="modal-actions"><Button variant="ghost" onClick={onClose}>취소</Button><Button onClick={submit} disabled={busy}>{busy ? '저장 중…' : '저장'}</Button></div>
      </div>
    </Modal>
  );
}
