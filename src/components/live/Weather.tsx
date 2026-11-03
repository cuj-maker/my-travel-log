import { useEffect, useState } from 'react';
import { CloudRain, RefreshCw } from 'lucide-react';
import { Trip } from '@/types/models';
import { tripWeather, TripWeather, wmo } from '@/integrations/live';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

/** Hook: weather for a trip (forecast / actual / last-year reference). */
export function useTripWeather(trip?: Trip) {
  const [state, setState] = useState<{ data?: TripWeather | null; loading: boolean; error?: boolean }>({ loading: true });
  const key = trip ? `${trip.id}|${trip.city}|${trip.startDate}|${trip.endDate}` : '';
  useEffect(() => {
    if (!trip) return;
    let alive = true;
    setState({ loading: true });
    tripWeather(trip)
      .then((data) => alive && setState({ data, loading: false }))
      .catch(() => alive && setState({ loading: false, error: true }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

export function WeatherStrip({ trip, compact = false }: { trip: Trip; compact?: boolean }) {
  const { data, loading, error } = useTripWeather(trip);
  if (loading) return <div className="h-[118px] animate-pulse rounded-xl2 bg-beige/40" aria-label="날씨 불러오는 중" />;
  if (error || !data || !data.days.length) {
    return (
      <div className="flex items-center gap-2 rounded-xl2 border border-dashed border-beige-dark px-4 py-3 text-xs text-charcoal-mute">
        <RefreshCw size={13} /> {error ? '날씨를 불러오지 못했어요 (오프라인일 수 있어요).' : `‘${trip.city}’의 날씨 정보를 찾지 못했어요.`}
      </div>
    );
  }
  const rainy = data.days.filter((d) => wmo(d.code).rainy || (d.rainPct ?? 0) >= 60).length;
  return (
    <div className="rounded-xl2 border border-beige/80 bg-white/70 p-4 shadow-card sm:p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-medium">{data.label} <span className="text-xs font-normal text-charcoal-mute">· {data.place}</span></p>
        <p className="text-[11px] text-charcoal-mute">
          {rainy > 0 && <span className="mr-2 inline-flex items-center gap-1 text-navy"><CloudRain size={12} /> 비 소식 {rainy}일</span>}
          <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" className="underline">Open-Meteo</a>
        </p>
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar sm:-mx-5 sm:px-5">
        {data.days.map((d) => {
          const w = wmo(d.code);
          const dt = new Date(d.date + 'T00:00:00');
          return (
            <div key={d.date} className={`flex shrink-0 flex-col items-center rounded-xl px-2.5 py-2 text-center ${compact ? 'min-w-[56px]' : 'min-w-[64px]'} ${w.rainy ? 'bg-navy-light/60' : 'bg-cream'}`} title={w.label}>
              <span className="text-[11px] text-charcoal-mute">{dt.getMonth() + 1}/{dt.getDate()} {DOW[dt.getDay()]}</span>
              <span className="my-0.5 text-xl leading-none" aria-label={w.label}>{w.icon}</span>
              <span className="text-xs"><b className="font-semibold">{Math.round(d.max)}°</b> <span className="text-charcoal-mute">{Math.round(d.min)}°</span></span>
              {d.rainPct != null && d.rainPct > 0 && <span className="text-[10px] text-navy">☔ {d.rainPct}%</span>}
              {d.rainMm != null && d.rainMm >= 1 && <span className="text-[10px] text-navy">{Math.round(d.rainMm)}mm</span>}
            </div>
          );
        })}
      </div>
      {data.kind === 'lastYear' && <p className="mt-2 text-[11px] text-charcoal-mute">출발 16일 전부터는 실제 일기예보로 바뀌어요.</p>}
      {data.kind === 'forecast' && data.days.length > 0 && data.days[data.days.length - 1].date < trip.endDate && <p className="mt-2 text-[11px] text-charcoal-mute">예보는 오늘부터 16일까지만 제공돼요.</p>}
    </div>
  );
}
