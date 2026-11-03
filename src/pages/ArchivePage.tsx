import { Link } from 'react-router-dom';
import { PageHeader, EmptyState, SectionTitle, Tag, SampleBadge } from '@/components/ui';
import { Cover } from '@/components/trip/TripCard';
import { PhotoImg } from '@/components/archive/Photos';
import { Stars } from '@/components/archive/Reviews';
import { useDbVersion } from '@/store/useDb';
import * as db from '@/db/database';
import { completedTrips, effectiveStatus, listTrips } from '@/services/tripService';
import { tripReview } from '@/services/archiveService';
import { fmtRange, krw, nightsLabel } from '@/lib/format';
import { tripActualKRW } from '@/services/budgetService';

export default function ArchivePage() {
  useDbVersion();
  const done = completedTrips();
  const active = listTrips().filter((t) => effectiveStatus(t) !== 'completed' && effectiveStatus(t) !== 'cancelled');
  const photos = db.all('photos');
  const trips = (list: typeof done) => (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {list.map((t) => {
        const r = tripReview(t.id);
        return (
          <Link key={t.id} to={`/archive/${t.id}`} className="group overflow-hidden rounded-xl2 bg-white/70 shadow-card transition hover:-translate-y-1 hover:shadow-lift">
            <div className="relative aspect-[3/2] overflow-hidden"><Cover trip={t} />{t.isSample && <span className="absolute left-3 top-3"><SampleBadge /></span>}</div>
            <div className="p-5">
              <p className="eyebrow">{t.country} · {t.city}</p>
              <h3 className="mt-1 text-xl">{t.title}</h3>
              <p className="mt-1 text-xs text-charcoal-mute">{fmtRange(t.startDate, t.endDate)} · {nightsLabel(t.startDate, t.endDate)}</p>
              <div className="mt-3 flex items-center justify-between text-xs text-charcoal-soft">{r ? <Stars value={r.rating} /> : <Tag>후기 없음</Tag>}<span>{krw(tripActualKRW(t.id))} · 사진 {db.byTrip('photos', t.id).length}장</span></div>
            </div>
          </Link>);
      })}
    </div>
  );

  return (
    <>
      <PageHeader eyebrow="My Travel Archive" title="나의 여행 아카이브" desc="여행 하나가 하나의 이야기가 돼요. 사진, 타임라인, 후기, 경비를 한곳에 모으고 여행을 종료하면 리포트가 만들어져요." />
      <section className="page space-y-12">
        {active.length > 0 && (
          <div>
            <SectionTitle eyebrow="In Progress" title="기록 중인 여행" />
            <p className="-mt-3 mb-5 text-sm text-charcoal-soft">여행 중에도 사진과 방문 기록을 남길 수 있어요. 여행을 마치면 ‘여행 종료’로 아카이브를 완성하세요.</p>
            {trips(active)}
          </div>)}
        <div>
          <SectionTitle eyebrow="Completed" title="완성된 아카이브" />
          {done.length ? trips(done) : <EmptyState title="아직 완성된 아카이브가 없어요" desc="여행을 종료하면 이곳에 쌓여요." />}
        </div>
        {photos.length > 0 && (
          <div>
            <SectionTitle eyebrow="All Photos" title="전체 사진" />
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {photos.slice(0, 24).map((p) => <Link key={p.id} to={`/archive/${p.tripId}`}><PhotoImg photo={p} className="aspect-square w-full rounded-xl" /></Link>)}
            </div>
          </div>)}
      </section>
    </>
  );
}
