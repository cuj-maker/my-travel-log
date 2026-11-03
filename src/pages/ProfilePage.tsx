import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { Button, Card, Modal, PageHeader, toast } from '@/components/ui';
import { useDbVersion } from '@/store/useDb';
import * as db from '@/db/database';
import { clearSampleData, seedSampleData } from '@/db/seed';
import { providerStatus } from '@/integrations';
import { useApiSettings } from '@/integrations/settings';
import ApiSettingsCard from '@/components/live/ApiSettingsCard';
import { errMsg } from '@/lib/format';

export default function ProfilePage() {
  useDbVersion();
  const apiSettings = useApiSettings();
  const user = db.all('users')[0];
  const [name, setName] = useState(user?.name ?? '');
  const [confirm, setConfirm] = useState<'clear' | 'restore' | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState('');
  const hasSample = db.all('trips').some((t) => t.isSample);

  const saveName = () => {
    if (!name.trim()) return toast('이름을 입력해 주세요', 'error');
    if (user) db.update('users', user.id, { name: name.trim() });
    else db.insert('users', { name: name.trim(), homeCountry: '대한민국', homeCity: '서울', homeAirport: 'ICN', baseCurrency: 'KRW' });
    toast('프로필을 저장했어요');
  };

  const backup = async () => {
    let json: string;
    try { json = await db.exportJson(); } catch (e) { return toast(errMsg(e), 'error'); }
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `my-travel-log-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('백업 파일을 내려받았어요');
  };

  const onFile = async (f?: File) => {
    if (!f) return;
    try { const text = await f.text(); JSON.parse(text); setPending(text); setConfirm('restore'); }
    catch { toast('올바른 JSON 백업 파일이 아닙니다.', 'error'); }
  };

  return (
    <>
      <PageHeader eyebrow="My Profile" title="프로필 · 데이터" desc="모든 데이터는 이 기기·브라우저에 저장됩니다. 아이폰 홈 화면 앱과 사파리는 저장 공간이 서로 달라요 — 옮길 때는 백업 파일로 복원하고, 정기적으로 백업해 두세요." />
      <section className="page grid gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="text-xl">프로필</h3>
          <label className="field-label mt-4">이름</label>
          <div className="flex gap-2"><input className="field" value={name} onChange={(e) => setName(e.target.value)} /><Button onClick={saveName}>저장</Button></div>
        </Card>

        <Card>
          <h3 className="text-xl">백업 · 복원</h3>
          <p className="mt-1 text-sm text-charcoal-soft">전체 데이터와 업로드한 사진을 JSON 파일 하나로 내려받고, 같은 파일로 복원할 수 있어요. 사진이 많으면 파일이 커질 수 있어요.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="ghost" onClick={backup}><Download size={14} /> 백업 다운로드</Button>
            <Button variant="ghost" onClick={() => fileRef.current?.click()}><Upload size={14} /> 백업에서 복원</Button>
            <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
        </Card>

        <Card>
          <h3 className="text-xl">샘플(DEMO) 데이터</h3>
          <p className="mt-1 text-sm text-charcoal-soft">도쿄·방콕·파리 샘플 여행은 모두 SAMPLE 배지가 붙어요. 내가 만든 여행은 영향받지 않습니다.</p>
          <div className="mt-4 flex gap-2">
            {hasSample ? <Button variant="danger" onClick={() => setConfirm('clear')}>샘플 데이터 삭제</Button>
              : <Button variant="ghost" onClick={() => { seedSampleData(true); toast('샘플 데이터를 불러왔어요'); }}>샘플 데이터 불러오기</Button>}
          </div>
        </Card>

        <ApiSettingsCard />

        <Card>
          <h3 className="text-xl">외부 API 연결 상태</h3>
          <ul className="mt-3 divide-y divide-beige/70 text-sm">
            {providerStatus(apiSettings).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2"><div><p>{p.label}</p><p className="text-xs text-charcoal-mute">{p.note}</p></div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] ${p.connected ? 'bg-olive-light text-olive-dark' : 'bg-beige text-charcoal-soft'}`}>{p.connected ? '연결됨' : '미연결'}</span></li>
            ))}
          </ul>
        </Card>
      </section>

      <Modal open={confirm === 'clear'} onClose={() => setConfirm(null)} title="샘플 데이터를 삭제할까요?">
        <p className="text-sm text-charcoal-soft">SAMPLE이 붙은 모든 항목이 삭제됩니다. 직접 만든 데이터는 유지돼요.</p>
        <div className="mt-6 flex justify-end gap-2"><Button variant="ghost" onClick={() => setConfirm(null)}>취소</Button>
          <Button variant="danger" onClick={() => { clearSampleData(); setConfirm(null); toast('샘플 데이터를 삭제했어요'); }}>삭제</Button></div>
      </Modal>
      <Modal open={confirm === 'restore'} onClose={() => setConfirm(null)} title="백업으로 복원할까요?">
        <p className="text-sm text-charcoal-soft">현재 저장된 모든 데이터가 백업 파일의 내용으로 교체돼요.</p>
        <div className="mt-6 flex justify-end gap-2"><Button variant="ghost" onClick={() => setConfirm(null)}>취소</Button>
          <Button onClick={async () => { try { await db.importJson(pending); toast('복원했어요 (사진 포함)'); } catch (e) { toast(errMsg(e), 'error'); } setConfirm(null); }}>복원</Button></div>
      </Modal>
    </>
  );
}
