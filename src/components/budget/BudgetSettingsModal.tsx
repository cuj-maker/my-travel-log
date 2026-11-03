import { useEffect, useState } from 'react';
import { Button, Modal, toast } from '@/components/ui';
import { EXPENSE_CATEGORIES, Trip } from '@/types/models';
import { budgetTotal, getBudget, saveBudget } from '@/services/budgetService';
import { krw } from '@/lib/format';

export default function BudgetSettingsModal({ open, onClose, trip }: { open: boolean; onClose: () => void; trip: Trip }) {
  const [total, setTotal] = useState('');
  const [per, setPer] = useState('');
  const [cats, setCats] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    const b = getBudget(trip.id);
    const t = budgetTotal(trip);
    setTotal(t ? String(t) : ''); setPer(t ? String(Math.round(t / Math.max(1, trip.travelers))) : '');
    setCats(Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c, b?.byCategory[c] ? String(b.byCategory[c]) : ''])));
    setErr('');
  }, [open, trip]);

  const catSum = Object.values(cats).reduce((s, v) => s + (Number(v) || 0), 0);
  const n = Math.max(1, trip.travelers);

  const submit = () => {
    const t = Number(total) || 0;
    if (t < 0 || EXPENSE_CATEGORIES.some((c) => Number(cats[c]) < 0)) return setErr('금액은 0 이상이어야 해요.');
    if (t > 0 && catSum > t) return setErr(`카테고리 예산 합계(${krw(catSum)})가 전체 예산(${krw(t)})보다 커요.`);
    saveBudget(trip.id, { totalKRW: t, byCategory: Object.fromEntries(EXPENSE_CATEGORIES.filter((c) => Number(cats[c]) > 0).map((c) => [c, Number(cats[c])])) });
    toast('예산을 저장했어요');
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="예산 설정">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="field-label">전체 예산 (원)</label><input type="number" min={0} className="field" value={total} onChange={(e) => { setTotal(e.target.value); setPer(e.target.value ? String(Math.round(Number(e.target.value) / n)) : ''); }} /></div>
          <div><label className="field-label">1인당 예산 ({n}명)</label><input type="number" min={0} className="field" value={per} onChange={(e) => { setPer(e.target.value); setTotal(e.target.value ? String(Number(e.target.value) * n) : ''); }} /></div>
        </div>
        <div>
          <p className="field-label">카테고리별 예산 (선택)</p>
          <div className="grid grid-cols-2 gap-3">
            {EXPENSE_CATEGORIES.map((c) => (
              <div key={c}><label className="field-label">{c}</label><input type="number" min={0} className="field" value={cats[c] ?? ''} onChange={(e) => setCats((p) => ({ ...p, [c]: e.target.value }))} /></div>))}
          </div>
          <p className="mt-2 text-xs text-charcoal-mute">카테고리 합계 {krw(catSum)}{Number(total) > 0 ? ` / 전체 ${krw(Number(total))}` : ''}</p>
        </div>
        {err && <p role="alert" className="rounded-lg bg-clay/10 px-3 py-2 text-sm text-clay">{err}</p>}
        <div className="modal-actions"><Button variant="ghost" onClick={onClose}>취소</Button><Button onClick={submit}>저장</Button></div>
      </div>
    </Modal>
  );
}
