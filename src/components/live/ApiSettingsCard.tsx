import { useState } from 'react';
import { CheckCircle2, KeyRound, Loader2, XCircle } from 'lucide-react';
import { Button, Card, toast } from '@/components/ui';
import { buildDefaults, localOverrides, saveApiSettings, useApiSettings } from '@/integrations/settings';
import { autocompletePlaces, computeRoute, newSessionToken } from '@/integrations/google';
import { pingFlightProxy } from '@/integrations/flights';

type Check = { state: 'idle' | 'busy' | 'ok' | 'fail'; msg?: string };

export default function ApiSettingsCard() {
  const cur = useApiSettings();
  const env = buildDefaults();
  const [gKey, setGKey] = useState(localOverrides().googleMapsKey ?? '');
  const [proxy, setProxy] = useState(localOverrides().flightProxyUrl ?? '');
  const [gCheck, setGCheck] = useState<Check>({ state: 'idle' });
  const [pCheck, setPCheck] = useState<Check>({ state: 'idle' });

  const save = () => { saveApiSettings({ googleMapsKey: gKey.trim(), flightProxyUrl: proxy.trim() }); toast('API 설정을 저장했어요'); };

  const testGoogle = async () => {
    save(); setGCheck({ state: 'busy' });
    try {
      const s = await autocompletePlaces('에펠탑', newSessionToken());
      const r = await computeRoute({ lat: 48.8584, lng: 2.2945 }, { lat: 48.8606, lng: 2.3376 }, 'subway');
      setGCheck({ state: 'ok', msg: `장소 검색 ${s.length}건 · 경로 ${r ? `${r.durationMin}분` : '없음'} — 정상 연결됐어요` });
    } catch (e) { setGCheck({ state: 'fail', msg: (e as Error).message }); }
  };
  const testProxy = async () => {
    save(); setPCheck({ state: 'busy' });
    try {
      const r = await pingFlightProxy(proxy.trim() || env.flightProxyUrl);
      setPCheck(r.hasKey ? { state: 'ok', msg: '중계 서버 연결됨 · SerpApi 키 설정됨' } : { state: 'fail', msg: '서버는 연결됐지만 SERPAPI_KEY가 없어요' });
    } catch (e) { setPCheck({ state: 'fail', msg: `연결 실패: ${(e as Error).message}. 주소와 ALLOWED_ORIGINS를 확인해 주세요.` }); }
  };

  const status = (c: Check) => c.state === 'idle' ? null : (
    <p className={`mt-1.5 flex items-start gap-1.5 text-xs ${c.state === 'ok' ? 'text-olive-dark' : c.state === 'fail' ? 'text-clay' : 'text-charcoal-mute'}`}>
      {c.state === 'busy' ? <Loader2 size={13} className="mt-0.5 shrink-0 animate-spin" /> : c.state === 'ok' ? <CheckCircle2 size={13} className="mt-0.5 shrink-0" /> : <XCircle size={13} className="mt-0.5 shrink-0" />}
      {c.state === 'busy' ? '확인 중…' : c.msg}
    </p>
  );

  return (
    <Card>
      <h3 className="flex items-center gap-2 text-xl"><KeyRound size={18} /> API 설정</h3>
      <p className="mt-1 text-xs text-charcoal-mute">여기 입력한 값은 <b>이 기기·브라우저에만</b> 저장돼요. PC·아이폰 모두에 한 번에 적용하려면 GitHub 저장소 설정에 넣는 방법(docs/API_SETUP.md)이 편해요.</p>

      <div className="mt-4 space-y-4">
        <div>
          <label className="field-label">Google Maps API 키 <span className="font-normal text-charcoal-mute">— 지도·장소 검색·실제 경로</span></label>
          <input className="field font-mono" value={gKey} onChange={(e) => setGKey(e.target.value)} placeholder={env.googleMapsKey ? 'GitHub 설정값 사용 중 (덮어쓰려면 입력)' : 'AIza…'} autoComplete="off" spellCheck={false} />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button variant="ghost" className="!py-1.5" onClick={testGoogle} disabled={!gKey.trim() && !env.googleMapsKey}>연결 테스트</Button>
            <span className="text-[11px] text-charcoal-mute">{cur.googleMapsKey ? (localOverrides().googleMapsKey ? '이 기기 값 사용 중' : 'GitHub 설정값 사용 중') : '미설정'}</span>
          </div>
          {status(gCheck)}
        </div>

        <div>
          <label className="field-label">항공권 중계 서버 주소 <span className="font-normal text-charcoal-mute">— 앱 안에서 실시간 항공권 가격</span></label>
          <input className="field font-mono" value={proxy} onChange={(e) => setProxy(e.target.value)} placeholder={env.flightProxyUrl ? 'GitHub 설정값 사용 중 (덮어쓰려면 입력)' : 'https://my-travel-log-flights.<이름>.workers.dev'} autoComplete="off" spellCheck={false} inputMode="url" />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button variant="ghost" className="!py-1.5" onClick={testProxy} disabled={!proxy.trim() && !env.flightProxyUrl}>연결 테스트</Button>
            <span className="text-[11px] text-charcoal-mute">{cur.flightProxyUrl ? (localOverrides().flightProxyUrl ? '이 기기 값 사용 중' : 'GitHub 설정값 사용 중') : '미설정'}</span>
          </div>
          {status(pCheck)}
        </div>

        <div className="flex gap-2"><Button onClick={save}>저장</Button></div>
      </div>
    </Card>
  );
}
