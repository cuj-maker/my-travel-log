import { AlertTriangle, Check, Info } from 'lucide-react';
import { Button, Card, Modal, Tag, toast } from '@/components/ui';
import { PhotoImg } from './Photos';
import { Stars } from './Reviews';
import { Trip } from '@/types/models';
import { endChecks, endTrip, setVisited, timeline } from '@/services/archiveService';
import * as db from '@/db/database';
import { fmtDate, krw, todayISO } from '@/lib/format';

export function Timeline({ trip }: { trip: Trip }) {
  const days = timeline(trip.id);
  if (days.every((d) => d.places.length === 0 && d.extraPhotos.length === 0)) return <p className="text-sm text-charcoal-mute">타임라인에 표시할 일정이 아직 없어요. TRAVEL PLANNER에서 장소를 추가하면 여기에 나타나요.</p>;
  return (
    <div className="space-y-8">
      {days.map((d) => (
        <div key={d.id} className="grid gap-3 md:grid-cols-[170px_1fr]">
          <div><p className="font-serif text-2xl text-navy">DAY {d.dayIndex}</p><p className="eyebrow mt-1">{d.title ?? fmtDate(d.date)}</p>{d.title && <p className="mt-1 text-xs text-charcoal-mute">{fmtDate(d.date)}</p>}{d.spendKRW > 0 && <p className="mt-2 text-xs text-charcoal-soft">지출 {krw(d.spendKRW)}</p>}</div>
          <ol className="space-y-3 border-l border-beige-dark pl-5">
            {d.places.map(({ place: p, photos, spendKRW, review }) => (
              <li key={p.id} className="relative">
                <button type="button" aria-label={p.visited ? '방문 취소' : '방문 표시'} onClick={() => setVisited(p.id, !p.visited)}
                  className={`absolute -left-[31px] top-0.5 flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-paper ${p.visited ? 'bg-olive text-white' : 'bg-beige-dark text-transparent hover:text-white'}`}><Check size={12} /></button>
                <p className="text-sm"><span className="mr-2 text-charcoal-mute">{p.time ?? ''}</span><span className={p.visited ? 'font-medium' : 'text-charcoal-soft'}>{p.name}</span> <Tag>{p.category}</Tag>{!p.visited && <span className="ml-2 text-[11px] text-charcoal-mute">방문 미표시</span>}</p>
                {(spendKRW > 0 || review) && <p className="mt-0.5 text-xs text-charcoal-mute">{spendKRW > 0 ? `지출 ${krw(spendKRW)}` : ''}{review ? <span className="ml-2"><Stars value={review.rating} /> {review.text}</span> : null}</p>}
                {photos.length > 0 && <div className="mt-2 flex gap-2 overflow-x-auto no-scrollbar">{photos.map((ph) => <PhotoImg key={ph.id} photo={ph} className="h-20 w-20 shrink-0 rounded-lg" />)}</div>}
              </li>
            ))}
            {d.extraPhotos.length > 0 && <li><p className="text-xs text-charcoal-mute">이 날 찍은 다른 사진</p><div className="mt-2 flex gap-2 overflow-x-auto no-scrollbar">{d.extraPhotos.map((ph) => <PhotoImg key={ph.id} photo={ph} className="h-20 w-20 shrink-0 rounded-lg" />)}</div></li>}
            {d.extraSpendKRW > 0 && <li className="text-xs text-charcoal-mute">장소와 연결되지 않은 지출 {krw(d.extraSpendKRW)}</li>}
          </ol>
        </div>
      ))}
    </div>
  );
}

export function ReportCard({ trip }: { trip: Trip }) {
  const r = trip.report;
  if (!r) return null;
  const photos = db.byTrip('photos', trip.id);
  const best = photos.find((p) => p.id === r.bestPhotoId);
  const cats = Object.entries(r.byCategory).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  return (
    <Card className="overflow-hidden !p-0">
      <div className="grid md:grid-cols-[1fr_1.2fr]">
        {best ? <PhotoImg photo={best} className="h-56 w-full md:h-full" /> : <div className="h-40 bg-gradient-to-br from-beige to-olive-light md:h-full" />}
        <div className="p-6">
          <p className="eyebrow">Trip Report</p>
          <h3 className="mt-1 text-2xl">{trip.city}, {r.days}일의 기록</h3>
          {r.rating ? <div className="mt-2"><Stars value={r.rating} /></div> : null}
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="eyebrow">총 경비</dt><dd className="font-serif text-xl">{krw(r.totalSpendKRW)}</dd></div>
            <div><dt className="eyebrow">1인당</dt><dd className="font-serif text-xl">{krw(r.perPersonKRW)}</dd></div>
            <div><dt className="eyebrow">방문 장소</dt><dd>{r.placesVisited} / {r.placesTotal}곳</dd></div>
            <div><dt className="eyebrow">사진 · 항공 · 숙소</dt><dd>{r.photos}장 · {r.flights}편 · {r.hotels}곳</dd></div>
          </dl>
          {cats.length > 0 && <p className="mt-3 text-xs text-charcoal-soft">{cats.map(([c, v]) => `${c} ${krw(v ?? 0)}`).join(' · ')}</p>}
          <ul className="mt-4 space-y-1 text-sm">{r.highlights.map((h) => <li key={h} className="before:mr-2 before:text-olive before:content-['✓']">{h}</li>)}</ul>
          <p className="mt-4 text-[11px] text-charcoal-mute">{new Date(r.generatedAt).toLocaleDateString('ko-KR')} 기준 · 수정 후에는 ‘리포트 다시 만들기’로 갱신하세요</p>
        </div>
      </div>
    </Card>
  );
}

export function EndTripModal({ trip, open, onClose, onDone }: { trip: Trip; open: boolean; onClose: () => void; onDone: () => void }) {
  const checks = open ? endChecks(trip, todayISO()) : [];
  const run = () => {
    try { endTrip(trip.id); toast('여행을 종료하고 아카이브를 만들었어요'); onDone(); }
    catch (e) { toast(e instanceof Error ? e.message : '여행을 종료하지 못했어요', 'error'); }
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="여행을 종료할까요?">
      <p className="text-sm text-charcoal-soft">종료하면 상태가 ‘여행 완료’로 바뀌고, 일정·방문 장소·사진·후기·항공·숙소·경비가 이 여행에 묶여 하나의 아카이브와 리포트로 정리돼요. 아무것도 삭제되지 않으며 종료 후에도 모두 수정할 수 있어요.</p>
      {checks.length > 0 && <div className="mt-4 space-y-2">{checks.map((c, i) => (
        <div key={i} className={`flex gap-2 rounded-lg px-3 py-2 text-xs ${c.level === 'warn' ? 'bg-clay/10 text-clay' : 'bg-navy-light text-navy'}`}>{c.level === 'warn' ? <AlertTriangle size={14} className="mt-0.5 shrink-0" /> : <Info size={14} className="mt-0.5 shrink-0" />}{c.text}</div>))}</div>}
      <div className="mt-6 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>취소</Button><Button variant="olive" onClick={run}>여행 종료하고 아카이브 만들기</Button></div>
    </Modal>
  );
}
