import { useEffect, useRef, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { autocompletePlaces, newSessionToken, placeDetails, PlaceDetail, PlaceSuggestion } from '@/integrations/google';
import { OsmSuggestion, photonSearch } from '@/integrations/osm';
import { geocode } from '@/integrations/live';
import { useApiSettings } from '@/integrations/settings';

type Item = PlaceSuggestion & { detail?: PlaceDetail };

/**
 * Place search biased to the trip city.
 *  - Google key set → Places API (New): name, address, coordinates, opening hours
 *  - otherwise      → free Photon (OpenStreetMap): name, address, coordinates
 */
export default function PlaceSearch({ city, onPick, placeholder = '예: 루브르 박물관, Louvre' }: { city?: string; onPick: (p: PlaceDetail) => void; placeholder?: string }) {
  const { googleMapsKey } = useApiSettings();
  const google = !!googleMapsKey;
  const [q, setQ] = useState('');
  const [list, setList] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [searched, setSearched] = useState(false);
  const token = useRef(newSessionToken());
  const near = useRef<{ lat: number; lng: number } | undefined>();

  useEffect(() => { if (city) geocode(city).then((g) => { if (g) near.current = { lat: g.lat, lng: g.lng }; }).catch(() => {}); }, [city]);

  useEffect(() => {
    setSearched(false);
    if (q.trim().length < 2) { setList([]); return; }
    let alive = true;
    const t = setTimeout(() => {
      setBusy(true); setErr('');
      (google ? autocompletePlaces(q.trim(), token.current, near.current) : photonSearch(q.trim(), near.current) as Promise<OsmSuggestion[]>)
        .then((l) => { if (alive) { setList(l); setSearched(true); } })
        .catch((e) => { if (alive) { setErr(e.message); setList([]); } })
        .finally(() => alive && setBusy(false));
    }, google ? 300 : 450);
    return () => { alive = false; clearTimeout(t); };
  }, [q, google]);

  const pick = async (s: Item) => {
    if (s.detail) { onPick(s.detail); setQ(''); setList([]); return; }
    setBusy(true); setErr('');
    try {
      const d = await placeDetails(s.placeId, token.current);
      onPick({ ...d, name: d.name || s.main });
      setQ(''); setList([]);
      token.current = newSessionToken(); // a session ends with a details call
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const hangul = /[가-힣]/.test(q);
  return (
    <div className="relative rounded-xl border border-navy/20 bg-navy-light/30 p-3">
      <label className="field-label !mb-1 flex items-center gap-1.5 !text-navy"><Search size={13} /> 지도에서 장소 찾기 {city && <span className="font-normal text-charcoal-mute">· {city} 주변 우선</span>}</label>
      <div className="relative">
        <input className="field !pr-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label="장소 검색" />
        {busy && <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-charcoal-mute" />}
      </div>
      {list.length > 0 && (
        <ul className="absolute inset-x-3 z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-beige-dark bg-paper shadow-lift">
          {list.map((s) => (
            <li key={s.placeId}><button type="button" onClick={() => pick(s)} className="w-full px-3 py-2.5 text-left hover:bg-beige/50">
              <span className="block text-sm">{s.main}</span><span className="block truncate text-xs text-charcoal-mute">{s.secondary}</span>
            </button></li>
          ))}
          <li className="px-3 py-1.5 text-right text-[10px] text-charcoal-mute">{google ? 'Powered by Google' : '© OpenStreetMap · Photon'}</li>
        </ul>
      )}
      {err && <p className="mt-1.5 text-xs text-clay">{err}</p>}
      {!google && searched && !busy && list.length === 0 && <p className="mt-1.5 text-xs text-clay">결과가 없어요.{hangul ? ' 해외 장소는 영어나 현지어로 검색해 보세요 (예: Louvre, 一蘭).' : ''}</p>}
      <p className="mt-1.5 text-[11px] text-charcoal-mute">
        고르면 이름·주소·좌표{google && !placeholder.includes('호텔') ? '·영업시간' : ''}이 자동으로 채워져요.{!google && ' 해외 장소는 영어·현지어 검색이 더 정확해요.'}
      </p>
    </div>
  );
}
