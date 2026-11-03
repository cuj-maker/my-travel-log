import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Card, EmptyState, SampleBadge, SectionTitle, Tag, toast } from '@/components/ui';
import { Cover } from '@/components/trip/TripCard';
import { PhotoGallery } from '@/components/archive/Photos';
import { TargetReviews, TripReviewForm } from '@/components/archive/Reviews';
import { EndTripModal, ReportCard, Timeline } from '@/components/archive/Story';
import { useDbVersion } from '@/store/useDb';
import * as db from '@/db/database';
import { effectiveStatus, getTrip } from '@/services/tripService';
import { regenerateReport, reopenTrip } from '@/services/archiveService';
import { fmtDate, fmtRange, krw, nightsLabel, STATUS_LABEL } from '@/lib/format';
import { tripLedger } from '@/services/budgetService';

export default function ArchiveTripPage() {
  useDbVersion();
  const { id = '' } = useParams();
  const trip = getTrip(id);
  const [ending, setEnding] = useState(false);
  if (!trip) return <div className="page py-20"><EmptyState title="여행을 찾을 수 없어요" action={<Link to="/archive"><Button>아카이브로</Button></Link>} /></div>;

  const status = effectiveStatus(trip);
  const done = status === 'completed';
  const photos = db.byTrip('photos', id).sort((a, b) => (a.takenAt ?? a.createdAt).localeCompare(b.takenAt ?? b.createdAt));
  const flights = db.byTrip('flights', id).sort((a, b) => a.departAt.localeCompare(b.departAt));
  const hotels = db.byTrip('hotels', id);
  const spent = tripLedger(id).actualKRW;

  return (
    <>
      <section className="relative">
        <div className="relative h-[42vh] min-h-[300px] overflow-hidden"><Cover trip={trip} /><div className="absolute inset-0 bg-gradient-to-t from-charcoal/80 via-charcoal/20 to-transparent" /></div>
        <div className="page absolute inset-x-0 bottom-0 pb-8 text-cream">
          <div className="mb-3 flex flex-wrap gap-2">{trip.isSample && <SampleBadge />}<Tag tone="olive">{STATUS_LABEL[status]}</Tag></div>
          <p className="eyebrow !text-cream/70">{trip.country} · {trip.city}</p>
          <h1 className="mt-1 text-4xl sm:text-5xl">{trip.title}</h1>
          <p className="mt-2 text-sm text-cream/85">{fmtRange(trip.startDate, trip.endDate)} · {nightsLabel(trip.startDate, trip.endDate)} · 총 경비 {krw(spent)}</p>
        </div>
      </section>

      <div className="page mt-6 flex flex-wrap items-center gap-2">
        {!done && <Button variant="olive" onClick={() => setEnding(true)}>여행 종료</Button>}
        {done && <><Button variant="ghost" onClick={() => { regenerateReport(id); toast('리포트를 다시 만들었어요'); }}>리포트 다시 만들기</Button>
          <Button variant="ghost" onClick={() => { if (window.confirm('여행을 다시 진행 상태로 되돌릴까요? 데이터는 그대로 유지돼요.')) { reopenTrip(id); toast('여행을 다시 열었어요'); } }}>종료 취소</Button></>}
        <Link to={`/trips/${id}`} className="ml-auto text-sm text-navy hover:underline">여행 상세 →</Link>
      </div>

      {done && trip.report && <section className="page pt-8"><ReportCard trip={trip} /></section>}

      <section className="page py-10">
        <SectionTitle eyebrow="Photo Album" title="사진" />
        <PhotoGallery trip={trip} photos={photos} />
      </section>

      <section className="page pb-10">
        <SectionTitle eyebrow="Timeline" title="날짜별 기록" />
        <p className="mb-5 text-xs text-charcoal-mute">장소 앞의 체크 표시를 눌러 실제로 다녀온 곳을 기록하세요. 사진과 지출은 장소에 연결되어 함께 보여요.</p>
        <Timeline trip={trip} />
      </section>

      <section className="page pb-10">
        <SectionTitle eyebrow="Travel Info" title="항공권 · 숙소" />
        {flights.length + hotels.length === 0 ? <p className="text-sm text-charcoal-mute">등록된 항공권·숙소가 없어요. <Link className="text-navy underline" to={`/flight-hotel?trip=${id}`}>등록하기</Link></p> : (
          <div className="grid gap-4 md:grid-cols-2">
            {flights.map((f) => <Card key={f.id}><p className="eyebrow">{f.airline} {f.flightNo}</p><p className="mt-1 font-serif text-xl">{f.fromAirport} → {f.toAirport}</p><p className="text-sm text-charcoal-soft">{fmtDate(f.departAt.slice(0, 10))} · {krw(f.priceKRW)}</p></Card>)}
            {hotels.map((h) => <Card key={h.id}><p className="eyebrow">숙소</p><p className="mt-1 font-serif text-xl">{h.name}</p><p className="text-sm text-charcoal-soft">{fmtRange(h.checkIn, h.checkOut)}</p></Card>)}
          </div>)}
      </section>

      <section className="page pb-12">
        <SectionTitle eyebrow="Reviews" title="후기" />
        <div className="space-y-6"><TripReviewForm trip={trip} /><TargetReviews trip={trip} /></div>
      </section>

      <EndTripModal trip={trip} open={ending} onClose={() => setEnding(false)} onDone={() => undefined} />
    </>
  );
}
