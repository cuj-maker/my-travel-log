import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, FileText, Info, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, Card, EmptyState, Modal, PageHeader, SampleBadge, Tag, toast } from '@/components/ui';
import FlightFormModal, { BOOKING_STATUS, PAYMENT_STATUS, PRICE_SOURCE, FlightPrefill } from '@/components/booking/FlightFormModal';
import { defaultAirports } from '@/integrations/links';
import HotelFormModal from '@/components/booking/HotelFormModal';
import BookingFormModal, { KIND_LABEL } from '@/components/booking/BookingFormModal';
import { useDbVersion } from '@/store/useDb';
import * as db from '@/db/database';
import { listTrips } from '@/services/tripService';
import { getFile, hotelNights, hotelTotal, rankFlights, rankHotels, removeBooking, removeFlight, removeHotel, saveBooking, saveFlight, saveHotel, tripWarnings } from '@/services/bookingService';
import { BookingStatus, Booking, Flight, Hotel, ID } from '@/types/models';
import { fmtDate, fmtDateTime, fmtDuration, krw } from '@/lib/format';
import { FlightSearchLinks, HotelSearchLinks } from '@/components/live/BookingLinks';

type Tab = 'flight' | 'hotel' | 'booking';
type Del = { kind: Tab; id: ID; label: string } | null;

const FileLinks = ({ ids }: { ids?: ID[] }) => (
  <>{(ids ?? []).map((id) => { const f = getFile(id); return f ? <a key={id} href={f.dataUrl} download={f.name} className="inline-flex items-center gap-1 text-xs text-navy hover:underline"><FileText size={12} />{f.name}</a> : null; })}</>
);

const StatusSelect = ({ value, onChange }: { value: BookingStatus; onChange: (v: BookingStatus) => void }) => (
  <select aria-label="예약 상태" value={value} onChange={(e) => onChange(e.target.value as BookingStatus)} className="rounded-full border border-beige-dark bg-paper px-2.5 py-1 text-[11px]">
    {Object.entries(BOOKING_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
  </select>
);

export default function FlightHotelPage() {
  useDbVersion();
  const [sp, setSp] = useSearchParams();
  const trips = listTrips();
  const trip = trips.find((t) => t.id === sp.get('trip')) ?? trips.find((t) => t.status !== 'completed') ?? trips[0];
  const [tab, setTab] = useState<Tab>('flight');
  const [flightForm, setFlightForm] = useState<{ open: boolean; flight?: Flight; dir?: Flight['direction']; prefill?: FlightPrefill }>({ open: false });
  const [hotelForm, setHotelForm] = useState<{ open: boolean; hotel?: Hotel }>({ open: false });
  const [bookingForm, setBookingForm] = useState<{ open: boolean; booking?: Booking }>({ open: false });
  const [del, setDel] = useState<Del>(null);

  if (!trip) return <><PageHeader eyebrow="Flight & Hotel" title="항공권 · 숙소" /><div className="page"><EmptyState title="먼저 여행을 만들어 주세요" action={<Link to="/trips"><Button>여행 만들기</Button></Link>} /></div></>;

  const flights = db.byTrip('flights', trip.id).sort((a, b) => a.departAt.localeCompare(b.departAt));
  const hotels = db.byTrip('hotels', trip.id).sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  const bookings = db.byTrip('bookings', trip.id).sort((a, b) => (a.useAt ?? '').localeCompare(b.useAt ?? ''));
  const warnings = tripWarnings(trip);
  const rankedH = rankHotels(hotels);
  const rankedByDir = (['outbound', 'return', 'internal'] as const).map((d) => rankFlights(flights.filter((f) => f.direction === d)));
  const scoreF = (id: ID) => rankedByDir.flat().find((r) => r.item.id === id)!;
  const scoreH = (id: ID) => rankedH.find((r) => r.item.id === id)!;
  const bestF = rankedByDir[0][0]?.item.id, bestH = rankedH[0]?.item.id;

  const confirmDelete = () => {
    if (!del) return;
    if (del.kind === 'flight') removeFlight(del.id); else if (del.kind === 'hotel') removeHotel(del.id); else removeBooking(del.id);
    toast('삭제했어요. 일정에 자동 추가된 항목도 함께 정리됐어요'); setDel(null);
  };

  const tabs: [Tab, string, number][] = [['flight', 'FLIGHT', flights.length], ['hotel', 'HOTEL', hotels.length], ['booking', 'BOOKINGS', bookings.length]];
  const flightsFor = (dir: Flight['direction']) => flights.filter((f) => f.direction === dir);

  return (
    <>
      <PageHeader eyebrow="Flight & Hotel" title="항공권 · 숙소 · 예약"
        desc="여행에 항공·숙소를 등록하면 일정과 지도에 자동 반영돼요. 스카이스캐너·구글 항공권·부킹닷컴·호텔스닷컴 검색을 여행 날짜로 바로 열 수 있어요. 가격은 ‘샘플 / 직접 입력’ 출처를 함께 표시해요." />
      <section className="page">
        <div className="scroll-row mb-6">
          {trips.map((t) => (
            <button key={t.id} onClick={() => setSp({ trip: t.id })} className={`chip ${t.id === trip.id ? 'border-navy bg-navy text-cream' : 'border-beige-dark text-charcoal-soft hover:bg-beige/50'}`}>{t.city} {t.startDate.slice(0, 4)}</button>
          ))}
        </div>

        {warnings.length > 0 && (
          <div className="mb-6 space-y-2" role="status">
            {warnings.map((w, i) => (
              <div key={i} className={`flex gap-2 rounded-xl px-4 py-3 text-sm ${w.level === 'warn' ? 'bg-clay/10 text-clay' : 'bg-navy-light text-navy'}`}>
                {w.level === 'warn' ? <AlertTriangle size={16} className="mt-0.5 shrink-0" /> : <Info size={16} className="mt-0.5 shrink-0" />}{w.text}
              </div>
            ))}
          </div>
        )}

        <div className="mb-6 flex gap-6 overflow-x-auto whitespace-nowrap border-b border-beige no-scrollbar" role="tablist">
          {tabs.map(([k, l, n]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`-mb-px border-b-2 pb-3 text-xs tracking-label ${tab === k ? 'border-olive text-navy' : 'border-transparent text-charcoal-mute'}`}>{l} <span className="ml-1 text-charcoal-mute">{n}</span></button>
          ))}
        </div>

        {tab === 'flight' && (
          <div className="space-y-6">
            <FlightSearchLinks key={trip.id} trip={trip} onRegister={(prefill) => { const dir = prefill.fromAirport && prefill.fromAirport === defaultAirports(trip).to ? 'return' : 'outbound'; setFlightForm({ open: true, dir, prefill: { ...prefill, direction: dir } }); }} />
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setFlightForm({ open: true, dir: 'outbound' })}><Plus size={14} /> 출국 항공권</Button>
              <Button variant="ghost" onClick={() => setFlightForm({ open: true, dir: 'return' })}><Plus size={14} /> 귀국 항공권</Button>
              <Button variant="ghost" onClick={() => setFlightForm({ open: true, dir: 'internal' })}><Plus size={14} /> 구간 추가</Button>
            </div>
            {flights.length === 0 ? <EmptyState title="등록된 항공권이 없어요" desc="등록하면 출발·도착이 해당 날짜 일정에 자동으로 들어가요." /> :
              (['outbound', 'return', 'internal'] as const).map((dir) => flightsFor(dir).length > 0 && (
                <div key={dir}>
                  <h3 className="mb-3 text-xl">{dir === 'outbound' ? '출국' : dir === 'return' ? '귀국' : '구간'} {flightsFor(dir).length > 1 && <span className="ml-1 text-xs text-charcoal-mute">조건별 비교 · 가격만으로 순위를 매기지 않아요</span>}</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    {flightsFor(dir).map((f) => {
                      const r = scoreF(f.id);
                      return (
                        <Card key={f.id} className={f.id === bestF && flightsFor(dir).length > 1 && dir === 'outbound' ? 'ring-2 ring-olive/50' : ''}>
                          <div className="flex items-center justify-between gap-2">
                            <p className="eyebrow">{f.airline} {f.flightNo} · {f.cabinClass}</p>
                            <div className="flex items-center gap-2">{f.isSample && <SampleBadge />}<StatusSelect value={f.status} onChange={(v) => { saveFlight(f.id, { status: v }); toast('예약 상태를 변경했어요'); }} /></div>
                          </div>
                          <p className="mt-2 font-serif text-2xl">{f.fromAirport} → {f.toAirport}</p>
                          <p className="mt-1 text-sm text-charcoal-soft">{fmtDateTime(f.departAt)} → {fmtDateTime(f.arriveAt)}</p>
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            <Tag tone="navy">{f.stops === 0 ? '직항' : `경유 ${f.stops}회${f.layovers?.[0] ? ` · ${f.layovers[0].airport}` : ''}`}</Tag><Tag>{fmtDuration(f.durationMin)}</Tag>
                            {f.checkedBaggage && <Tag>위탁 {f.checkedBaggage}</Tag>}{f.cabinBaggage && <Tag>기내 {f.cabinBaggage}</Tag>}
                            {flightsFor(dir).length > 1 && r.tags.filter((t) => t === '최저가' || t === '최단 비행').map((t) => <Tag key={t} tone="olive">{t}</Tag>)}
                          </div>
                          {f.refundPolicy && <p className="mt-2 text-xs text-charcoal-mute">변경·환불: {f.refundPolicy}</p>}
                          <div className="mt-3 flex items-end justify-between">
                            <div><p className="font-serif text-xl">{krw(f.priceKRW)}</p><p className="text-[11px] text-charcoal-mute">{PRICE_SOURCE[f.priceSource]} · {PAYMENT_STATUS[f.paymentStatus]}{f.bookingRef ? ` · ${f.bookingRef}` : ''}</p></div>
                            {flightsFor(dir).length > 1 && <Tag tone={f.id === bestF ? 'olive' : 'beige'}>종합 {r.score}점</Tag>}
                          </div>
                          {(f.priceHistory?.length ?? 0) > 1 && (
                            <details className="mt-3 text-xs text-charcoal-soft"><summary className="cursor-pointer">가격 기록 {f.priceHistory!.length}건</summary>
                              <ul className="mt-1 space-y-0.5">{f.priceHistory!.map((h, i) => <li key={i}>{fmtDate(h.at.slice(0, 10))} · {krw(h.priceKRW)} ({PRICE_SOURCE[h.source]})</li>)}</ul></details>
                          )}
                          <div className="mt-3 flex flex-wrap items-center gap-3"><FileLinks ids={f.fileIds} />
                            <span className="ml-auto flex gap-1"><button aria-label="수정" className="rounded-full p-2 hover:bg-beige/60" onClick={() => setFlightForm({ open: true, flight: f })}><Pencil size={14} /></button>
                              <button aria-label="삭제" className="rounded-full p-2 text-clay hover:bg-clay/10" onClick={() => setDel({ kind: 'flight', id: f.id, label: `${f.flightNo} ${f.fromAirport}→${f.toAirport}` })}><Trash2 size={14} /></button></span></div>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              ))}
            {flights.length > 1 && <p className="text-xs text-charcoal-mute">종합 점수 = 가격 40 · 비행시간 20 · 직항 15 · 수하물 10 · 변경/환불 조건 10 · 출발 시간대 5. 같은 구간 안에서만 비교해요.</p>}
          </div>
        )}

        {tab === 'hotel' && (
          <div className="space-y-6">
            <HotelSearchLinks trip={trip} />
            <Button onClick={() => setHotelForm({ open: true })}><Plus size={14} /> 숙소 등록</Button>
            {hotels.length === 0 ? <EmptyState title="등록된 숙소가 없어요" desc="체크인·체크아웃이 일정에 자동으로 들어가고, 좌표를 입력하면 지도에서 숙소 위치로 쓰여요." /> : (
              <div className="grid gap-5 md:grid-cols-2">
                {hotels.map((h) => {
                  const r = scoreH(h.id);
                  return (
                    <Card key={h.id} className={`overflow-hidden !p-0 ${h.id === bestH && hotels.length > 1 ? 'ring-2 ring-olive/50' : ''}`}>
                      {h.image && <div className="aspect-[16/8] overflow-hidden"><img src={h.image} alt="" loading="lazy" className="h-full w-full object-cover" /></div>}
                      <div className="p-5">
                        <div className="flex items-center justify-between gap-2"><p className="eyebrow">{fmtDate(h.checkIn)} → {fmtDate(h.checkOut)} · {hotelNights(h)}박</p>
                          <div className="flex items-center gap-2">{h.isSample && <SampleBadge />}<StatusSelect value={h.status} onChange={(v) => { saveHotel(h.id, { status: v }); toast('예약 상태를 변경했어요'); }} /></div></div>
                        <p className="mt-1 font-serif text-2xl">{h.name}</p>
                        <p className="text-sm text-charcoal-soft">{h.address}{h.rating ? ` · ★ ${h.rating}` : ''}</p>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {h.breakfast && <Tag tone="olive">조식</Tag>}{h.freeCancel && <Tag tone="olive">무료 취소</Tag>}
                          {h.lat !== undefined && <Tag tone="navy">지도 좌표 있음</Tag>}{h.airportMin && <Tag>공항 {h.airportMin}분</Tag>}
                          {h.amenities.slice(0, 4).map((a) => <Tag key={a}>{a}</Tag>)}
                        </div>
                        <div className="mt-3 flex items-end justify-between">
                          <div><p className="font-serif text-xl">{krw(hotelTotal(h))}</p><p className="text-[11px] text-charcoal-mute">1박 {krw(h.pricePerNightKRW)} · {PRICE_SOURCE[h.priceSource]} · {PAYMENT_STATUS[h.paymentStatus]}</p></div>
                          {hotels.length > 1 && <Tag tone={h.id === bestH ? 'olive' : 'beige'}>종합 {r.score}점{r.tags.includes('최저가') ? ' · 최저가' : ''}</Tag>}
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-3"><FileLinks ids={h.fileIds} />
                          <span className="ml-auto flex gap-1"><button aria-label="수정" className="rounded-full p-2 hover:bg-beige/60" onClick={() => setHotelForm({ open: true, hotel: h })}><Pencil size={14} /></button>
                            <button aria-label="삭제" className="rounded-full p-2 text-clay hover:bg-clay/10" onClick={() => setDel({ kind: 'hotel', id: h.id, label: h.name })}><Trash2 size={14} /></button></span></div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
            {hotels.length > 1 && (
              <div className="overflow-x-auto rounded-xl2 border border-beige bg-white/70">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="bg-cream text-[11px] uppercase tracking-label text-charcoal-mute"><tr><th className="p-3">호텔</th><th className="p-3">총 숙박비</th><th className="p-3">평점</th><th className="p-3">공항</th><th className="p-3">대중교통</th><th className="p-3">관광지</th><th className="p-3">조건</th></tr></thead>
                  <tbody>{hotels.map((h) => (
                    <tr key={h.id} className="border-t border-beige/70"><td className="p-3 font-medium">{h.name}</td><td className="p-3">{krw(hotelTotal(h))}</td><td className="p-3">{h.rating ?? '-'}</td><td className="p-3">{h.airportMin ? `${h.airportMin}분` : '-'}</td>
                      <td className="p-3">{h.transitScore ?? '-'}/5</td><td className="p-3">{h.sightsScore ?? '-'}/5</td><td className="p-3 text-xs">{[h.breakfast && '조식', h.freeCancel && '무료취소'].filter(Boolean).join(' · ') || '-'}</td></tr>))}</tbody>
                </table>
              </div>
            )}
            {hotels.length > 1 && <p className="text-xs text-charcoal-mute">호텔 변경 시 일정의 이동시간 재계산은 지도·경로가 생기는 Phase 3에서 연결됩니다.</p>}
          </div>
        )}

        {tab === 'booking' && (
          <div className="space-y-6">
            <Button onClick={() => setBookingForm({ open: true })}><Plus size={14} /> 예약 등록</Button>
            <p className="text-xs text-charcoal-mute">항공권·호텔 예약은 각 탭에서 관리해요. 여기에는 맛집·입장권·공연·액티비티·렌터카·픽업 예약을 기록합니다.</p>
            {bookings.length === 0 ? <EmptyState title="등록된 예약이 없어요" /> : (
              <div className="grid gap-4 md:grid-cols-2">
                {bookings.map((b) => (
                  <Card key={b.id}>
                    <div className="flex items-center justify-between"><Tag tone="navy">{KIND_LABEL[b.kind]}</Tag>{b.isSample && <SampleBadge />}</div>
                    <p className="mt-2 font-serif text-xl">{b.title}</p>
                    <p className="text-sm text-charcoal-soft">{b.vendor}{b.useAt ? ` · ${b.useAt.length > 10 ? fmtDateTime(b.useAt) : fmtDate(b.useAt)}` : ''}</p>
                    <p className="mt-2 text-sm">{b.amountKRW !== undefined ? krw(b.amountKRW) : '금액 미입력'} <span className="text-xs text-charcoal-mute">· {PAYMENT_STATUS[b.paymentStatus]}{b.bookingRef ? ` · ${b.bookingRef}` : ''}</span></p>
                    {b.cancelPolicy && <p className="mt-1 text-xs text-charcoal-mute">취소: {b.cancelPolicy}</p>}
                    <div className="mt-3 flex flex-wrap items-center gap-3"><FileLinks ids={b.fileIds} />
                      <span className="ml-auto flex gap-1">
                        <select aria-label="결제 상태" value={b.paymentStatus} onChange={(e) => { saveBooking(b.id, { paymentStatus: e.target.value as Booking['paymentStatus'] }); toast('결제 상태를 변경했어요'); }} className="rounded-full border border-beige-dark bg-paper px-2 py-1 text-[11px]">{Object.entries(PAYMENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                        <button aria-label="수정" className="rounded-full p-2 hover:bg-beige/60" onClick={() => setBookingForm({ open: true, booking: b })}><Pencil size={14} /></button>
                        <button aria-label="삭제" className="rounded-full p-2 text-clay hover:bg-clay/10" onClick={() => setDel({ kind: 'booking', id: b.id, label: b.title })}><Trash2 size={14} /></button></span></div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <FlightFormModal open={flightForm.open} onClose={() => setFlightForm({ open: false })} trip={trip} flight={flightForm.flight} direction={flightForm.dir} prefill={flightForm.prefill} />
      <HotelFormModal open={hotelForm.open} onClose={() => setHotelForm({ open: false })} trip={trip} hotel={hotelForm.hotel} />
      <BookingFormModal open={bookingForm.open} onClose={() => setBookingForm({ open: false })} trip={trip} booking={bookingForm.booking} />
      <Modal open={!!del} onClose={() => setDel(null)} title="삭제할까요?">
        <p className="text-sm text-charcoal-soft">「{del?.label}」을(를) 삭제해요. 첨부 파일과, 일정에 자동으로 추가된 항목도 함께 삭제돼요.</p>
        <div className="mt-6 flex justify-end gap-2"><Button variant="ghost" onClick={() => setDel(null)}>취소</Button><Button variant="danger" onClick={confirmDelete}>삭제</Button></div>
      </Modal>
    </>
  );
}
