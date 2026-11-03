import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, ArrowRight, Sparkles, Plane, Wallet, Camera } from 'lucide-react';
import { Button, Card, EmptyState, SectionTitle, Tag, SampleBadge } from '@/components/ui';
import TripCard, { Cover } from '@/components/trip/TripCard';
import TripFormModal from '@/components/trip/TripFormModal';
import { useDbVersion } from '@/store/useDb';
import * as db from '@/db/database';
import { completedTrips, tripSpentKRW, tripStats, upcomingTrips } from '@/services/tripService';
import { recommend } from '@/services/recommendService';
import { fmtLongToday, fmtRange, krw, krwShort } from '@/lib/format';

const QUOTES = [
  '낯선 골목의 아침 공기가 그리운 날이에요.',
  '짐은 가볍게, 마음은 느리게 떠나볼까요?',
  '다음 여행의 첫 페이지를 오늘 열어보세요.',
];

export default function HomePage() {
  useDbVersion();
  const [open, setOpen] = useState(false);
  const user = db.all('users')[0];
  const upcoming = upcomingTrips();
  const stats = tripStats();
  const recent = completedTrips().slice(0, 3);
  const recs = recommend({ limit: 3 });
  const quote = QUOTES[new Date().getDate() % QUOTES.length];

  return (
    <>
      {/* A. Welcome */}
      <section className="page animate-rise pb-4 pt-6 sm:pb-10 sm:pt-16">
        <p className="eyebrow mb-3 sm:mb-4">{fmtLongToday()}</p>
        <h1 className="max-w-3xl text-[1.9rem] leading-[1.2] sm:text-6xl sm:leading-[1.15]">
          안녕하세요, {user?.name ?? '여행자'}님.<br />
          <span className="text-2xl italic text-olive sm:text-6xl">{quote}</span>
        </h1>
        <div className="mt-8 hidden sm:block"><Button onClick={() => setOpen(true)}><Plus size={16} /> 새로운 여행 만들기</Button></div>
      </section>

      {/* Mobile quick actions (app-style icon row) */}
      <section className="page pb-2 sm:hidden">
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: '새 여행', icon: Plus, onClick: () => setOpen(true) },
            { label: '예약 등록', icon: Plane, to: '/flight-hotel' },
            { label: '경비 입력', icon: Wallet, to: '/budget' },
            { label: '사진·후기', icon: Camera, to: '/archive' },
          ].map((a) => {
            const inner = (<><span className="grid h-12 w-12 place-items-center rounded-2xl bg-olive-light text-olive-dark"><a.icon size={20} strokeWidth={1.8} /></span><span className="text-[11.5px] text-charcoal-soft">{a.label}</span></>);
            return a.to
              ? <Link key={a.label} to={a.to} className="flex flex-col items-center gap-1.5 rounded-2xl py-2 active:bg-beige/50">{inner}</Link>
              : <button key={a.label} onClick={a.onClick} className="flex flex-col items-center gap-1.5 rounded-2xl py-2 active:bg-beige/50">{inner}</button>;
          })}
        </div>
      </section>

      {/* B. Upcoming */}
      <section className="page py-5 sm:py-8">
        <SectionTitle eyebrow="Upcoming Travel" title="다가오는 여행" action={<Link to="/trips" className="text-sm text-navy hover:underline">전체 보기 →</Link>} />
        {upcoming.length ? (
          <div className="scroll-row snap-x snap-mandatory gap-3 sm:grid sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">{upcoming.slice(0, 3).map((t) => <div key={t.id} className={`shrink-0 snap-start sm:w-auto ${upcoming.length > 1 ? 'w-[82%]' : 'w-full'}`}><TripCard trip={t} /></div>)}</div>
        ) : (
          <EmptyState title="예정된 여행이 없어요" desc="새로운 여행을 만들거나 AI TRAVEL에서 다음 여행지를 찾아보세요." action={<Button onClick={() => setOpen(true)}>여행 만들기</Button>} />
        )}
      </section>

      {/* C. Stats */}
      <section className="page py-5 sm:py-8">
        <SectionTitle eyebrow="My Travel Statistics" title="나의 여행 숫자" />
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl2 border border-beige bg-beige sm:grid-cols-5">
          {[
            ['여행 횟수', `${stats.totalTrips}회`], ['방문 국가', `${stats.countries}개국`], ['방문 도시', `${stats.cities}개`],
            ['누적 여행일', `${stats.days}일`], ['누적 지출', krwShort(stats.spent)],
          ].map(([k, v]) => (
            <div key={k} className="bg-paper p-4 last:col-span-2 sm:p-6 sm:last:col-span-1">
              <p className="font-serif text-2xl text-navy sm:text-3xl">{v}</p>
              <p className="eyebrow mt-2">{k}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-charcoal-mute">방문 국가·도시·일수·지출은 종료(Completed)된 여행만 집계합니다.</p>
      </section>

      {/* D. Recent memories */}
      <section className="page py-5 sm:py-8">
        <SectionTitle eyebrow="Recent Memories" title="최근의 기억" action={<Link to="/archive" className="text-sm text-navy hover:underline">아카이브 →</Link>} />
        {recent.length ? (
          <div className="scroll-row snap-x snap-mandatory gap-3 md:grid md:grid-cols-3 md:gap-5">
            {recent.map((t) => {
              const review = db.byTrip('reviews', t.id).find((r) => r.targetType === 'trip');
              return (
                <Link key={t.id} to={`/archive/${t.id}`} className="group w-[78%] shrink-0 snap-start overflow-hidden rounded-xl2 bg-white/70 shadow-card transition hover:-translate-y-1 hover:shadow-lift sm:w-[45%] md:w-auto">
                  <div className="aspect-[3/2] overflow-hidden"><Cover trip={t} /></div>
                  <div className="p-5">
                    <div className="flex items-center gap-2"><p className="eyebrow">{t.city} · {fmtRange(t.startDate, t.endDate)}</p>{t.isSample && <SampleBadge />}</div>
                    <p className="mt-2 line-clamp-2 font-serif text-lg">{review?.text ?? t.title}</p>
                    <p className="mt-3 text-xs text-charcoal-mute">총 지출 {krw(tripSpentKRW(t.id))}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : <EmptyState title="아직 완료된 여행이 없어요" desc="여행을 종료하면 이곳에 기억이 쌓여요." />}
      </section>

      {/* E. Recommendation */}
      <section className="page py-5 sm:py-8">
        <SectionTitle eyebrow="Travel Recommendation" title="다음 여행은 여기 어때요?" action={<Link to="/ai-travel" className="text-sm text-navy hover:underline">더 보기 →</Link>} />
        <div className="scroll-row snap-x snap-mandatory gap-3 md:grid md:grid-cols-3 md:gap-5">
          {recs.map((r) => (
            <Card key={r.destination.id} className="group w-[78%] shrink-0 snap-start overflow-hidden !p-0 sm:w-[45%] md:w-auto">
              <div className="aspect-[16/10] overflow-hidden"><img src={r.destination.image} alt={r.destination.city} loading="lazy" className="img-zoom h-full w-full object-cover" /></div>
              <div className="p-5">
                <div className="flex items-center justify-between"><h3 className="text-xl">{r.destination.city}</h3><Tag tone="olive">{r.score}% 일치</Tag></div>
                <p className="mt-2 text-sm text-charcoal-soft">{r.reasons[0]}</p>
                <p className="mt-3 text-xs text-charcoal-mute">샘플 추정 {krwShort(r.estTotalKRW)} · {r.nights}박</p>
              </div>
            </Card>
          ))}
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-charcoal-mute"><Sparkles size={12} /> 과거 여행 기록으로 계산한 규칙 기반 추천이며, 금액은 샘플 추정값입니다.</p>
      </section>

      {/* F. Quick access */}
      <section className="page hidden py-8 sm:block">
        <SectionTitle eyebrow="Quick Access" title="빠른 실행" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <button onClick={() => setOpen(true)} className="rounded-xl2 border border-olive/40 bg-olive-light p-5 text-left transition hover:-translate-y-0.5 hover:shadow-card">
            <Plus size={18} className="text-olive-dark" /><p className="mt-3 font-medium">여행 만들기</p><p className="text-xs text-charcoal-soft">지금 사용 가능</p>
          </button>
          <Link to="/flight-hotel" className="rounded-xl2 border border-olive/40 bg-olive-light p-5 text-left transition hover:-translate-y-0.5 hover:shadow-card">
            <Plane size={18} className="text-olive-dark" /><p className="mt-3 font-medium">예약 정보 등록</p><p className="text-xs text-charcoal-soft">항공·호텔·예약</p>
          </Link>
          {[['/archive', '여행 기록 추가', '사진 · 후기 · 타임라인'], ['/budget', '경비 입력', '예산 · 지출 · 정산']].map(([to, t, d]) => (
            <Link key={t} to={to} className="rounded-xl2 border border-olive/40 bg-olive-light p-5 text-left transition hover:-translate-y-0.5 hover:shadow-card">
              <ArrowRight size={18} className="text-olive-dark" /><p className="mt-3 font-medium">{t}</p><p className="text-xs text-charcoal-soft">{d}</p>
            </Link>
          ))}
        </div>
      </section>

      <TripFormModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
