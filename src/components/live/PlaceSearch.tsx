import { useEffect, useRef, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { autocompletePlaces, newSessionToken, placeDetails, PlaceDetail, PlaceSuggestion } from '@/integrations/google';
import { geocode } from '@/integrations/live';
import { useApiSettings } from '@/integrations/settings';

/**
 * "구글 지도에서 찾기" — Places API (New) autocomplete biased to the trip city.
 * Picking a result returns name, address, coordinates and (for places) opening hours.
 */
export default function PlaceSearch({ city, onPick, placeholder = '예: 루브르 박물관, 이치란 라멘' }: { city?: string; onPick: (p: PlaceDetail) => void; placeholder?: string }) {
  const { googleMapsKey } = useApiSettings();
  const [q, setQ] = useState('');
  const [list, setList] = useState<PlaceSuggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const token = useRef(newSessionToken());
  const near = useRef<{ lat: number; lng: number } | undefined>();

  useEffect(() => { if (city) geocode(city).then((g) => { if (g) near.current = { lat: g.lat, lng: g.lng }; }).catch(() => {}); }, [city]);

  useEffect(() => {
    if (!googleMapsKey || q.trim().length < 2) { setList([]); return; }
    const t = setTimeout(() => {
      setBusy(true); setErr('');
      autocompletePlaces(q.trim(), token.current, near.current)
        .then(setList)
        .catch((e) => { setErr(e.message); setList([]); })
        .finally(() => setBusy(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q, googleMapsKey]);

  if (!googleMapsKey) return null;

  const pick = async (s: PlaceSuggestion) => {
    setBusy(true); setErr('');
    try {
      const d = await placeDetails(s.placeId, token.current);
      onPick({ ...d, name: d.name || s.main });
      setQ(''); setList([]);
      token.current = newSessionToken(); // a session ends with a details call
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="relative rounded-xl border border-navy/20 bg-navy-light/30 p-3">
      <label className="field-label !mb-1 flex items-center gap-1.5 !text-navy"><Search size={13} /> 구글 지도에서 찾기 {city && <span className="font-normal text-charcoal-mute">· {city} 주변 우선</span>}</label>
      <div className="relative">
        <input className="field !pr-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label="구글 장소 검색" />
        {busy && <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-charcoal-mute" />}
      </div>
      {list.length > 0 && (
        <ul className="absolute inset-x-3 z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-beige-dark bg-paper shadow-lift">
          {list.map((s) => (
            <li key={s.placeId}><button type="button" onClick={() => pick(s)} className="w-full px-3 py-2.5 text-left hover:bg-beige/50">
              <span className="block text-sm">{s.main}</span><span className="block truncate text-xs text-charcoal-mute">{s.secondary}</span>
            </button></li>
          ))}
          <li className="px-3 py-1.5 text-right text-[10px] text-charcoal-mute">Powered by Google</li>
        </ul>
      )}
      {err && <p className="mt-1.5 text-xs text-clay">{err}</p>}
      <p className="mt-1.5 text-[11px] text-charcoal-mute">고르면 이름·주소·좌표{placeholder.includes('호텔') ? '' : '·영업시간'}이 자동으로 채워져요.</p>
    </div>
  );
}
