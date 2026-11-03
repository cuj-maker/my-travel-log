import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, Card, SampleBadge, Tag, toast } from '@/components/ui';
import * as db from '@/db/database';
import { Review, Trip } from '@/types/models';
import { addTargetReview, removeReview, saveTripReview, targetReviews, tripReview } from '@/services/archiveService';

export function Stars({ value, onChange }: { value: number; onChange?: (n: number) => void }) {
  return (
    <span className="inline-flex gap-0.5" role={onChange ? 'radiogroup' : undefined} aria-label="만족도">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" disabled={!onChange} aria-label={`${n}점`} onClick={() => onChange?.(n)} className={`text-xl leading-none ${n <= value ? 'text-[#C29B3C]' : 'text-beige-dark'} ${onChange ? 'cursor-pointer hover:scale-110' : 'cursor-default'}`}>★</button>
      ))}
    </span>
  );
}

export function TripReviewForm({ trip }: { trip: Trip }) {
  const cur = tripReview(trip.id);
  const [rating, setRating] = useState(cur?.rating ?? 0);
  const [text, setText] = useState(cur?.text ?? '');
  const [revisit, setRevisit] = useState((cur?.revisit ?? []).join(', '));
  const [regrets, setRegrets] = useState(cur?.regrets ?? '');
  useEffect(() => { setRating(cur?.rating ?? 0); setText(cur?.text ?? ''); setRevisit((cur?.revisit ?? []).join(', ')); setRegrets(cur?.regrets ?? ''); }, [cur?.id, cur?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    if (!rating) return toast('만족도(별점)를 선택해 주세요', 'error');
    if (!text.trim()) return toast('후기 내용을 입력해 주세요', 'error');
    saveTripReview(trip.id, { rating, text, revisit: revisit.split(',').map((s) => s.trim()).filter(Boolean), regrets });
    toast('여행 후기를 저장했어요');
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-xl">여행 전체 후기</h3>{cur?.isSample && <SampleBadge />}</div>
      <div className="mt-3"><Stars value={rating} onChange={setRating} /></div>
      <textarea className="field mt-3 min-h-[110px]" value={text} onChange={(e) => setText(e.target.value)} placeholder="이번 여행은 어땠나요?" />
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div><label className="field-label">다시 방문하고 싶은 장소 (쉼표로 구분)</label><input className="field" value={revisit} onChange={(e) => setRevisit(e.target.value)} /></div>
        <div><label className="field-label">아쉬웠던 점</label><input className="field" value={regrets} onChange={(e) => setRegrets(e.target.value)} /></div>
      </div>
      <div className="mt-4 flex justify-end"><Button onClick={save}>{cur ? '후기 수정' : '후기 저장'}</Button></div>
    </Card>
  );
}

export function TargetReviews({ trip }: { trip: Trip }) {
  const list = targetReviews(trip.id);
  const places = db.byTrip('places', trip.id).filter((p) => !p.linkedType);
  const hotels = db.byTrip('hotels', trip.id);
  const targets = [...places.map((p) => ({ key: `p:${p.id}`, label: `${p.name} (${p.category})`, type: (p.category === '맛집' ? 'restaurant' : 'place') as Review['targetType'], id: p.id })),
    ...hotels.map((h) => ({ key: `h:${h.id}`, label: `${h.name} (숙소)`, type: 'hotel' as const, id: h.id }))];
  const [target, setTarget] = useState('');
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const nameOf = (r: Review) => targets.find((t) => t.id === r.targetId)?.label.replace(/ \(.*\)$/, '') ?? '삭제된 항목';
  const KIND = { place: '장소', hotel: '호텔', restaurant: '맛집', trip: '여행' } as const;

  const add = () => {
    const t = targets.find((x) => x.key === target);
    if (!t) return toast('후기를 쓸 대상을 선택해 주세요', 'error');
    if (!rating || !text.trim()) return toast('별점과 내용을 입력해 주세요', 'error');
    addTargetReview({ tripId: trip.id, targetType: t.type, targetId: t.id, rating, text: text.trim() });
    setTarget(''); setRating(0); setText(''); toast('후기를 저장했어요');
  };

  return (
    <Card>
      <h3 className="text-xl">장소 · 호텔 · 맛집 후기</h3>
      {list.length > 0 && (
        <ul className="mt-4 divide-y divide-beige/70">
          {list.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 py-3">
              <div><p className="text-sm font-medium">{nameOf(r)} <Tag tone="navy">{KIND[r.targetType]}</Tag> <Stars value={r.rating} /></p><p className="mt-1 text-sm text-charcoal-soft">{r.text}</p></div>
              <button aria-label="후기 삭제" className="rounded-full p-2 text-clay hover:bg-clay/10" onClick={() => { removeReview(r.id); toast('후기를 삭제했어요'); }}><Trash2 size={14} /></button>
            </li>))}
        </ul>)}
      <div className="mt-4 space-y-3 rounded-xl bg-cream p-4">
        <select className="field" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="후기 대상"><option value="">후기를 쓸 장소·호텔 선택</option>{targets.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select>
        <Stars value={rating} onChange={setRating} />
        <input className="field" value={text} onChange={(e) => setText(e.target.value)} placeholder="한 줄 후기" />
        <div className="flex justify-end"><Button variant="olive" onClick={add}>후기 추가</Button></div>
      </div>
    </Card>
  );
}
