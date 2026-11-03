import { ISODate, TripStatus } from '@/types/models';

export const krw = (n: number) => `₩${Math.round(n).toLocaleString('ko-KR')}`;
export const krwShort = (n: number) =>
  n >= 10000 ? `${(Math.round(n / 1000) / 10).toString().replace(/\.0$/, '')}만원` : `${Math.round(n).toLocaleString('ko-KR')}원`;

const pad = (n: number) => String(n).padStart(2, '0');
export const toISO = (d: Date): ISODate => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = (): ISODate => toISO(new Date());

const parse = (s: ISODate) => new Date(s + 'T00:00:00');
export const daysBetween = (a: ISODate, b: ISODate) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);
export const addDays = (s: ISODate, n: number): ISODate => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
};

export const fmtDate = (s: ISODate) => {
  const d = parse(s);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
};
export const fmtRange = (a: ISODate, b: ISODate) => `${fmtDate(a)} – ${fmtDate(b).slice(5)}`;
export const fmtLongToday = () =>
  new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

export const nightsLabel = (a: ISODate, b: ISODate) => {
  const n = daysBetween(a, b);
  return n <= 0 ? '당일' : `${n}박 ${n + 1}일`;
};

export const dday = (start: ISODate, today = todayISO()) => {
  const n = daysBetween(today, start);
  return n === 0 ? 'D-DAY' : n > 0 ? `D-${n}` : `D+${-n}`;
};

export const STATUS_LABEL: Record<TripStatus, string> = {
  planning: '계획 중',
  booked: '예약 완료',
  ongoing: '여행 중',
  completed: '여행 완료',
  cancelled: '취소됨',
};

export const fmtDuration = (min: number) => `${Math.floor(min / 60)}시간 ${min % 60}분`;
export const fmtDateTime = (s: string) => `${fmtDate(s.slice(0, 10))} ${s.slice(11, 16)}`;

export function errMsg(e: unknown, fallback = '문제가 발생했습니다. 잠시 후 다시 시도해 주세요.') {
  return e instanceof Error && e.message ? e.message : fallback;
}

/** Resize an uploaded image to keep local storage small. */
export function fileToCompressedDataUrl(file: File, maxW = 1200, quality = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('이미지 파일만 업로드할 수 있습니다.'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
    reader.onload = () => {
      const im = new Image();
      im.onerror = () => reject(new Error('이미지를 열 수 없습니다.'));
      im.onload = () => {
        const scale = Math.min(1, maxW / im.width);
        const c = document.createElement('canvas');
        c.width = Math.round(im.width * scale);
        c.height = Math.round(im.height * scale);
        c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      im.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
