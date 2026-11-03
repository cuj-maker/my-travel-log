import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FileText, Pencil, Plus, Settings2, Trash2 } from 'lucide-react';
import { Button, Card, EmptyState, Modal, PageHeader, SampleBadge, Tag, toast } from '@/components/ui';
import ExpenseFormModal from '@/components/budget/ExpenseFormModal';
import BudgetSettingsModal from '@/components/budget/BudgetSettingsModal';
import { useDbVersion } from '@/store/useDb';
import * as db from '@/db/database';
import { listTrips, updateTrip } from '@/services/tripService';
import { CURRENCIES, getBudget, peopleOf, recordBookingAsExpense, removeExpense, saveBudget, SAMPLE_FX, settle, summarize, LedgerRow } from '@/services/budgetService';
import { CurrencyCode, Expense } from '@/types/models';
import { liveFx, refreshLiveFx } from '@/integrations/live';
import { fmtDate, krw } from '@/lib/format';

type Tab = 'overview' | 'expenses' | 'fx' | 'settle';
const COLORS = ['#34445A', '#78836A', '#B5715A', '#8A6F9E', '#C29B3C', '#4F8A8B', '#8C867E'];

function Bar2({ value, max, tone = 'bg-olive' }: { value: number; max: number; tone?: string }) {
  return <div className="h-1.5 rounded-full bg-beige/70"><div className={`h-full rounded-full ${tone}`} style={{ width: `${max ? Math.min(100, (value / max) * 100) : 0}%` }} /></div>;
}

export default function BudgetPage() {
  useDbVersion();
  const [sp, setSp] = useSearchParams();
  const trips = listTrips();
  const trip = trips.find((t) => t.id === sp.get('trip')) ?? trips.find((t) => t.status !== 'completed') ?? trips[0];
  const [tab, setTab] = useState<Tab>('overview');
  const [form, setForm] = useState<{ open: boolean; expense?: Expense }>({ open: false });
  const [settings, setSettings] = useState(false);
  const [del, setDel] = useState<Expense | null>(null);
  const [fxDraft, setFxDraft] = useState<Record<string, string>>({});
  const [people, setPeople] = useState<string | null>(null);

  if (!trip) return <><PageHeader eyebrow="Travel Budget" title="여행 경비" /><div className="page"><EmptyState title="먼저 여행을 만들어 주세요" action={<Link to="/trips"><Button>여행 만들기</Button></Link>} /></div></>;

  const s = summarize(trip);
  const st = settle(trip);
  const catRows = s.rows.filter((r) => r.budget || r.actual || r.committed || r.planned);
  const pie = s.rows.filter((r) => r.actual > 0).map((r) => ({ name: r.category, value: r.actual }));
  const byDate = new Map<string, LedgerRow[]>();
  s.actual.forEach((r) => byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]));
  const tabs: [Tab, string][] = [['overview', '개요'], ['expenses', '지출 내역'], ['fx', '환율'], ['settle', '동행자 정산']];
  const over = s.total > 0 && s.actualKRW + s.committedKRW > s.total;
  const saved = getBudget(trip.id)?.fx ?? {};

  const saveFx = () => {
    const fx: Partial<Record<CurrencyCode, number>> = { ...saved };
    for (const [c, v] of Object.entries(fxDraft)) { const n = Number(v); if (v === '') delete fx[c as CurrencyCode]; else if (n > 0) fx[c as CurrencyCode] = n; }
    saveBudget(trip.id, { fx }); setFxDraft({}); toast('환율을 저장했어요. 기존 지출은 입력 당시 환율을 유지해요');
  };

  const savePeople = () => {
    const names = (people ?? '').split(',').map((x) => x.trim()).filter((x) => x && x !== '나');
    if (new Set(names).size !== names.length) return toast('이름이 중복됐어요', 'error');
    updateTrip(trip.id, { companions: names, travelers: Math.max(trip.travelers, names.length + 1) });
    setPeople(null); toast('동행자를 저장했어요');
  };

  return (
    <>
      <PageHeader eyebrow="Travel Budget" title="여행 경비"
        desc="예산과 실제 지출을 한곳에서. 예약 금액은 결제 상태로 구분해 실제 지출과 중복 계산하지 않아요. 환율은 실시간 시장 환율을 기본으로 쓰고, 직접 입력한 환율이 있으면 그걸 우선해요."
        action={<div className="flex gap-2"><Button variant="ghost" onClick={() => setSettings(true)}><Settings2 size={14} /> 예산 설정</Button><Button onClick={() => { setForm({ open: true }); setTab('expenses'); }}><Plus size={14} /> 지출 입력</Button></div>} />
      <section className="page">
        <div className="scroll-row mb-5">
          {trips.map((t) => <button key={t.id} onClick={() => setSp({ trip: t.id })} className={`chip ${t.id === trip.id ? 'border-navy bg-navy text-cream' : 'border-beige-dark text-charcoal-soft hover:bg-beige/50'}`}>{t.city} {t.startDate.slice(0, 4)}</button>)}
        </div>
        <div className="mb-6 flex gap-6 overflow-x-auto border-b border-beige no-scrollbar" role="tablist">
          {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`-mb-px shrink-0 border-b-2 pb-3 text-xs tracking-label ${tab === k ? 'border-olive text-navy' : 'border-transparent text-charcoal-mute'}`}>{l}</button>)}
        </div>

        {tab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {[['전체 예산', s.total ? krw(s.total) : '미설정'], ['실제 지출', krw(s.actualKRW)], ['예약 미결제', krw(s.committedKRW)], [s.remaining >= 0 ? '남은 예산' : '예산 초과', s.total ? krw(Math.abs(s.remaining)) : '-'], ['1인당 지출', krw(s.perPerson)]].map(([k, v], i) => (
                <Card key={k} className={`!p-4 ${i === 3 && over ? 'ring-1 ring-clay/50' : ''}`}><p className="eyebrow">{k}</p><p className={`mt-1 font-serif text-xl sm:text-2xl ${i === 3 && over ? 'text-clay' : 'text-navy'}`}>{v}</p></Card>))}
            </div>
            {s.total > 0 && (
              <Card>
                <div className="flex justify-between text-sm"><span>예산 사용률</span><b>{s.usePct}%</b></div>
                <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-beige">
                  <div className={s.usePct > 100 ? 'bg-clay' : 'bg-olive'} style={{ width: `${Math.min(100, s.usePct)}%` }} />
                  <div className="bg-olive/30" style={{ width: `${Math.max(0, Math.min(100 - s.usePct, (s.committedKRW / s.total) * 100))}%` }} />
                </div>
                <p className="mt-2 text-xs text-charcoal-mute">진한 부분 실제 지출 · 연한 부분 예약 미결제{over && <span className="text-clay"> · 예약분까지 합치면 예산을 넘어요</span>}</p>
              </Card>
            )}
            {trip.status !== 'completed' && (s.planKRW > 0 || s.committedKRW > 0) && (
              <Card className="bg-cream">
                <p className="eyebrow">예상 총지출 (여행 전 추정)</p>
                <p className="mt-1 font-serif text-2xl">{krw(s.projected)}</p>
                <p className="mt-1 text-xs text-charcoal-soft">실제 {krw(s.actualKRW)} + 예약 미결제 {krw(s.committedKRW)} + 일정 기준 장소·교통 예상 {krw(s.planKRW)}. 교통비는 예상값이고, 일정 예상은 이미 기록한 지출과 겹칠 수 있어요.</p>
                {s.total > 0 && <p className={`mt-1 text-xs ${s.projected > s.total ? 'text-clay' : 'text-olive-dark'}`}>{s.projected > s.total ? `예산보다 ${krw(s.projected - s.total)} 많아요` : `예산 안에서 ${krw(s.total - s.projected)} 여유가 있어요`}</p>}
              </Card>
            )}
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <h3 className="mb-4 text-xl">카테고리별</h3>
                {catRows.length === 0 ? <p className="text-sm text-charcoal-mute">기록이 없어요.</p> : (
                  <ul className="space-y-4">
                    {catRows.map((r) => {
                      const max = Math.max(r.budget, r.actual + r.committed, r.planned, 1);
                      return (
                        <li key={r.category}>
                          <div className="flex justify-between text-sm"><span>{r.category}</span><span>{krw(r.actual)}{r.budget ? <span className="text-charcoal-mute"> / {krw(r.budget)}</span> : null}</span></div>
                          <div className="mt-1"><Bar2 value={r.actual} max={max} tone={r.budget && r.actual > r.budget ? 'bg-clay' : 'bg-olive'} /></div>
                          <p className="mt-1 text-[11px] text-charcoal-mute">{[r.committed ? `예약 미결제 ${krw(r.committed)}` : '', r.planned ? `일정 예상 ${krw(r.planned)}` : '', r.budget && r.actual > r.budget ? '예산 초과' : ''].filter(Boolean).join(' · ')}</p>
                        </li>);
                    })}
                  </ul>)}
              </Card>
              <Card>
                <h3 className="mb-2 text-xl">지출 비중</h3>
                {pie.length ? (
                  <div className="h-56"><ResponsiveContainer><PieChart><Pie data={pie} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>{pie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip formatter={(v: number) => krw(v)} /></PieChart></ResponsiveContainer></div>
                ) : <p className="text-sm text-charcoal-mute">기록된 지출이 없어요.</p>}
                <div className="flex flex-wrap gap-3 text-xs">{pie.map((p, i) => <span key={p.name}><span style={{ color: COLORS[i % COLORS.length] }}>●</span> {p.name}</span>)}</div>
              </Card>
            </div>
            <Card>
              <h3 className="mb-2 text-xl">일별 지출</h3>
              {s.daily.length ? <div className="h-56"><ResponsiveContainer><BarChart data={s.daily}><CartesianGrid strokeDasharray="3 3" stroke="#E8E0D4" vertical={false} /><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} width={56} tickFormatter={(v) => `${Math.round(v / 10000)}만`} /><Tooltip formatter={(v: number) => krw(v)} /><Bar dataKey="krw" name="지출" fill="#78836A" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div> : <p className="text-sm text-charcoal-mute">기록된 지출이 없어요.</p>}
            </Card>
          </div>
        )}

        {tab === 'expenses' && (
          <div className="space-y-6">
            <div className="flex items-center gap-3"><Button onClick={() => setForm({ open: true })}><Plus size={14} /> 지출 입력</Button><span className="text-sm text-charcoal-soft">실제 지출 합계 <b>{krw(s.actualKRW)}</b></span></div>
            {s.actual.length === 0 && <EmptyState title="기록된 지출이 없어요" desc="지출을 입력하면 예산·정산에 바로 반영돼요." />}
            {[...byDate.entries()].map(([date, rows]) => (
              <div key={date}>
                <p className="eyebrow mb-2">{fmtDate(date)} · {krw(rows.reduce((a, r) => a + r.amountKRW, 0))}</p>
                <ul className="divide-y divide-beige/70 rounded-xl2 border border-beige bg-white/70">
                  {rows.map((r) => {
                    const e = r.expense; const file = e?.receiptFileId ? db.get('files', e.receiptFileId) : undefined;
                    return (
                      <li key={r.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{r.label} <Tag>{r.category}</Tag> {e?.isSample && <SampleBadge />} {r.origin === 'booking' && <Tag tone="navy">예약 결제분</Tag>}{e?.bookingId && <Tag tone="olive">예약 연결</Tag>}</p>
                          <p className="text-xs text-charcoal-mute">{[e ? `${e.paidBy ?? '나'} 결제` : '결제자 미지정', e?.method, e?.shared === false ? '개인 지출' : '공동 경비', e && e.currency !== 'KRW' ? `${e.amount.toLocaleString()} ${e.currency} × ${e.fxRate}` : ''].filter(Boolean).join(' · ')}</p>
                        </div>
                        <p className="font-serif text-lg">{krw(r.amountKRW)}</p>
                        <span className="flex items-center gap-1">
                          {file && <a href={file.dataUrl} download={file.name} aria-label="영수증" className="rounded-full p-2 text-navy hover:bg-beige/60"><FileText size={14} /></a>}
                          {e ? <>
                            <button aria-label="수정" className="rounded-full p-2 hover:bg-beige/60" onClick={() => setForm({ open: true, expense: e })}><Pencil size={14} /></button>
                            <button aria-label="삭제" className="rounded-full p-2 text-clay hover:bg-clay/10" onClick={() => setDel(e)}><Trash2 size={14} /></button></>
                            : <Button variant="ghost" className="!px-3 !py-1 text-xs" onClick={() => { recordBookingAsExpense(trip.id, r); toast('지출로 기록했어요. 결제자·분담을 수정할 수 있어요'); }}>지출로 기록</Button>}
                        </span>
                      </li>);
                  })}
                </ul>
              </div>
            ))}
            {s.committed.length > 0 && (
              <div>
                <p className="eyebrow mb-2">예약 미결제 · 아직 지출이 아니에요 ({krw(s.committedKRW)})</p>
                <ul className="divide-y divide-beige/70 rounded-xl2 border border-dashed border-beige-dark bg-cream/50">
                  {s.committed.map((r) => <li key={r.key} className="flex items-center justify-between px-4 py-3 text-sm"><span>{r.label} <Tag>{r.category}</Tag></span><span>{krw(r.amountKRW)}</span></li>)}
                </ul>
                <p className="mt-2 text-xs text-charcoal-mute">FLIGHT & HOTEL에서 결제 상태를 ‘결제 완료’로 바꾸면 실제 지출로 넘어가요.</p>
              </div>
            )}
          </div>
        )}

        {tab === 'fx' && (
          <div className="space-y-4">
            <p className="text-sm text-charcoal-soft">1 단위당 원화(KRW)예요. ‘오늘 환율’은 실시간 시장 환율(하루 1회 갱신)이고, ‘내 환율’을 입력하면 이 여행의 새 지출에 우선 적용돼요. 이미 기록한 지출은 입력 당시 환율을 유지합니다.</p>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-olive-light/60 px-4 py-2.5 text-xs text-olive-dark">
              <span>{liveFx() ? <>● 실시간 연결됨 · {new Date(liveFx()!.asOf).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 기준 · <a className="underline" href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">Rates By Exchange Rate API</a></> : '실시간 환율을 불러오지 못해 샘플 값을 보여줘요 (오프라인?)'}</span>
              <button className="underline" onClick={() => refreshLiveFx(true).then(() => toast(liveFx() ? '환율을 새로 불러왔어요' : '환율을 불러오지 못했어요', liveFx() ? 'ok' : 'error'))}>새로고침</button>
            </div>
            <div className="overflow-hidden rounded-xl2 border border-beige bg-white/70">
              <table className="w-full text-left text-sm"><thead className="bg-cream text-[11px] uppercase tracking-label text-charcoal-mute"><tr><th className="p-3">통화</th><th className="p-3">오늘 환율</th><th className="p-3">내 환율</th></tr></thead>
                <tbody>{CURRENCIES.filter((c) => c.code !== 'KRW').map((c) => {
                  const live = liveFx()?.rates[c.code];
                  return (
                  <tr key={c.code} className="border-t border-beige/70"><td className="p-3">{c.label}</td><td className="p-3 text-charcoal-soft">{(live ?? SAMPLE_FX[c.code]).toLocaleString()} <span className={`text-[10px] ${live ? 'text-olive-dark' : 'text-clay'}`}>{live ? '실시간' : '샘플'}</span></td>
                    <td className="p-3"><input type="number" min={0} step="any" aria-label={`${c.code} 환율`} className="field !w-28 !py-1.5 sm:!w-32" placeholder="오늘 환율" value={fxDraft[c.code] ?? (saved[c.code] ? String(saved[c.code]) : '')} onChange={(e) => setFxDraft((p) => ({ ...p, [c.code]: e.target.value }))} /></td></tr>);
                })}</tbody></table>
            </div>
            <Button onClick={saveFx} disabled={!Object.keys(fxDraft).length}>환율 저장</Button>
          </div>
        )}

        {tab === 'settle' && (
          <div className="space-y-6">
            <Card>
              <p className="eyebrow mb-2">여행 인원</p>
              {people === null ? (
                <div className="flex flex-wrap items-center gap-3"><p className="text-sm">{st.people.join(', ')} <span className="text-charcoal-mute">({trip.travelers}명 여행)</span></p><Button variant="ghost" className="!px-4 !py-1.5 text-xs" onClick={() => setPeople(trip.companions.join(', '))}>동행자 편집</Button></div>
              ) : (
                <div className="flex flex-wrap gap-2"><input className="field flex-1" value={people} onChange={(e) => setPeople(e.target.value)} placeholder="동행자 이름을 쉼표로 구분 (나는 자동 포함)" /><Button onClick={savePeople}>저장</Button><Button variant="ghost" onClick={() => setPeople(null)}>취소</Button></div>
              )}
              {st.missingPeople > 0 && <p className="mt-2 text-xs text-clay">여행 인원 {trip.travelers}명 중 {st.missingPeople}명의 이름이 없어요. 동행자를 등록해야 정확히 정산돼요.</p>}
              {st.unknownPayers.length > 0 && <p className="mt-2 text-xs text-clay">등록되지 않은 결제자({st.unknownPayers.join(', ')})는 ‘나’로 계산했어요.</p>}
            </Card>
            <div className="overflow-x-auto rounded-xl2 border border-beige bg-white/70">
              <table className="w-full min-w-[480px] text-left text-sm"><thead className="bg-cream text-[11px] uppercase tracking-label text-charcoal-mute"><tr><th className="p-3">이름</th><th className="p-3">먼저 결제한 금액</th><th className="p-3">부담 금액</th><th className="p-3">정산</th></tr></thead>
                <tbody>{st.people.map((p) => (
                  <tr key={p} className="border-t border-beige/70"><td className="p-3 font-medium">{p}</td><td className="p-3">{krw(st.paid[p])}</td><td className="p-3">{krw(st.share[p])}</td>
                    <td className={`p-3 ${st.net[p] > 0 ? 'text-olive-dark' : st.net[p] < 0 ? 'text-clay' : ''}`}>{st.net[p] > 0 ? `${krw(st.net[p])} 받을 금액` : st.net[p] < 0 ? `${krw(-st.net[p])} 보낼 금액` : '정산 완료'}</td></tr>))}</tbody></table>
            </div>
            <Card>
              <h3 className="mb-3 text-xl">정산 방법</h3>
              {st.transfers.length ? <ul className="space-y-2 text-sm">{st.transfers.map((t, i) => <li key={i}><b>{t.from}</b> → <b>{t.to}</b> <span className="ml-2 font-serif text-lg">{krw(t.amountKRW)}</span></li>)}</ul> : <p className="text-sm text-charcoal-soft">주고받을 금액이 없어요.</p>}
              <p className="mt-3 text-xs text-charcoal-mute">공동 경비만 나눠 계산해요. 개인 지출은 제외되고, 결제자가 정해지지 않은 예약 결제분은 ‘지출로 기록’한 뒤 반영돼요.</p>
            </Card>
          </div>
        )}
      </section>

      <ExpenseFormModal open={form.open} onClose={() => setForm({ open: false })} trip={trip} expense={form.expense} />
      <BudgetSettingsModal open={settings} onClose={() => setSettings(false)} trip={trip} />
      <Modal open={!!del} onClose={() => setDel(null)} title="지출을 삭제할까요?">
        <p className="text-sm text-charcoal-soft">「{del?.vendor}」 {del ? krw(del.amountKRW) : ''}을(를) 삭제하고 영수증도 함께 지워요. 연결된 예약이 결제 완료 상태라면 다시 예약 결제분으로 집계돼요.</p>
        <div className="mt-6 flex justify-end gap-2"><Button variant="ghost" onClick={() => setDel(null)}>취소</Button><Button variant="danger" onClick={() => { if (del) removeExpense(del.id); setDel(null); toast('삭제했어요'); }}>삭제</Button></div>
      </Modal>
    </>
  );
}
