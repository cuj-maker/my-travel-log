import { useEffect, useMemo, useState } from 'react';
import { Button, Modal, toast } from '@/components/ui';
import * as db from '@/db/database';
import { ItineraryDay, Place, PLACE_CATEGORIES, PlaceCategory } from '@/types/models';
import { addPlace, savePlace } from '@/services/plannerService';
import { errMsg, fileToCompressedDataUrl } from '@/lib/format';
import PlaceSearch from '@/components/live/PlaceSearch';
import { cityQuery } from '@/integrations/live';

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

const blank = (dayId: string) => ({
  itineraryId: dayId, name: '', category: '관광지' as PlaceCategory, time: '', stay: '60', cost: '', address: '', lat: '', lng: '', purpose: '', memo: '',
  needsReservation: false, indoor: false, openTime: '', closeTime: '', closedDays: [] as number[], image: undefined as string | undefined,
});
type Draft = ReturnType<typeof blank>;

const toDraft = (p: Place): Draft => ({
  itineraryId: p.itineraryId, name: p.name, category: p.category, time: p.time ?? '', stay: p.stayMin?.toString() ?? '', cost: p.estCostKRW?.toString() ?? '', address: p.address ?? '',
  lat: p.lat?.toString() ?? '', lng: p.lng?.toString() ?? '', purpose: p.purpose ?? '', memo: p.memo ?? '', needsReservation: !!p.needsReservation, indoor: !!p.indoor,
  openTime: p.openTime ?? '', closeTime: p.closeTime ?? '', closedDays: p.closedDays ?? [], image: p.image,
});

export default function PlaceFormModal({ open, onClose, tripId, days, dayId, place }: { open: boolean; onClose: () => void; tripId: string; days: ItineraryDay[]; dayId: string; place?: Place }) {
  const [d, setD] = useState<Draft>(blank(dayId));
  const [err, setErr] = useState('');
  useEffect(() => { if (open) { setD(place ? toDraft(place) : blank(dayId)); setErr(''); } }, [open, place, dayId]);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const trip = db.get('trips', tripId);

  // Place search = the user's own saved places (all trips); external place search arrives with a map API.
  const matches = useMemo(() => {
    const q = d.name.trim().toLowerCase();
    if (place || q.length < 1) return [];
    const seen = new Set<string>();
    return db.all('places').filter((p) => !p.linkedType && p.name.toLowerCase().includes(q) && !seen.has(p.name) && (seen.add(p.name), true)).slice(0, 4);
  }, [d.name, place]);

  const fill = (p: Place) => setD((x) => ({ ...x, name: p.name, category: p.category, address: p.address ?? '', lat: p.lat?.toString() ?? '', lng: p.lng?.toString() ?? '', stay: p.stayMin?.toString() ?? x.stay, cost: p.estCostKRW?.toString() ?? x.cost, openTime: p.openTime ?? '', closeTime: p.closeTime ?? '', closedDays: p.closedDays ?? [], indoor: !!p.indoor }));

  const submit = () => {
    if (!d.name.trim()) return setErr('장소 이름을 입력해 주세요.');
    if ((d.lat && !d.lng) || (!d.lat && d.lng)) return setErr('위도와 경도를 함께 입력하거나 둘 다 비워 주세요.');
    if (d.lat && (Math.abs(Number(d.lat)) > 90 || Math.abs(Number(d.lng)) > 180 || Number.isNaN(Number(d.lat)) || Number.isNaN(Number(d.lng)))) return setErr('좌표 범위가 올바르지 않아요. (위도 ±90, 경도 ±180)');
    if (d.stay && Number(d.stay) < 0) return setErr('체류시간은 0 이상이어야 해요.');
    if (d.cost && Number(d.cost) < 0) return setErr('비용은 0 이상이어야 해요.');
    if (d.needsReservation && !d.time) return setErr('예약이 필요한 장소는 방문 시간을 입력해 주세요. (동선 최적화에서 고정돼요)');
    try {
      const data = {
        tripId, itineraryId: d.itineraryId, name: d.name.trim(), category: d.category, time: d.time || undefined, stayMin: d.stay ? Number(d.stay) : undefined,
        estCostKRW: d.cost ? Number(d.cost) : undefined, address: d.address || undefined, lat: d.lat ? Number(d.lat) : undefined, lng: d.lng ? Number(d.lng) : undefined,
        purpose: d.purpose || undefined, memo: d.memo || undefined, needsReservation: d.needsReservation, indoor: d.indoor, openTime: d.openTime || undefined,
        closeTime: d.closeTime || undefined, closedDays: d.closedDays.length ? d.closedDays : undefined, image: d.image,
      };
      if (place) savePlace(place.id, data); else addPlace(data);
      toast(place ? '장소를 수정했어요' : '장소를 추가했어요. 이동시간과 비용을 다시 계산했어요');
      onClose();
    } catch (e) { setErr(errMsg(e)); }
  };

  const text = (k: keyof Draft, label: string, props: Record<string, unknown> = {}) => (
    <div><label className="field-label">{label}</label><input className="field" value={(d[k] as string) ?? ''} onChange={(e) => set(k, e.target.value as never)} {...props} /></div>
  );

  return (
    <Modal open={open} onClose={onClose} title={place ? '장소 수정' : '장소 추가'}>
      <div className="space-y-4">
        <PlaceSearch city={trip ? cityQuery(trip) : undefined} onPick={(p) => setD((x) => ({
          ...x, name: p.name, address: p.address, lat: String(p.lat), lng: String(p.lng),
          openTime: p.openTime ?? x.openTime, closeTime: p.closeTime ?? x.closeTime, closedDays: p.closedDays ?? x.closedDays,
        }))} />
        <div className="relative">
          {text('name', '장소 이름 *', { placeholder: '직접 입력하거나 저장된 장소 검색' })}
          {matches.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-beige-dark bg-paper shadow-lift">
              {matches.map((m) => <li key={m.id}><button type="button" onClick={() => fill(m)} className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-beige/50"><span>{m.name}</span><span className="text-xs text-charcoal-mute">{m.category} · 저장된 장소</span></button></li>)}
            </ul>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="field-label">날짜</label><select className="field" value={d.itineraryId} onChange={(e) => set('itineraryId', e.target.value)}>{days.map((x) => <option key={x.id} value={x.id}>DAY {x.dayIndex} · {x.date.slice(5)}</option>)}</select></div>
          <div><label className="field-label">카테고리</label><select className="field" value={d.category} onChange={(e) => set('category', e.target.value as PlaceCategory)}>{PLACE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
          {text('time', '방문 시간', { type: 'time' })}{text('stay', '체류시간(분)', { type: 'number', min: 0 })}
          {text('cost', '예상 비용 (원)', { type: 'number', min: 0 })}{text('purpose', '방문 목적')}
        </div>
        {text('address', '주소')}
        <div className="grid grid-cols-2 gap-3">{text('lat', '위도', { type: 'number', step: 'any', placeholder: '35.7148' })}{text('lng', '경도', { type: 'number', step: 'any', placeholder: '139.7967' })}</div>
        <p className="-mt-2 text-xs text-charcoal-mute">좌표가 있어야 지도와 이동시간 계산에 포함돼요. 위의 구글 검색으로 고르면 자동으로 채워져요.</p>
        <div className="grid grid-cols-2 gap-3">{text('openTime', '오픈 시간', { type: 'time' })}{text('closeTime', '마감 시간', { type: 'time' })}</div>
        <div>
          <label className="field-label">휴무 요일</label>
          <div className="flex gap-1.5">{WEEK.map((w, i) => (
            <button type="button" key={w} onClick={() => set('closedDays', d.closedDays.includes(i) ? d.closedDays.filter((x) => x !== i) : [...d.closedDays, i])}
              className={`chip !px-3 ${d.closedDays.includes(i) ? 'border-clay bg-clay text-white' : 'border-beige-dark text-charcoal-soft'}`}>{w}</button>))}</div>
        </div>
        <div className="flex flex-wrap gap-5 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={d.needsReservation} onChange={(e) => set('needsReservation', e.target.checked)} /> 예약 필요 (시간 고정)</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={d.indoor} onChange={(e) => set('indoor', e.target.checked)} /> 실내 장소 (비 오는 날 대체)</label>
        </div>
        <div><label className="field-label">메모</label><textarea className="field min-h-[60px]" value={d.memo} onChange={(e) => set('memo', e.target.value)} /></div>
        <div><label className="field-label">대표 이미지</label>
          <input type="file" accept="image/*" className="text-xs" onChange={async (e) => { const f = e.target.files?.[0]; if (f) try { set('image', await fileToCompressedDataUrl(f, 700)); } catch (x) { toast(errMsg(x), 'error'); } }} />
          {d.image && <img src={d.image} alt="" className="mt-2 h-16 rounded-lg object-cover" />}</div>
        {err && <p role="alert" className="rounded-lg bg-clay/10 px-3 py-2 text-sm text-clay">{err}</p>}
        <div className="modal-actions"><Button variant="ghost" onClick={onClose}>취소</Button><Button onClick={submit}>저장</Button></div>
      </div>
    </Modal>
  );
}
