import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ImagePlus } from 'lucide-react';
import { Button, Modal, toast } from '@/components/ui';
import { Trip, TripStatus, TRAVEL_STYLES, TravelStyle } from '@/types/models';
import { createTrip, updateTrip } from '@/services/tripService';
import { DESTINATIONS } from '@/db/destinations';
import { daysBetween, errMsg, fileToCompressedDataUrl, todayISO, addDays } from '@/lib/format';

interface Draft {
  title: string; country: string; city: string; startDate: string; endDate: string; travelers: number;
  companions: string; styles: TravelStyle[]; budget: string; status: TripStatus; memo: string; coverImage?: string; destinationId?: string;
}

const blank = (): Draft => ({
  title: '', country: '', city: '', startDate: addDays(todayISO(), 30), endDate: addDays(todayISO(), 34), travelers: 1,
  companions: '', styles: [], budget: '', status: 'planning', memo: '',
});

const fromTrip = (t: Trip): Draft => ({
  title: t.title, country: t.country, city: t.city, startDate: t.startDate, endDate: t.endDate, travelers: t.travelers,
  companions: t.companions.join(', '), styles: t.styles, budget: t.budgetTotalKRW ? String(t.budgetTotalKRW) : '', status: t.status,
  memo: t.memo ?? '', coverImage: t.coverImage, destinationId: t.destinationId,
});

export default function TripFormModal({ open, onClose, trip, preset }: { open: boolean; onClose: () => void; trip?: Trip; preset?: Partial<Draft> }) {
  const nav = useNavigate();
  const [d, setD] = useState<Draft>(blank());
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open) { setD(trip ? fromTrip(trip) : { ...blank(), ...preset }); setErr(''); }
  }, [open, trip, preset]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const toggleStyle = (s: TravelStyle) => set('styles', d.styles.includes(s) ? d.styles.filter((x) => x !== s) : [...d.styles, s]);

  const pickDestination = (id: string) => {
    const x = DESTINATIONS.find((z) => z.id === id);
    if (!x) return setD((p) => ({ ...p, destinationId: undefined }));
    setD((p) => ({ ...p, destinationId: id, country: x.country, city: x.city, coverImage: p.coverImage ?? x.image, title: p.title || `${x.city} 여행` }));
  };

  const onFile = async (f?: File) => {
    if (!f) return;
    try { set('coverImage', await fileToCompressedDataUrl(f)); } catch (e) { toast(errMsg(e), 'error'); }
  };

  const submit = () => {
    if (!d.title.trim()) return setErr('여행 제목을 입력해 주세요.');
    if (!d.country.trim() || !d.city.trim()) return setErr('여행 국가와 도시를 입력해 주세요.');
    if (!d.startDate || !d.endDate) return setErr('여행 날짜를 선택해 주세요.');
    if (daysBetween(d.startDate, d.endDate) < 0) return setErr('귀국일은 출발일보다 빠를 수 없어요.');
    if (daysBetween(d.startDate, d.endDate) > 120) return setErr('여행 기간은 120일 이내로 입력해 주세요.');
    const payload = {
      title: d.title.trim(), country: d.country.trim(), city: d.city.trim(), cities: [d.city.trim()],
      startDate: d.startDate, endDate: d.endDate, travelers: Math.max(1, Number(d.travelers) || 1),
      companions: d.companions.split(',').map((s) => s.trim()).filter(Boolean), styles: d.styles, status: d.status,
      coverImage: d.coverImage, budgetTotalKRW: d.budget ? Number(d.budget) : undefined, memo: d.memo, destinationId: d.destinationId,
    };
    try {
      if (trip) { updateTrip(trip.id, { ...payload, cities: Array.from(new Set([payload.city, ...trip.cities.filter((c) => c !== trip.city)])) }); toast('여행 정보를 저장했어요'); onClose(); }
      else { const t = createTrip(payload); toast('새 여행을 만들었어요'); onClose(); nav(`/trips/${t.id}`); }
    } catch (e) { setErr(errMsg(e)); }
  };

  return (
    <Modal open={open} onClose={onClose} title={trip ? '여행 정보 수정' : '새로운 여행 만들기'}>
      <div className="space-y-4">
        {!trip && (
          <div>
            <label className="field-label">여행지 빠른 선택 (선택)</label>
            <select className="field" value={d.destinationId ?? ''} onChange={(e) => pickDestination(e.target.value)}>
              <option value="">직접 입력</option>
              {DESTINATIONS.map((x) => <option key={x.id} value={x.id}>{x.country} · {x.city}</option>)}
            </select>
          </div>
        )}
        <div><label className="field-label">여행 제목 *</label><input className="field" value={d.title} onChange={(e) => set('title', e.target.value)} placeholder="예: 도쿄, 느린 봄 산책" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="field-label">국가 *</label><input className="field" value={d.country} onChange={(e) => set('country', e.target.value)} /></div>
          <div><label className="field-label">도시 *</label><input className="field" value={d.city} onChange={(e) => set('city', e.target.value)} /></div>
          <div><label className="field-label">출발일 *</label><input type="date" className="field" value={d.startDate} onChange={(e) => { set('startDate', e.target.value); if (e.target.value > d.endDate) set('endDate', e.target.value); }} /></div>
          <div><label className="field-label">귀국일 *</label><input type="date" className="field" min={d.startDate} value={d.endDate} onChange={(e) => set('endDate', e.target.value)} /></div>
          <div><label className="field-label">여행 인원</label><input type="number" min={1} className="field" value={d.travelers} onChange={(e) => set('travelers', Number(e.target.value))} /></div>
          <div><label className="field-label">전체 예산 (원)</label><input type="number" min={0} className="field" value={d.budget} onChange={(e) => set('budget', e.target.value)} placeholder="선택" /></div>
        </div>
        <div><label className="field-label">동행자 (쉼표로 구분)</label><input className="field" value={d.companions} onChange={(e) => set('companions', e.target.value)} placeholder="예: 지연, 민수" /></div>
        <div>
          <label className="field-label">여행 스타일</label>
          <div className="flex flex-wrap gap-2">
            {TRAVEL_STYLES.map((s) => (
              <button type="button" key={s} onClick={() => toggleStyle(s)} className={`chip ${d.styles.includes(s) ? 'border-olive bg-olive text-white' : 'border-beige-dark text-charcoal-soft hover:bg-beige/50'}`}>{s}</button>
            ))}
          </div>
        </div>
        {trip && trip.status !== 'completed' && (
          <div>
            <label className="field-label">진행 상태</label>
            <select className="field" value={d.status} onChange={(e) => set('status', e.target.value as TripStatus)}>
              <option value="planning">계획 중</option><option value="booked">예약 완료</option><option value="cancelled">취소됨</option>
            </select>
          </div>
        )}
        <div>
          <label className="field-label">대표 이미지</label>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-beige-dark p-3 text-sm text-charcoal-soft hover:bg-beige/30">
            {d.coverImage ? <img src={d.coverImage} alt="" className="h-14 w-20 rounded-lg object-cover" /> : <ImagePlus size={20} />}
            <span>{d.coverImage ? '이미지 변경' : '사진 업로드 (자동으로 용량을 줄여 저장)'}</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
        </div>
        <div><label className="field-label">메모</label><textarea className="field min-h-[72px]" value={d.memo} onChange={(e) => set('memo', e.target.value)} /></div>
        {err && <p role="alert" className="rounded-lg bg-clay/10 px-3 py-2 text-sm text-clay">{err}</p>}
        <div className="modal-actions">
          <Button variant="ghost" onClick={onClose}>취소</Button>
          <Button onClick={submit}>{trip ? '저장' : '여행 만들기'}</Button>
        </div>
      </div>
    </Modal>
  );
}
