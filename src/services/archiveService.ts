/** Phase 5: photos, reviews, timeline, ending a trip and the generated trip report. */
import * as db from '@/db/database';
import { blobUrl, deleteBlobCached, putBlobCached } from '@/db/blobStore';
import { readExif } from '@/lib/exif';
import { Photo, Place, Review, Trip, TripReport, ID } from '@/types/models';
import { haversineKm, hasGeo, dayPlaces, tripDays } from './plannerService';
import { summarize, tripLedger } from './budgetService';
import { daysBetween } from '@/lib/format';

/* ---------------- photos ---------------- */

/** Downscale to keep IndexedDB usage reasonable (~100–250KB per photo). */
function compress(file: File, maxW: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error(`「${file.name}」은(는) 이미지가 아니에요. 사진만 올릴 수 있어요(동영상은 아직 지원하지 않아요).`));
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`「${file.name}」을(를) 열 수 없어요.`)); };
    im.onload = () => {
      const scale = Math.min(1, maxW / Math.max(im.width, im.height));
      const c = document.createElement('canvas');
      c.width = Math.round(im.width * scale); c.height = Math.round(im.height * scale);
      c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    im.src = url;
  });
}

const NEAR_KM = 0.3;

/** Link a photo to the nearest planned place (by EXIF GPS), or by date to that day's only place. */
export function suggestPlace(tripId: ID, info: { lat?: number; lng?: number; takenAt?: string }): ID | undefined {
  const places = db.byTrip('places', tripId).filter((p) => !p.linkedType);
  if (info.lat !== undefined && info.lng !== undefined) {
    const here = { lat: info.lat, lng: info.lng };
    const best = places.filter(hasGeo).map((p) => ({ p, km: haversineKm(here, p) })).sort((a, b) => a.km - b.km)[0];
    if (best && best.km <= NEAR_KM) return best.p.id;
  }
  return undefined;
}

export interface UploadResult { added: Photo[]; failed: string[]; linked: number; withExif: number }

export async function addPhotos(tripId: ID, files: File[]): Promise<UploadResult> {
  const res: UploadResult = { added: [], failed: [], linked: 0, withExif: 0 };
  for (const f of files) {
    try {
      const exif = await readExif(f);
      const data = await compress(f, 1400, 0.74);
      const id = db.uid();
      await putBlobCached(id, data);
      const placeId = suggestPlace(tripId, exif);
      const row = db.insert('photos', { tripId, blobId: id, src: '', takenAt: exif.takenAt, lat: exif.lat, lng: exif.lng, placeId });
      res.added.push(row);
      if (exif.takenAt || exif.lat !== undefined) res.withExif++;
      if (placeId) res.linked++;
    } catch (e) { res.failed.push(e instanceof Error ? e.message : `「${f.name}」 업로드 실패`); }
  }
  return res;
}

export async function removePhoto(id: ID) {
  const p = db.get('photos', id);
  if (!p) return;
  if (p.blobId) await deleteBlobCached(p.blobId).catch(() => undefined);
  db.remove('photos', id);
}

export const updatePhoto = (id: ID, patch: Partial<Photo>) => db.update('photos', id, patch);

export const photoSrc = async (p: Photo) => (p.blobId ? blobUrl(p.blobId) : p.src);

/** Make this photo the trip cover (a smaller copy is stored on the trip so lists stay fast). */
export async function setCover(photoId: ID) {
  const p = db.get('photos', photoId);
  if (!p) return;
  let cover = await photoSrc(p);
  if (!cover) throw new Error('사진을 불러올 수 없어요.');
  if (p.blobId) cover = await shrinkDataUrl(cover, 900, 0.7);
  db.byTrip('photos', p.tripId).forEach((x) => x.isCover !== (x.id === photoId) && db.update('photos', x.id, { isCover: x.id === photoId }));
  db.update('trips', p.tripId, { coverImage: cover });
}

function shrinkDataUrl(dataUrl: string, maxW: number, q: number): Promise<string> {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onerror = () => rej(new Error('이미지를 처리하지 못했어요.'));
    im.onload = () => {
      const s = Math.min(1, maxW / Math.max(im.width, im.height));
      const c = document.createElement('canvas'); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
      c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height);
      res(c.toDataURL('image/jpeg', q));
    };
    im.src = dataUrl;
  });
}

/** Remove every photo blob of a trip (used when the trip itself is deleted). */
export async function deleteTripBlobs(tripId: ID) {
  await Promise.all(db.byTrip('photos', tripId).filter((p) => p.blobId).map((p) => deleteBlobCached(p.blobId!).catch(() => undefined)));
}

/* ---------------- reviews ---------------- */

export type ReviewInput = Omit<Review, 'id' | 'createdAt' | 'updatedAt' | 'isSample'>;
export const tripReview = (tripId: ID) => db.byTrip('reviews', tripId).find((r) => r.targetType === 'trip');
export const targetReviews = (tripId: ID) => db.byTrip('reviews', tripId).filter((r) => r.targetType !== 'trip');

export function saveTripReview(tripId: ID, data: { rating: number; text: string; revisit: string[]; regrets: string }) {
  const cur = tripReview(tripId);
  const payload = { rating: data.rating, text: data.text.trim(), revisit: data.revisit, regrets: data.regrets.trim() || undefined };
  return cur ? db.update('reviews', cur.id, payload) : db.insert('reviews', { tripId, targetType: 'trip', ...payload });
}
export const addTargetReview = (d: ReviewInput) => db.insert('reviews', d);
export const saveTargetReview = (id: ID, patch: Partial<Review>) => db.update('reviews', id, patch);
export const removeReview = (id: ID) => db.remove('reviews', id);

/* ---------------- timeline ---------------- */

export interface TimelineDay {
  dayIndex: number; date: string; title?: string; id: ID;
  places: { place: Place; photos: Photo[]; spendKRW: number; review?: Review }[];
  extraPhotos: Photo[]; extraSpendKRW: number; spendKRW: number;
}

/** Day by day: places, the photos linked to them (or taken that day), and spending. */
export function timeline(tripId: ID): TimelineDay[] {
  const photos = db.byTrip('photos', tripId);
  const expenses = tripLedger(tripId).actual;
  const reviews = db.byTrip('reviews', tripId);
  return tripDays(tripId).map((d) => {
    const ps = dayPlaces(d.id);
    const ids = new Set(ps.map((p) => p.id));
    const day = d.date;
    const rows = ps.map((p) => ({
      place: p,
      photos: photos.filter((x) => x.placeId === p.id),
      spendKRW: expenses.filter((e) => e.expense?.placeId === p.id).reduce((s, e) => s + e.amountKRW, 0),
      review: reviews.find((r) => r.targetId === p.id),
    }));
    const placed = new Set(rows.flatMap((r) => r.photos.map((x) => x.id)));
    const extra = photos.filter((x) => !placed.has(x.id) && !x.placeId && x.takenAt?.slice(0, 10) === day);
    const dayExp = expenses.filter((e) => e.date === day);
    const linked = dayExp.filter((e) => e.expense?.placeId && ids.has(e.expense.placeId)).reduce((s, e) => s + e.amountKRW, 0);
    const total = dayExp.reduce((s, e) => s + e.amountKRW, 0);
    return { id: d.id, dayIndex: d.dayIndex, date: day, title: d.title, places: rows, extraPhotos: extra, extraSpendKRW: total - linked, spendKRW: total };
  });
}

export const setVisited = (placeId: ID, visited: boolean) => db.update('places', placeId, { visited });

/* ---------------- report & ending the trip ---------------- */

export function buildReport(trip: Trip): TripReport {
  const s = summarize(trip);
  const places = db.byTrip('places', trip.id).filter((p) => !p.linkedType);
  const visited = places.filter((p) => p.visited).length;
  const photos = db.byTrip('photos', trip.id);
  const review = tripReview(trip.id);
  const byCategory = Object.fromEntries(s.rows.filter((r) => r.actual > 0).map((r) => [r.category, r.actual]));
  const top = [...s.rows].sort((a, b) => b.actual - a.actual)[0];
  const hl: string[] = [];
  if (top && top.actual > 0) hl.push(`가장 많이 쓴 곳은 ${top.category} (${Math.round((top.actual / Math.max(1, s.actualKRW)) * 100)}%)`);
  if (places.length) hl.push(`계획한 ${places.length}곳 중 ${visited}곳을 다녀왔어요`);
  if (s.total && s.actualKRW > 0) hl.push(s.actualKRW <= s.total ? `예산보다 ${Math.round(s.total - s.actualKRW).toLocaleString('ko-KR')}원 덜 썼어요` : `예산을 ${Math.round(s.actualKRW - s.total).toLocaleString('ko-KR')}원 넘겼어요`);
  if (review?.revisit?.length) hl.push(`다시 가고 싶은 곳: ${review.revisit.join(', ')}`);
  if (s.planKRW > 0 && s.actualKRW > 0) hl.push(`일정 기준 예상 ${Math.round(s.planKRW).toLocaleString('ko-KR')}원 대비 실제 지출 ${Math.round(s.actualKRW).toLocaleString('ko-KR')}원`);
  const best = photos.find((p) => p.isCover) ?? photos[0];
  return {
    generatedAt: new Date().toISOString(), days: daysBetween(trip.startDate, trip.endDate) + 1, totalSpendKRW: s.actualKRW, perPersonKRW: s.perPerson,
    budgetKRW: s.total || undefined, plannedKRW: s.planKRW, byCategory, placesTotal: places.length, placesVisited: visited, photos: photos.length,
    flights: db.byTrip('flights', trip.id).length, hotels: db.byTrip('hotels', trip.id).length, rating: review?.rating, bestPhotoId: best?.id, highlights: hl,
  };
}

export interface EndCheck { level: 'warn' | 'info'; text: string }

/** What to look at before closing a trip. */
export function endChecks(trip: Trip, today: string): EndCheck[] {
  const out: EndCheck[] = [];
  const l = tripLedger(trip.id);
  if (trip.endDate > today) out.push({ level: 'warn', text: `아직 여행이 끝나지 않았어요 (귀국일 ${trip.endDate}). 지금 종료해도 나중에 수정할 수 있어요.` });
  if (l.committed.length) out.push({ level: 'warn', text: `결제 전 예약 ${l.committed.length}건이 남아 있어요. 총경비에는 포함되지 않아요.` });
  const places = db.byTrip('places', trip.id).filter((p) => !p.linkedType);
  const un = places.filter((p) => !p.visited).length;
  if (places.length && un) out.push({ level: 'info', text: `방문 표시가 없는 장소가 ${un}곳 있어요. 다녀왔다면 타임라인에서 체크해 주세요.` });
  if (!tripReview(trip.id)) out.push({ level: 'info', text: '여행 후기를 아직 쓰지 않았어요. 종료 후에도 쓸 수 있어요.' });
  return out;
}

/**
 * End the trip: status → completed, freeze the report (total spend, visited places, photos,
 * reviews, flights and hotels are all read from the same Trip ID), and make sure the
 * archive page has a cover. Nothing is deleted, and everything stays editable afterwards.
 */
export function endTrip(tripId: ID) {
  const trip = db.get('trips', tripId);
  if (!trip) throw new Error('여행을 찾을 수 없어요.');
  const report = buildReport(trip);
  db.update('trips', tripId, { status: 'completed', completedAt: new Date().toISOString(), report });
  return report;
}

export function regenerateReport(tripId: ID) {
  const trip = db.get('trips', tripId);
  if (trip) db.update('trips', tripId, { report: buildReport(trip) });
}

/** Re-open a finished trip (for example, it was ended by mistake). Data is untouched. */
export function reopenTrip(tripId: ID) { db.update('trips', tripId, { status: 'booked', completedAt: undefined }); }
