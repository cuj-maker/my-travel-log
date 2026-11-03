import { useMemo, useState } from 'react';
import { Button, Card, PageHeader, PhaseNotice, Tag } from '@/components/ui';
import TripFormModal from '@/components/trip/TripFormModal';
import { useDbVersion } from '@/store/useDb';
import { buildProfile, recommend, saveRecommendation, Recommendation } from '@/services/recommendService';
import { TRAVEL_STYLES, TravelStyle } from '@/types/models';
import { krwShort } from '@/lib/format';
import { toast } from '@/components/ui';

export default function AiTravelPage() {
  useDbVersion();
  const [styles, setStyles] = useState<TravelStyle[]>([]);
  const [budget, setBudget] = useState('');
  const [month, setMonth] = useState('');
  const [pick, setPick] = useState<Recommendation | null>(null);

  const profile = buildProfile();
  const recs = useMemo(
    () => recommend({ styles, budgetKRW: budget ? Number(budget) : undefined, month: month ? Number(month) : undefined, limit: 6 }),
    [styles, budget, month, profile.n], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const topStyles = Object.entries(profile.styles).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s]) => s);

  return (
    <>
      <PageHeader eyebrow="AI Travel Discovery" title="다음 여행지 찾기"
        desc="규칙 기반 추천 엔진이 내 과거 여행(스타일·만족도·평균 지출·방문 도시)을 읽어 새로운 여행지를 골라요. AI API는 연결되어 있지 않습니다." />
      <section className="page">
        <Card className="mb-8">
          <p className="eyebrow mb-3">내 기록에서 읽은 취향</p>
          <p className="text-sm text-charcoal-soft">
            완료한 여행 {profile.n}건 · 선호 스타일 {topStyles.length ? topStyles.join(', ') : '아직 없음'} · 1인 평균 지출 {krwShort(profile.avgSpend)}
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_180px_140px]">
            <div>
              <label className="field-label">원하는 스타일 (비우면 내 취향 자동 적용)</label>
              <div className="flex flex-wrap gap-2">
                {TRAVEL_STYLES.map((s) => (
                  <button key={s} onClick={() => setStyles(styles.includes(s) ? styles.filter((x) => x !== s) : [...styles, s])}
                    className={`chip ${styles.includes(s) ? 'border-olive bg-olive text-white' : 'border-beige-dark text-charcoal-soft hover:bg-beige/50'}`}>{s}</button>
                ))}
              </div>
            </div>
            <div><label className="field-label">1인 예산 (원)</label><input type="number" className="field" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="자동" /></div>
            <div><label className="field-label">여행 월</label>
              <select className="field" value={month} onChange={(e) => setMonth(e.target.value)}><option value="">상관없음</option>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{i + 1}월</option>)}</select></div>
          </div>
        </Card>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {recs.map((r) => (
            <Card key={r.destination.id} className="group flex flex-col overflow-hidden !p-0">
              <div className="aspect-[16/10] overflow-hidden"><img src={r.destination.image} alt={r.destination.city} loading="lazy" className="img-zoom h-full w-full object-cover" /></div>
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-center justify-between"><div><p className="eyebrow">{r.destination.country}</p><h3 className="text-2xl">{r.destination.city}</h3></div><Tag tone="olive">{r.score}%</Tag></div>
                <p className="mt-2 text-sm italic text-charcoal-soft">{r.destination.blurb}</p>
                <ul className="mt-3 space-y-1 text-sm">{r.reasons.map((x) => <li key={x} className="before:mr-2 before:text-olive before:content-['✓']">{x}</li>)}</ul>
                <dl className="mt-4 grid grid-cols-2 gap-2 text-xs text-charcoal-soft">
                  <div><dt className="eyebrow">추천 기간</dt><dd>{r.nights}박 {r.nights + 1}일</dd></div>
                  <div><dt className="eyebrow">예상 총경비 (샘플)</dt><dd>{krwShort(r.estTotalKRW)}</dd></div>
                  <div><dt className="eyebrow">비행</dt><dd>약 {r.destination.flightHours}시간</dd></div>
                  <div><dt className="eyebrow">난이도</dt><dd>{'●'.repeat(r.destination.difficulty)}{'○'.repeat(3 - r.destination.difficulty)}</dd></div>
                </dl>
                <p className="mt-3 text-xs text-charcoal-mute">장점 {r.destination.pros.join(' · ')}<br />단점 {r.destination.cons.join(' · ')}</p>
                <div className="mt-auto pt-5"><Button variant="olive" className="w-full" onClick={() => setPick(r)}>이 여행지로 여행 만들기</Button></div>
              </div>
            </Card>
          ))}
        </div>
        <p className="mt-4 text-xs text-charcoal-mute">모든 금액은 정적 샘플 추정값이며 실시간 항공권·호텔 가격이 아닙니다.</p>
        <div className="mt-10"><PhaseNotice phase={6} title="여행지 비교 · 취향 분석 리포트" items={['여행지 간 비용·시간 비교표', '여행 소비 분석', '연도별 AI 여행 리포트', 'LLM 기반 추천 일정']} /></div>
      </section>

      <TripFormModal open={!!pick} onClose={() => setPick(null)}
        preset={pick ? { destinationId: pick.destination.id, country: pick.destination.country, city: pick.destination.city, coverImage: pick.destination.image, title: `${pick.destination.city} 여행`, styles: pick.destination.styles.slice(0, 2) } : undefined} />
      <SaveOnOpen r={pick} />
    </>
  );
}

/** Records the recommendation history when the user converts it into a trip. */
function SaveOnOpen({ r }: { r: Recommendation | null }) {
  const [saved, setSaved] = useState<string | null>(null);
  if (r && saved !== r.destination.id) { setSaved(r.destination.id); saveRecommendation(r); toast('추천 기록을 저장했어요'); }
  if (!r && saved) setSaved(null);
  return null;
}
