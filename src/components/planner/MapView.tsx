import { useMemo, useState } from 'react';
import GoogleMap from './GoogleMap';
import OsmMap from './OsmMap';
import { useApiSettings } from '@/integrations/settings';
import { Place } from '@/types/models';
import { hasGeo } from '@/services/plannerService';

export const DAY_COLORS = ['#34445A', '#78836A', '#B5715A', '#8A6F9E', '#C29B3C', '#4F8A8B'];
const W = 640, H = 420, PAD = 44;

export interface MapLayer { dayIndex: number; places: Place[] }
type Pt = { lat: number; lng: number };

/**
 * Lightweight coordinate map (no tiles): projects lat/lng onto an SVG so planning works
 * without a map API. The map-provider slot in integrations/ can replace this component.
 */
export default function MapView(props: { layers: MapLayer[]; hotel?: Pt & { name: string }; selectedId?: string; onSelect: (id: string) => void }) {
  const { googleMapsKey } = useApiSettings();
  const [failed, setFailed] = useState<string>();
  const hasPoints = props.layers.some((l) => l.places.some(hasGeo)) || !!props.hotel;
  // Google (when a key is set) → free OpenStreetMap map (online) → simple coordinate map (offline)
  if (googleMapsKey && !failed && hasPoints) {
    return <GoogleMap {...props} colors={DAY_COLORS} onError={setFailed} />;
  }
  if (hasPoints && navigator.onLine) {
    return (<>
      <OsmMap {...props} colors={DAY_COLORS} />
      {failed && <p className="mt-1 text-[11px] text-clay">{failed} · 무료 지도로 표시 중</p>}
    </>);
  }
  return <SvgMap {...props} />;
}

function SvgMap({ layers, hotel, selectedId, onSelect }: { layers: MapLayer[]; hotel?: Pt & { name: string }; selectedId?: string; onSelect: (id: string) => void }) {
  const { project, empty } = useMemo(() => {
    const pts: Pt[] = layers.flatMap((l) => l.places.filter(hasGeo));
    if (hotel) pts.push(hotel);
    if (!pts.length) return { project: () => ({ x: 0, y: 0 }), empty: true };
    const lat0 = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
    const kx = Math.cos((lat0 * Math.PI) / 180);
    const xs = pts.map((p) => p.lng * kx), ys = pts.map((p) => -p.lat);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const span = Math.max(maxX - minX, maxY - minY, 0.004);
    const scale = Math.min(W - PAD * 2, H - PAD * 2) / span;
    const ox = (W - (maxX - minX) * scale) / 2, oy = (H - (maxY - minY) * scale) / 2;
    return { empty: false, project: (p: Pt) => ({ x: ox + (p.lng * kx - minX) * scale, y: oy + (-p.lat - minY) * scale }) };
  }, [layers, hotel]);

  if (empty) {
    return <div className="flex h-full min-h-[260px] items-center justify-center rounded-xl2 border border-dashed border-beige-dark bg-cream/60 p-6 text-center text-sm text-charcoal-mute">좌표가 있는 장소를 추가하면 여기에 지도가 그려져요.<br />장소 추가 시 위도·경도를 입력하세요.</div>;
  }

  return (
    <div className="overflow-hidden rounded-xl2 border border-beige bg-[#EFEBE2]">
      <svg viewBox={`0 0 ${W} ${H}`} className="block max-h-[320px] w-full lg:max-h-none" role="img" aria-label="여행 장소 지도">
        <defs><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#E0D8C8" strokeWidth="1" /></pattern></defs>
        <rect width={W} height={H} fill="url(#grid)" />
        {layers.map((l) => {
          const color = DAY_COLORS[(l.dayIndex - 1) % DAY_COLORS.length];
          const g = l.places.filter(hasGeo).map((p) => ({ p, ...project(p) }));
          return (
            <g key={l.dayIndex}>
              {g.length > 1 && <polyline points={g.map((q) => `${q.x},${q.y}`).join(' ')} fill="none" stroke={color} strokeWidth="2.5" strokeDasharray="6 5" strokeLinecap="round" opacity="0.85" />}
              {g.map((q, i) => {
                const sel = q.p.id === selectedId;
                return (
                  <g key={q.p.id} transform={`translate(${q.x},${q.y})`} onClick={() => onSelect(q.p.id)} className="cursor-pointer" role="button" aria-label={q.p.name}>
                    <circle r={sel ? 15 : 12} fill={color} stroke="#FCFBF8" strokeWidth="2.5" />
                    <text textAnchor="middle" dy="4" fontSize="11" fontWeight="600" fill="#FCFBF8">{i + 1}</text>
                    {sel && <text y="-20" textAnchor="middle" fontSize="12" fill="#333" stroke="#FCFBF8" strokeWidth="3" paintOrder="stroke">{q.p.name}</text>}
                  </g>
                );
              })}
            </g>
          );
        })}
        {hotel && (() => { const q = project(hotel); return (
          <g transform={`translate(${q.x},${q.y})`}><path d="M0 -14 L4 -4 L14 -4 L6 3 L9 13 L0 7 L-9 13 L-6 3 L-14 -4 L-4 -4Z" fill="#B5715A" stroke="#FCFBF8" strokeWidth="1.5" /><text y="26" textAnchor="middle" fontSize="11" fill="#333" stroke="#FCFBF8" strokeWidth="3" paintOrder="stroke">{hotel.name}</text></g>); })()}
      </svg>
      <p className="border-t border-beige bg-paper/70 px-3 py-1.5 text-[11px] text-charcoal-mute">간이 좌표 지도 (오프라인) · ★ 숙소</p>
    </div>
  );
}
