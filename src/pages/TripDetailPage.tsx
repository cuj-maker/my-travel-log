import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Pencil, Trash2, Plane, Map as MapIcon, Wallet, BookImage } from 'lucide-react';
import { Button, Card, EmptyState, Modal, SampleBadge, SectionTitle, Tag, toast } from '@/components/ui';
import { Cover } from '@/components/trip/TripCard';
import TripFormModal from '@/components/trip/TripFormModal';
import { useDbVersion } from '@/store/useDb';
import * as db from '@/db/database';
import { deleteTrip, effectiveStatus, getTrip, tripSpentKRW } from '@/services/tripService';
import { dday, fmtDateTime, fmtDuration, fmtRange, krw, nightsLabel, STATUS_LABEL } from '@/lib/format';
import { WeatherStrip } from '@/components/live/Weather';

const SRC_LABEL = { sample: '샘플 가격', user: '직접 입력', api: '실시간 조회' } as const;

export default function TripDetailPage() {
  useDbVersion();
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);
  const trip = getTrip(id);

  if (!trip) return <div className="page py-20"><EmptyState title="여행을 찾을 수 없어요" desc="삭제되었거나 잘못된 주소예요." action={<Link to="/trips"><Button>여행 목록</Button></Link>} /></div>;

  const status = effectiveStatus(trip);
  const flights = db.byTrip('flights', id);
  const hotels = db.byTrip('hotels', id);
  const days = db.byTrip('itineraries', id).sort((a, b) => a.dayIndex - b.dayIndex);
  const places = db.byTrip('places', id);
  const expenses = db.byTrip('expenses', id);
  const photos = db.byTrip('photos', id);
  const reviews = db.byTrip('reviews', id);
  const spent = tripSpentKRW(id);

  const counts = [['항공권', flights.length], ['숙소', hotels.length], ['일정 일수', days.length], ['장소', places.length], ['지출 내역', expenses.length], ['사진', photos.length], ['후기', reviews.length]];

  return (
    <>
      <section className="relative">
        <div className="relative h-[40vh] min-h-[280px] overflow-hidden sm:h-[46vh] sm:min-h-[320px]"><Cover trip={trip} /><div className="absolute inset-0 bg-gradient-to-t from-charcoal/80 via-charcoal/20 to-transparent" /></div>
        <div className="page absolute inset-x-0 bottom-0 pb-6 text-cream sm:pb-8">
          <div className="mb-3 flex flex-wrap gap-2">{trip.isSample && <SampleBadge />}<Tag tone="olive">{STATUS_LABEL[status]}</Tag>{status !== 'completed' && <Tag tone="beige">{dday(trip.startDate)}</Tag>}</div>
          <p className="eyebrow !text-cream/70">{trip.country} · {trip.city}</p>
          <h1 className="mt-1 text-[1.9rem] leading-tight sm:text-5xl">{trip.title}</h1>
          <p className="mt-2 text-sm text-cream/85">{fmtRange(trip.startDate, trip.endDate)} · {nightsLabel(trip.startDate, trip.endDate)} · {trip.travelers}명</p>
        </div>
      </section>

      {/* Mobile: app-style shortcut grid into every part of this trip */}
      <div className="page mt-5 sm:hidden">
        <div className="grid grid-cols-4 gap-2">
          {[
            { to: `/flight-hotel?trip=${trip.id}`, label: '항공·숙소', icon: Plane },
            { to: `/planner?trip=${trip.id}`, label: '일정·지도', icon: MapIcon },
            { to: `/budget?trip=${trip.id}`, label: '경비', icon: Wallet },
            { to: `/archive/${trip.id}`, label: '사진·후기', icon: BookImage },
          ].map((a) => (
            <Link key={a.label} to={a.to} className="flex flex-col items-center gap-1.5 rounded-2xl border border-beige bg-white/70 py-3 active:bg-beige/50">
              <a.icon size={20} strokeWidth={1.7} className="text-olive-dark" /><span className="text-[11.5px] text-charcoal-soft">{a.label}</span>
            </Link>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={() => setEdit(true)}><Pencil size={14} /> 수정</Button>
          <Button variant="danger" onClick={() => setDel(true)}><Trash2 size={14} /> 삭제</Button>
        </div>
      </div>

      <div className="page mt-8 hidden flex-wrap items-center gap-2 sm:flex">
        <Button variant="ghost" onClick={() => setEdit(true)}><Pencil size={14} /> 수정</Button>
        <Button variant="danger" onClick={() => setDel(true)}><Trash2 size={14} /> 삭제</Button>
        <Link to={`/flight-hotel?trip=${trip.id}`}><Button variant="olive">항공·숙소·예약 관리</Button></Link>
        <Link to={`/planner?trip=${trip.id}`}><Button variant="ghost">일정·지도</Button></Link>
        <Link to={`/budget?trip=${trip.id}`}><Button variant="ghost">경비</Button></Link>
        <Link to={`/archive/${trip.id}`}><Button variant="ghost">아카이브 · 사진 · 후기</Button></Link>
        <Link to="/trips" className="ml-auto text-sm text-navy hover:underline">← 모든 여행</Link>
      </div>

      <section className="page pt-8 sm:pt-10">
        <SectionTitle eyebrow="Weather" title="여행지 날씨" />
        <WeatherStrip trip={trip} />
      </section>

      <section className="page py-8 sm:py-10">
        <SectionTitle eyebrow="Linked by Trip ID" title="이 여행에 연결된 데이터" />
        <div className="grid grid-cols-4 gap-2 sm:gap-3 lg:grid-cols-7">
          {counts.map(([k, v]) => (
            <Card key={k as string} className="!px-1 !py-3 text-center sm:!p-4"><p className="font-serif text-xl text-navy sm:text-2xl">{v}</p><p className="eyebrow mt-1 !tracking-normal sm:!tracking-label">{k}</p></Card>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:mt-5 sm:grid-cols-3 sm:gap-4">
          <Card className="!p-4 sm:!p-5"><p className="eyebrow">예산</p><p className="mt-1 font-serif text-xl sm:text-2xl">{trip.budgetTotalKRW ? krw(trip.budgetTotalKRW) : '미설정'}</p></Card>
          <Card className="!p-4 sm:!p-5"><p className="eyebrow">기록된 지출</p><p className="mt-1 font-serif text-xl sm:text-2xl">{krw(spent)}</p></Card>
          <Card className="col-span-2 sm:col-span-1"><p className="eyebrow">동행</p><p className="mt-1 text-sm">{trip.companions.length ? trip.companions.join(', ') : '혼자'}</p></Card>
        </div>
        {trip.memo && <p className="mt-5 max-w-2xl font-serif text-lg italic text-charcoal-soft">“{trip.memo}”</p>}
        <p className="mt-4 text-xs text-charcoal-mute">항공·숙소·일정·경비·사진·후기는 위 버튼으로 이동해 등록·수정할 수 있어요. 아래는 현재 저장된 내용의 요약입니다.</p>
      </section>

      {(flights.length > 0 || hotels.length > 0) && (
        <section className="page pb-10">
          <SectionTitle eyebrow="Flight & Hotel" title="항공권 · 숙소" />
          <div className="grid gap-4 md:grid-cols-2">
            {flights.map((f) => (
              <Card key={f.id}>
                <div className="flex items-center justify-between"><p className="eyebrow">{f.direction === 'outbound' ? '출국' : f.direction === 'return' ? '귀국' : '국내선'} · {f.airline} {f.flightNo}</p>{f.isSample && <SampleBadge />}</div>
                <p className="mt-2 font-serif text-xl">{f.fromAirport} → {f.toAirport}</p>
                <p className="mt-1 text-sm text-charcoal-soft">{fmtDateTime(f.departAt)} → {fmtDateTime(f.arriveAt)} · {fmtDuration(f.durationMin)} · {f.stops === 0 ? '직항' : `경유 ${f.stops}회`}</p>
                <p className="mt-2 text-sm">{krw(f.priceKRW)} <span className="text-xs text-charcoal-mute">({SRC_LABEL[f.priceSource]})</span></p>
              </Card>
            ))}
            {hotels.map((h) => (
              <Card key={h.id} className="!p-0 overflow-hidden">
                <div className="flex">
                  {h.image && <img src={h.image} alt="" loading="lazy" className="w-32 object-cover" />}
                  <div className="p-5"><div className="flex items-center gap-2"><p className="eyebrow">숙소</p>{h.isSample && <SampleBadge />}</div>
                    <p className="mt-1 font-serif text-xl">{h.name}</p>
                    <p className="text-sm text-charcoal-soft">{fmtRange(h.checkIn, h.checkOut)} · 1박 {krw(h.pricePerNightKRW)} <span className="text-xs text-charcoal-mute">({SRC_LABEL[h.priceSource]})</span></p></div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section className="page pb-10">
        <SectionTitle eyebrow="Itinerary" title="날짜별 일정" />
        {places.length === 0 ? <EmptyState title="아직 등록된 일정이 없어요" desc={`${days.length}일 분량의 빈 일정이 준비되어 있어요. 일정 편집은 Phase 3에서 열립니다.`} /> : (
          <div className="space-y-6">
            {days.map((d) => {
              const ps = places.filter((p) => p.itineraryId === d.id).sort((a, b) => a.order - b.order);
              if (!ps.length) return null;
              return (
                <div key={d.id} className="grid gap-3 md:grid-cols-[160px_1fr]">
                  <div><p className="font-serif text-2xl text-navy">DAY {d.dayIndex}</p><p className="eyebrow mt-1">{d.title}</p></div>
                  <ol className="space-y-2 border-l border-beige-dark pl-5">
                    {ps.map((p) => (
                      <li key={p.id} className="relative"><span className="absolute -left-[26px] top-2 h-2 w-2 rounded-full bg-olive" />
                        <p className="text-sm"><span className="mr-2 text-charcoal-mute">{p.time}</span>{p.name} <Tag>{p.category}</Tag></p></li>
                    ))}
                  </ol>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <TripFormModal open={edit} onClose={() => setEdit(false)} trip={trip} />
      <Modal open={del} onClose={() => setDel(false)} title="여행을 삭제할까요?">
        <p className="text-sm text-charcoal-soft">이 여행과 연결된 항공·숙소·일정·경비·사진·후기가 모두 함께 삭제되며 되돌릴 수 없어요. 먼저 설정 &gt; 백업으로 내려받는 것을 권장해요.</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDel(false)}>취소</Button>
          <Button variant="danger" onClick={() => { deleteTrip(trip.id); toast('여행을 삭제했어요'); nav('/trips'); }}>삭제</Button>
        </div>
      </Modal>
    </>
  );
}
