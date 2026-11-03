import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Star, Trash2, MapPin } from 'lucide-react';
import { Button, EmptyState, Modal, SampleBadge, toast } from '@/components/ui';
import * as db from '@/db/database';
import { Photo, Trip } from '@/types/models';
import { addPhotos, photoSrc, removePhoto, setCover, updatePhoto } from '@/services/archiveService';
import { errMsg } from '@/lib/format';

/** Resolves remote URLs and IndexedDB-backed photos alike. */
export function usePhotoSrc(p?: Photo) {
  const [src, setSrc] = useState<string | undefined>(p && !p.blobId ? p.src : undefined);
  useEffect(() => {
    let live = true;
    if (!p) return setSrc(undefined);
    if (!p.blobId) return setSrc(p.src);
    photoSrc(p).then((s) => live && setSrc(s)).catch(() => live && setSrc(undefined));
    return () => { live = false; };
  }, [p?.id, p?.blobId, p?.src]); // eslint-disable-line react-hooks/exhaustive-deps
  return src;
}

export function PhotoImg({ photo, className = '', onClick }: { photo?: Photo; className?: string; onClick?: () => void }) {
  const src = usePhotoSrc(photo);
  if (!src) return <div className={`animate-pulse bg-beige ${className}`} />;
  return <img src={src} alt={photo?.caption ?? ''} loading="lazy" onClick={onClick} className={`object-cover ${onClick ? 'cursor-pointer' : ''} ${className}`} />;
}

const toLocalInput = (iso?: string) => (iso ? iso.slice(0, 16) : '');

function PhotoEditor({ photo, trip, onClose }: { photo: Photo | null; trip: Trip; onClose: () => void }) {
  const [caption, setCaption] = useState('');
  const [taken, setTaken] = useState('');
  const [placeId, setPlaceId] = useState('');
  const src = usePhotoSrc(photo ?? undefined);
  useEffect(() => { if (photo) { setCaption(photo.caption ?? ''); setTaken(toLocalInput(photo.takenAt)); setPlaceId(photo.placeId ?? ''); } }, [photo]);
  const places = db.byTrip('places', trip.id).filter((p) => !p.linkedType);
  if (!photo) return null;

  const save = () => { updatePhoto(photo.id, { caption: caption.trim() || undefined, takenAt: taken ? `${taken}:00` : undefined, placeId: placeId || undefined }); toast('사진 정보를 저장했어요'); onClose(); };
  const cover = async () => { try { await setCover(photo.id); toast('대표 사진으로 설정했어요'); } catch (e) { toast(errMsg(e), 'error'); } };
  const del = async () => { if (!window.confirm('이 사진을 삭제할까요? 되돌릴 수 없어요.')) return; await removePhoto(photo.id); toast('사진을 삭제했어요'); onClose(); };

  return (
    <Modal open onClose={onClose} title="사진 정보">
      <div className="space-y-4">
        {src && <img src={src} alt="" className="max-h-72 w-full rounded-xl object-contain bg-beige/40" />}
        <div><label className="field-label">설명</label><input className="field" value={caption} onChange={(e) => setCaption(e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="field-label">촬영 시각</label><input type="datetime-local" className="field" value={taken} onChange={(e) => setTaken(e.target.value)} /></div>
          <div><label className="field-label">방문 장소 연결</label><select className="field" value={placeId} onChange={(e) => setPlaceId(e.target.value)}><option value="">연결 안 함</option>{places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        </div>
        {photo.lat !== undefined && <p className="flex items-center gap-1 text-xs text-charcoal-mute"><MapPin size={12} /> EXIF 위치 {photo.lat.toFixed(4)}, {photo.lng?.toFixed(4)}</p>}
        <div className="flex flex-wrap justify-between gap-2">
          <div className="flex gap-2"><Button variant="ghost" onClick={cover}><Star size={14} /> 대표 사진</Button><Button variant="danger" onClick={del}><Trash2 size={14} /> 삭제</Button></div>
          <div className="flex gap-2"><Button variant="ghost" onClick={onClose}>닫기</Button><Button onClick={save}>저장</Button></div>
        </div>
      </div>
    </Modal>
  );
}

export function PhotoGallery({ trip, photos }: { trip: Trip; photos: Photo[] }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<Photo | null>(null);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const r = await addPhotos(trip.id, Array.from(files));
      if (r.added.length) toast(`${r.added.length}장 업로드${r.withExif ? ` · 위치/시간 정보 ${r.withExif}장` : ''}${r.linked ? ` · 방문 장소 자동 연결 ${r.linked}장` : ''}`);
      r.failed.slice(0, 3).forEach((m) => toast(m, 'error'));
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button onClick={() => input.current?.click()} disabled={busy}><ImagePlus size={14} /> {busy ? '업로드 중…' : '사진 업로드'}</Button>
        <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
        <span className="text-xs text-charcoal-mute">여러 장 선택 가능 · 자동 압축 · JPEG의 위치(GPS)가 방문 장소 300m 안이면 자동 연결돼요 · 동영상은 아직 지원하지 않아요</span>
      </div>
      {photos.length === 0 ? <EmptyState title="아직 사진이 없어요" desc="이 여행의 사진을 올려 앨범을 만들어 보세요." /> : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((p) => (
            <figure key={p.id} className="group relative overflow-hidden rounded-xl2 bg-beige/40">
              <PhotoImg photo={p} className="aspect-square w-full transition-transform duration-700 group-hover:scale-[1.04]" onClick={() => setEdit(p)} />
              <div className="pointer-events-none absolute left-2 top-2 flex gap-1">{p.isCover && <span className="rounded-full bg-olive px-2 py-0.5 text-[10px] text-white">대표</span>}{p.isSample && <SampleBadge />}</div>
              {p.caption && <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-charcoal/70 to-transparent px-3 pb-2 pt-6 text-xs text-cream">{p.caption}</figcaption>}
            </figure>
          ))}
        </div>
      )}
      <PhotoEditor photo={edit} trip={trip} onClose={() => setEdit(null)} />
    </div>
  );
}
