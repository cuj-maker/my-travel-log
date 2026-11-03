import { Fragment, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MapPin, Navigation, AlertTriangle, ArrowDown, ArrowUp, CloudRain, Compass, Info, Lock, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Button, Card, EmptyState, Modal, PageHeader, SampleBadge, Tag, toast } from '@/components/ui';
import MapView, { DAY_COLORS } from '@/components/planner/MapView';
import PlaceFormModal from '@/components/planner/PlaceFormModal';
import { useDbVersion } from '@/store/useDb';
import { listTrips } from '@/services/tripService';
import {
  analyzeDay, applyOrder, copyPlaceToDay, dayPlaces, fmtMin, MODE_LABEL, MODES, movePlace, nearbySuggestions, optimizeDay, rainPlan,
  removePlace, renameDay, routesOfDay, setRouteMode, tripDays, tripHotelPoint,
} from '@/services/plannerService';
import { fmtDate, krw } from '@/lib/format';
import { mapsDirectionsUrl, mapsPlaceUrl } from '@/integrations/links';
import { cityQuery } from '@/integrations/live';
import { WeatherStrip } from '@/components/live/Weather';
import { ItineraryDay, Place, TransportMode } from '@/types/models';

type Panel = 'none' | 'nearby' | 'rain';

export default function PlannerPage() {
  useDbVersion();
  const [sp, setSp] = useSearchParams();
  const trips = listTrips();
  const trip = trips.find((t) => t.id === sp.get('trip')) ?? trips.find((t) => t.status !== 'completed') ?? trips[0];
  const [dayId, setDayId] = useState<string>('all');
  const [selected, setSelected] = useState<string>();
  const [form, setForm] = useState<{ open: boolean; place?: Place }>({ open: false });
  const [del, setDel] = useState<Place | null>(null);
  const [opt, setOpt] = useState<ReturnType<typeof optimizeDay> | null>(null);
  const [panel, setPanel] = useState<Panel>('none');
  const [start, setStart] = useState('09:00');

  const days = trip ? tripDays(trip.id) : [];
  const day: ItineraryDay | undefined = days.find((d) => d.id === dayId);
  const hotel = trip ? tripHotelPoint(trip.id) : undefined;
  const cityName = trip ? cityQuery(trip) : undefined;

  const layers = useMemo(() => (day ? [day] : days).map((d) => ({ dayIndex: d.dayIndex, places: dayPlaces(d.id) })), [days, day]);

  if (!trip) return <><PageHeader eyebrow="Travel Planner" title="여행 일정" /><div className="page"><EmptyState title="먼저 여행을 만들어 주세요" action={<Link to="/trips"><Button>여행 만들기</Button></Link>} /></div></>;

  const placeCount = days.reduce((s, d) => s + dayPlaces(d.id).length, 0);
  const pickTrip = (id: string) => { setSp({ trip: id }); setDayId('all'); setSelected(undefined); setPanel('none'); };

  const doOptimize = () => { if (day) { setOpt(optimizeDay(day, start)); } };
  const accept = () => { if (day && opt) { applyOrder(day.id, opt.orderIds, opt.times); toast('최적화된 순서와 시간을 적용했어요'); setOpt(null); } };

  const renderDay = (d: ItineraryDay, editable: boolean) => {
    const ps = dayPlaces(d.id);
    const routes = routesOfDay(d.id);
    const { stats, issues } = analyzeDay(d);
    const color = DAY_COLORS[(d.dayIndex - 1) % DAY_COLORS.length];
    return (
      <div key={d.id} className="rounded-xl2 border border-beige bg-white/70 p-5 shadow-card">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-2xl"><span style={{ color }}>●</span> DAY {d.dayIndex} <span className="ml-2 text-sm text-charcoal-mute">{fmtDate(d.date)}</span></h3>
          {!editable && <button className="text-xs text-navy hover:underline" onClick={() => setDayId(d.id)}>편집하기 →</button>}
        </div>
        {editable ? (
          <input aria-label="날짜 제목" defaultValue={d.title ?? ''} key={d.id + (d.title ?? '')} placeholder="이 날의 제목 (예: TOKYO ARRIVAL)" onBlur={(e) => e.target.value !== (d.title ?? '') && renameDay(d.id, e.target.value)}
            className="mt-1 w-full border-b border-transparent bg-transparent text-xs uppercase tracking-label text-charcoal-soft placeholder:normal-case placeholder:tracking-normal placeholder:text-charcoal-mute/60 focus:border-olive focus:outline-none" />
        ) : d.title && <p className="eyebrow mt-1">{d.title}</p>}

        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <Tag tone="navy">이동 {fmtMin(stats.travelMin)}</Tag><Tag>체류 {fmtMin(stats.stayMin)}</Tag><Tag tone="olive">교통비 예상 {krw(stats.transportKRW)}</Tag><Tag>장소 비용 {krw(stats.placesKRW)}</Tag>
        </div>
        {issues.length > 0 && <div className="mt-3 space-y-1.5" role="status">{issues.map((i, k) => (
          <div key={k} className={`flex gap-2 rounded-lg px-3 py-2 text-xs ${i.level === 'warn' ? 'bg-clay/10 text-clay' : 'bg-navy-light text-navy'}`}>{i.level === 'warn' ? <AlertTriangle size={14} className="mt-0.5 shrink-0" /> : <Info size={14} className="mt-0.5 shrink-0" />}{i.text}</div>))}</div>}

        {ps.length === 0 ? <p className="mt-4 text-sm text-charcoal-mute">아직 일정이 없어요.{editable && ' 장소를 추가해 보세요.'}</p> : (
          <ol className="mt-4">
            {ps.map((p, i) => {
              const r = routes[i];
              const sel = p.id === selected;
              const num = ps.slice(0, i + 1).filter((x) => typeof x.lat === 'number').length;
              return (
                <Fragment key={p.id}>
                  <li onClick={() => setSelected(p.id)} className={`flex items-start gap-3 rounded-xl px-3 py-2.5 transition ${sel ? 'bg-olive-light' : 'hover:bg-cream'}`}>
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white" style={{ background: typeof p.lat === 'number' ? color : '#B9B1A4' }}>{typeof p.lat === 'number' ? num : '·'}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm"><span className="mr-2 inline-block w-11 text-charcoal-mute">{p.time ?? '--:--'}</span><span className="font-medium">{p.name}</span> <Tag>{p.category}</Tag>
                        {p.needsReservation && <span className="ml-1"><Tag tone="clay">예약</Tag></span>}{p.linkedType && <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] text-olive"><Lock size={10} />예약 연동</span>}
                        {p.isSample && <span className="ml-1"><SampleBadge /></span>}</p>
                      <p className="mt-0.5 pl-[3.25rem] text-xs text-charcoal-mute">{[p.stayMin ? `체류 ${fmtMin(p.stayMin)}` : '', p.estCostKRW ? krw(p.estCostKRW) : '', p.address, typeof p.lat !== 'number' && !p.linkedType ? '좌표 없음' : ''].filter(Boolean).join(' · ')}
                        {p.category !== '이동' && <a href={mapsPlaceUrl(p, cityName)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="ml-1.5 inline-flex items-center gap-0.5 whitespace-nowrap text-navy underline-offset-2 hover:underline"><MapPin size={11} />구글 지도</a>}</p>
                    </div>
                    {editable && (
                      <span className="flex shrink-0 gap-0.5">
                        {!p.linkedType ? (<>
                          <button aria-label="위로" className="rounded-full p-1.5 hover:bg-beige/60 disabled:opacity-30" disabled={i === 0} onClick={(e) => { e.stopPropagation(); movePlace(p.id, -1); }}><ArrowUp size={14} /></button>
                          <button aria-label="아래로" className="rounded-full p-1.5 hover:bg-beige/60 disabled:opacity-30" disabled={i === ps.length - 1} onClick={(e) => { e.stopPropagation(); movePlace(p.id, 1); }}><ArrowDown size={14} /></button>
                          <button aria-label="수정" className="rounded-full p-1.5 hover:bg-beige/60" onClick={(e) => { e.stopPropagation(); setForm({ open: true, place: p }); }}><Pencil size={14} /></button>
                          <button aria-label="삭제" className="rounded-full p-1.5 text-clay hover:bg-clay/10" onClick={(e) => { e.stopPropagation(); setDel(p); }}><Trash2 size={14} /></button></>
                        ) : <Link to={`/flight-hotel?trip=${trip.id}`} className="self-center px-2 text-[11px] text-navy hover:underline">수정은 항공·숙소에서</Link>}
                      </span>
                    )}
                  </li>
                  {i < ps.length - 1 && (
                    <div className="ml-[2.1rem] flex items-center gap-2 border-l border-dashed border-beige-dark py-1.5 pl-5 text-[11px] text-charcoal-mute">
                      {r ? (<>
                        {editable ? <select aria-label="이동수단" value={r.mode} onChange={(e) => { setRouteMode(r.id, e.target.value as TransportMode); }} className="rounded-full border border-beige-dark bg-paper px-2 py-0.5 text-[11px]">{MODES.map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}</select> : <span>{MODE_LABEL[r.mode]}</span>}
                        <span>{r.distanceKm}km · {fmtMin(r.durationMin ?? 0)} · {r.estCostKRW ? krw(r.estCostKRW) : '무료'}{r.transfers ? ` · 환승 ${r.transfers}` : ''}</span>
                        <span className="rounded bg-beige/70 px-1.5 py-0.5 text-[10px] text-charcoal-soft" title="교통 API 미연결: 직선거리 기반 추정">예상</span>
                      </>) : <span>좌표가 없어 이동 정보를 계산할 수 없어요</span>}
                      {ps[i + 1].category !== '이동' && p.category !== '이동' && <a href={mapsDirectionsUrl(p, ps[i + 1], r?.mode ?? 'subway', cityName)} target="_blank" rel="noreferrer" className="ml-auto inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full border border-navy/30 px-2 py-0.5 text-[11px] text-navy hover:bg-navy-light"><Navigation size={10} />길찾기</a>}
                    </div>
                  )}
                </Fragment>
              );
            })}
          </ol>
        )}

        {editable && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-beige/70 pt-4">
            <Button onClick={() => setForm({ open: true })}><Plus size={14} /> 장소 추가</Button>
            <Button variant="olive" onClick={doOptimize} disabled={ps.length < 3}><Compass size={14} /> 동선 최적화</Button>
            <label className="flex items-center gap-1.5 text-xs text-charcoal-soft">시작 <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="rounded-lg border border-beige-dark bg-paper px-2 py-1 text-xs" /></label>
            <Button variant="ghost" onClick={() => setPanel(panel === 'nearby' ? 'none' : 'nearby')}><Sparkles size={14} /> 근처 추천</Button>
            <Button variant="ghost" onClick={() => setPanel(panel === 'rain' ? 'none' : 'rain')}><CloudRain size={14} /> 비 오는 날</Button>
          </div>
        )}

        {editable && panel === 'nearby' && (() => {
          const spots = nearbySuggestions(d, ['관광지', '액티비티', '맛집', '카페', '쇼핑'], 5);
          return (
            <div className="mt-4 rounded-xl bg-cream p-4">
              <p className="eyebrow mb-2">내가 저장한 장소 중 가까운 곳</p>
              {spots.length ? <ul className="space-y-2">{spots.map((s) => (
                <li key={s.place.id} className="flex items-center justify-between gap-3 text-sm"><span>{s.place.name} <Tag>{s.place.category}</Tag> <span className="text-xs text-charcoal-mute">{s.from} · 약 {s.km.toFixed(1)}km</span></span>
                  <Button variant="ghost" className="!px-3 !py-1 text-xs" onClick={() => { copyPlaceToDay(s.place, trip.id, d.id); toast('일정에 추가했어요'); }}>추가</Button></li>))}</ul>
                : <p className="text-sm text-charcoal-soft">추천할 저장된 장소가 아직 없어요. 장소 검색 API가 연결되기 전에는 내 기록 안에서만 찾아요.</p>}
            </div>
          );
        })()}
        {editable && panel === 'rain' && (() => {
          const { outdoor, alternatives } = rainPlan(d);
          return (
            <div className="mt-4 rounded-xl bg-navy-light p-4 text-sm text-navy">
              <p className="eyebrow mb-2 !text-navy/70">비 오는 날 대체</p>
              {outdoor.length ? <>
                <p>야외 일정: {outdoor.map((p) => p.name).join(', ')}</p>
                <p className="mt-1">{alternatives.length ? `이 여행의 다른 날 실내·식음 장소: ${alternatives.map((p) => p.name).join(', ')}` : '대체할 실내 장소가 없어요. 장소 추가 시 “실내 장소”로 표시해 두면 여기서 제안돼요.'}</p></>
                : <p>이 날은 야외 일정이 없어 비가 와도 그대로 진행할 수 있어요.</p>}
              <p className="mt-2 text-xs opacity-70">날씨 API 미연결: 실제 예보와 무관한 일반 제안이에요.</p>
            </div>
          );
        })()}
      </div>
    );
  };

  return (
    <>
      <PageHeader eyebrow="Travel Planner" title="여행 일정 · 지도" desc="날짜별로 장소를 추가·정렬하고 이동 경로를 확인해요. 이동시간과 교통비는 직선거리 기반 예상값이며 교통 API가 연결되면 실제 값으로 바뀝니다." />
      <section className="page">
        <div className="scroll-row mb-5">
          {trips.map((t) => <button key={t.id} onClick={() => pickTrip(t.id)} className={`chip ${t.id === trip.id ? 'border-navy bg-navy text-cream' : 'border-beige-dark text-charcoal-soft hover:bg-beige/50'}`}>{t.city} {t.startDate.slice(0, 4)}</button>)}
        </div>
        <div className="mb-6 flex gap-1.5 overflow-x-auto pb-1 no-scrollbar" role="tablist">
          <button role="tab" aria-selected={dayId === 'all'} onClick={() => setDayId('all')} className={`chip shrink-0 ${dayId === 'all' ? 'border-olive bg-olive text-white' : 'border-beige-dark text-charcoal-soft'}`}>전체</button>
          {days.map((d) => <button key={d.id} role="tab" aria-selected={dayId === d.id} onClick={() => setDayId(d.id)} className={`chip shrink-0 ${dayId === d.id ? 'border-olive bg-olive text-white' : 'border-beige-dark text-charcoal-soft'}`}>DAY {d.dayIndex}</button>)}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,1.05fr)]">
          <div className="order-2 space-y-5 lg:order-1">
            {days.length === 0 ? <EmptyState title="일정 일수가 없어요" desc="여행 날짜를 확인해 주세요." /> : day ? renderDay(day, true) : days.map((d) => renderDay(d, false))}
            {placeCount === 0 && !day && <p className="text-xs text-charcoal-mute">DAY를 선택해 첫 장소를 추가해 보세요.</p>}
          </div>
          <div className="order-1 lg:order-2"><div className="lg:sticky lg:top-24">
            <div className="mb-4"><WeatherStrip trip={trip} compact /></div>
            <MapView layers={layers} hotel={hotel} selectedId={selected} onSelect={setSelected} />
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-charcoal-soft">{(day ? [day] : days).map((d) => <span key={d.id}><span style={{ color: DAY_COLORS[(d.dayIndex - 1) % DAY_COLORS.length] }}>●</span> DAY {d.dayIndex}</span>)}</div>
          </div></div>
        </div>
      </section>

      {day && <PlaceFormModal open={form.open} onClose={() => setForm({ open: false })} tripId={trip.id} days={days} dayId={day.id} place={form.place} />}
      <Modal open={!!del} onClose={() => setDel(null)} title="장소를 삭제할까요?">
        <p className="text-sm text-charcoal-soft">「{del?.name}」을(를) 삭제하고 이동 정보를 다시 계산해요.</p>
        <div className="mt-6 flex justify-end gap-2"><Button variant="ghost" onClick={() => setDel(null)}>취소</Button><Button variant="danger" onClick={() => { if (del) removePlace(del.id); setDel(null); toast('삭제했어요'); }}>삭제</Button></div>
      </Modal>
      <Modal open={!!opt} onClose={() => setOpt(null)} title="동선 최적화 제안">
        {opt && day && <>
          <p className="text-sm text-charcoal-soft">가까운 곳끼리 묶어 순서를 정하고, 체류·이동시간과 오픈 시간을 반영해 시간을 다시 배치했어요. 예약 연동·예약 필요·시간이 정해진 식사는 그 시간에 고정하고, 사이 빈 시간에 가까운 곳부터 채워요. 좌표 없는 장소는 맨 뒤로 가요.</p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-center text-sm">
            <Card className="!p-3"><p className="eyebrow">이동 거리</p><p className="mt-1">{opt.beforeKm.toFixed(1)}km → <b>{opt.afterKm.toFixed(1)}km</b></p></Card>
            <Card className="!p-3"><p className="eyebrow">이동 시간(예상)</p><p className="mt-1">{fmtMin(opt.beforeMin)} → <b>{fmtMin(opt.afterMin)}</b></p></Card>
          </div>
          {!opt.moved && <p className="mt-3 rounded-lg bg-olive-light px-3 py-2 text-sm text-olive-dark">이미 효율적인 순서예요. 시간만 다시 배치할 수 있어요.</p>}
          {opt.skipped > 0 && <p className="mt-3 text-xs text-charcoal-mute">좌표 없는 장소 {opt.skipped}곳은 최적화에서 제외됐어요.</p>}
          <ol className="mt-4 space-y-1 text-sm">{opt.orderIds.map((id, i) => { const p = dayPlaces(day.id).find((x) => x.id === id)!; return <li key={id}><span className="mr-2 text-charcoal-mute">{i + 1}.</span><span className="mr-2 text-charcoal-mute">{opt.times[id] ?? p.time ?? '--:--'}</span>{p.name}</li>; })}</ol>
          <div className="mt-6 flex justify-end gap-2"><Button variant="ghost" onClick={() => setOpt(null)}>취소</Button><Button variant="olive" onClick={accept}>적용</Button></div>
        </>}
      </Modal>
    </>
  );
}
