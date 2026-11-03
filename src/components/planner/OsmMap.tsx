import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { hasGeo } from '@/services/plannerService';
import type { MapLayer } from './MapView';

type Pt = { lat: number; lng: number };

/**
 * Free real map — no sign-up, no key. Tiles: OpenStreetMap standard (light personal use, attribution required).
 * Used whenever no Google Maps key is configured.
 */
export default function OsmMap({ layers, hotel, selectedId, onSelect, colors }: {
  layers: MapLayer[]; hotel?: Pt & { name: string }; selectedId?: string; onSelect: (id: string) => void; colors: string[];
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const group = useRef<L.LayerGroup | null>(null);
  const fitKey = useRef('');

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, className: 'mtl-tiles',
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    }).addTo(m);
    m.setView([37.5665, 126.978], 12);
    group.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => { m.remove(); map.current = null; group.current = null; fitKey.current = ''; };
  }, []);

  useEffect(() => {
    const m = map.current, g = group.current;
    if (!m || !g) return;
    g.clearLayers();
    const bounds: L.LatLngExpression[] = [];

    layers.forEach((l) => {
      const color = colors[(l.dayIndex - 1) % colors.length];
      const pts = l.places.filter(hasGeo);
      if (pts.length > 1) L.polyline(pts.map((p) => [p.lat, p.lng] as L.LatLngTuple), { color, weight: 3, opacity: 0.85, dashArray: '6 8' }).addTo(g);
      pts.forEach((p, i) => {
        const sel = p.id === selectedId, size = sel ? 30 : 24;
        const icon = L.divIcon({
          className: '',
          iconSize: [size, size], iconAnchor: [size / 2, size / 2],
          html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};color:#FCFBF8;border:2.5px solid #FCFBF8;display:flex;align-items:center;justify-content:center;font:600 11px Pretendard,system-ui,sans-serif;box-shadow:0 2px 6px rgba(0,0,0,.25)">${i + 1}</div>`,
        });
        L.marker([p.lat, p.lng], { icon, title: p.name, zIndexOffset: sel ? 1000 : 0 })
          .on('click', () => onSelect(p.id))
          .bindTooltip(p.name, { direction: 'top', offset: [0, -size / 2], permanent: sel })
          .addTo(g);
        bounds.push([p.lat, p.lng]);
      });
    });

    if (hotel) {
      L.marker([hotel.lat, hotel.lng], {
        icon: L.divIcon({ className: '', iconSize: [24, 24], iconAnchor: [12, 12], html: '<div style="font-size:22px;line-height:24px;text-align:center;color:#B5715A;text-shadow:0 0 3px #fff,0 0 3px #fff">★</div>' }),
        title: hotel.name,
      }).bindTooltip(hotel.name, { direction: 'top', offset: [0, -12] }).addTo(g);
      bounds.push([hotel.lat, hotel.lng]);
    }

    const key = layers.map((l) => l.places.filter(hasGeo).map((p) => p.id).join(',')).join('|') + (hotel ? '|h' : '');
    if (bounds.length && key !== fitKey.current) {
      fitKey.current = key;
      if (bounds.length === 1) m.setView(bounds[0], 15);
      else m.fitBounds(L.latLngBounds(bounds), { padding: [36, 36] });
    }
  }, [layers, hotel, selectedId, colors, onSelect]);

  return (
    <div className="overflow-hidden rounded-xl2 border border-beige bg-[#EFEBE2]">
      <div ref={el} className="relative z-0 h-[320px] w-full lg:h-[460px]" role="region" aria-label="지도" />
      <p className="border-t border-beige bg-paper/70 px-3 py-1.5 text-[11px] text-charcoal-mute">번호는 방문 순서 · ★ 숙소 · 점선은 순서 연결(실제 경로 아님) · 두 손가락으로 확대</p>
    </div>
  );
}
