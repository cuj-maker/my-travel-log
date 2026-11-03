import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps, MAPS_AUTH_MSG, mapsAuthFailed } from '@/integrations/google';
import { hasGeo } from '@/services/plannerService';
import type { MapLayer } from './MapView';

type Pt = { lat: number; lng: number };

/** Real Google map: numbered markers per day, dashed day lines, ★ hotel. Calls onError to fall back. */
export default function GoogleMap({ layers, hotel, selectedId, onSelect, colors, onError }: {
  layers: MapLayer[]; hotel?: Pt & { name: string }; selectedId?: string; onSelect: (id: string) => void; colors: string[]; onError: (msg: string) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const overlays = useRef<any[]>([]);
  const fitKey = useRef('');
  const [ready, setReady] = useState(false);

  // Create the map once
  useEffect(() => {
    let alive = true;
    if (mapsAuthFailed) { onError(MAPS_AUTH_MSG); return; }
    const onAuth = () => alive && onError(MAPS_AUTH_MSG);
    window.addEventListener('mtl-gmaps-auth-failed', onAuth);
    loadGoogleMaps()
      .then(async (g) => {
        const { Map } = await g.importLibrary('maps');
        await g.importLibrary('marker');
        if (!alive || !el.current) return;
        map.current = new Map(el.current, {
          center: { lat: 37.5665, lng: 126.978 }, zoom: 12, mapId: 'DEMO_MAP_ID',
          disableDefaultUI: true, zoomControl: true, fullscreenControl: true, gestureHandling: 'cooperative', clickableIcons: false,
        });
        setReady(true);
      })
      .catch((e) => alive && onError(e.message));
    return () => { alive = false; window.removeEventListener('mtl-gmaps-auth-failed', onAuth); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw markers / lines whenever data or selection changes
  useEffect(() => {
    const g = (window as any).google?.maps;
    if (!ready || !g || !map.current) return;
    overlays.current.forEach((o) => { if (typeof o.setMap === 'function') o.setMap(null); else o.map = null; });
    overlays.current = [];
    const bounds = new g.LatLngBounds();
    let n = 0;

    layers.forEach((l) => {
      const color = colors[(l.dayIndex - 1) % colors.length];
      const pts = l.places.filter(hasGeo);
      if (pts.length > 1) {
        overlays.current.push(new g.Polyline({
          map: map.current, path: pts.map((p) => ({ lat: p.lat, lng: p.lng })), strokeOpacity: 0,
          icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.9, strokeColor: color, scale: 3 }, offset: '0', repeat: '12px' }],
        }));
      }
      pts.forEach((p, i) => {
        const sel = p.id === selectedId;
        const dot = document.createElement('div');
        dot.style.cssText = `width:${sel ? 30 : 24}px;height:${sel ? 30 : 24}px;border-radius:50%;background:${color};color:#FCFBF8;border:2.5px solid #FCFBF8;display:flex;align-items:center;justify-content:center;font:600 11px Pretendard,system-ui,sans-serif;box-shadow:0 2px 6px rgba(0,0,0,.25);cursor:pointer`;
        dot.textContent = String(i + 1);
        const m = new g.marker.AdvancedMarkerElement({ map: map.current, position: { lat: p.lat, lng: p.lng }, content: dot, title: p.name, zIndex: sel ? 1000 : i + 1, gmpClickable: true });
        m.addEventListener('gmp-click', () => onSelect(p.id));
        overlays.current.push(m);
        bounds.extend({ lat: p.lat, lng: p.lng });
        n++;
      });
    });

    if (hotel) {
      const star = document.createElement('div');
      star.style.cssText = 'font-size:22px;line-height:1;color:#B5715A;text-shadow:0 0 3px #fff,0 0 3px #fff';
      star.textContent = '★';
      overlays.current.push(new g.marker.AdvancedMarkerElement({ map: map.current, position: { lat: hotel.lat, lng: hotel.lng }, content: star, title: hotel.name }));
      bounds.extend(hotel);
      n++;
    }

    // Re-fit only when the set of places changes (not on every selection)
    const key = layers.map((l) => l.places.filter(hasGeo).map((p) => p.id).join(',')).join('|') + (hotel ? '|h' : '');
    if (n && key !== fitKey.current) {
      fitKey.current = key;
      if (n === 1) { map.current.setCenter(bounds.getCenter()); map.current.setZoom(15); }
      else map.current.fitBounds(bounds, 48);
    }
  }, [ready, layers, hotel, selectedId, colors, onSelect]);

  return (
    <div className="overflow-hidden rounded-xl2 border border-beige bg-[#EFEBE2]">
      <div ref={el} className="h-[320px] w-full lg:h-[460px]" role="region" aria-label="Google 지도" />
      <p className="border-t border-beige bg-paper/70 px-3 py-1.5 text-[11px] text-charcoal-mute">Google 지도 · 번호는 방문 순서 · ★ 숙소 · 점선은 순서 연결(실제 경로 아님)</p>
    </div>
  );
}
