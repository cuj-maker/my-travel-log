/**
 * Rule-based recommender — works with no AI API (see integrations/ai.ts for the LLM hook).
 * Reads the user's real past trips: styles, satisfaction, average spend, visited cities.
 */
import * as db from '@/db/database';
import { DESTINATIONS } from '@/db/destinations';
import { Destination, TravelStyle } from '@/types/models';
import { completedTrips, tripSpentKRW } from './tripService';

export interface Recommendation {
  destination: Destination;
  score: number;
  reasons: string[];
  estTotalKRW: number;
  nights: number;
}

/** SAMPLE estimate: round-trip flight + hotel + local spending (per person for flight/daily). */
export function estimateTotal(d: Destination, nights: number) {
  return d.est.flightKRW + d.est.hotelPerNightKRW * nights + d.est.dailyLocalKRW * (nights + 1);
}

export interface Profile {
  styles: Record<string, number>;
  avgSpend: number;
  visitedCities: Set<string>;
  visitedCountries: Set<string>;
  n: number;
}

export function buildProfile(): Profile {
  const trips = completedTrips();
  const styles: Record<string, number> = {};
  trips.forEach((t) => {
    const r = db.byTrip('reviews', t.id).find((x) => x.targetType === 'trip');
    const weight = r ? r.rating / 3 : 1; // happier trips count more
    t.styles.forEach((s) => (styles[s] = (styles[s] ?? 0) + weight));
  });
  const prefs = db.all('travel_preferences')[0];
  prefs?.styles.forEach((s) => (styles[s] = (styles[s] ?? 0) + 0.5));
  const spends = trips.map((t) => tripSpentKRW(t.id) / Math.max(1, t.travelers)).filter((x) => x > 0);
  return {
    styles,
    avgSpend: spends.length ? spends.reduce((a, b) => a + b, 0) / spends.length : prefs?.budgetPerPersonKRW ?? 1500000,
    visitedCities: new Set(trips.flatMap((t) => [t.city, ...t.cities])),
    visitedCountries: new Set(trips.map((t) => t.country)),
    n: trips.length,
  };
}

export function recommend(opts: { budgetKRW?: number; month?: number; styles?: TravelStyle[]; limit?: number } = {}): Recommendation[] {
  const p = buildProfile();
  const wanted = opts.styles?.length
    ? opts.styles
    : (Object.entries(p.styles).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s]) => s) as TravelStyle[]);
  const budget = opts.budgetKRW ?? p.avgSpend;
  const planned = new Set(db.all('trips').filter((t) => t.status !== 'completed' && t.status !== 'cancelled').map((t) => t.city));

  return DESTINATIONS.filter((d) => !p.visitedCities.has(d.city) && !planned.has(d.city))
    .map((d) => {
      const nights = d.recommendedNights[0];
      const total = estimateTotal(d, nights);
      let score = 50;
      const reasons: string[] = [];
      const match = d.styles.filter((s) => wanted.includes(s));
      if (match.length) { score += match.length * 12; reasons.push(`선호 스타일(${match.join('·')})과 잘 맞아요`); }
      if (total <= budget) { score += 15; reasons.push(`예상 ${Math.round(total / 10000)}만원으로 평균 예산 안에 들어와요`); }
      else if (total <= budget * 1.3) score += 4;
      else score -= 12;
      if (opts.month && d.bestMonths.includes(opts.month)) { score += 10; reasons.push(`${opts.month}월은 여행하기 좋은 시기예요`); }
      if (p.visitedCountries.has(d.country)) { score += 6; reasons.push(`다녀온 ${d.country}와 비슷하지만 새로운 도시예요`); }
      else if (p.n) reasons.push('아직 가보지 않은 새로운 나라예요');
      if (!p.n) reasons.push('여행 기록이 쌓이면 추천이 더 정확해져요');
      return { destination: d, score: Math.min(99, Math.round(score)), reasons: reasons.slice(0, 3), estTotalKRW: total, nights };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.limit ?? 3);
}

export function saveRecommendation(r: Recommendation) {
  return db.insert('ai_recommendations', { destinationId: r.destination.id, engine: 'rules', score: r.score, reasons: r.reasons });
}
