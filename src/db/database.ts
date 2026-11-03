/**
 * Local persistence adapter (localStorage). The rest of the app only talks to
 * this module's API, so it can be replaced by SQLite/Supabase later.
 */
import { DatabaseSnapshot, TABLE_NAMES, TRIP_SCOPED, TableName, Tables } from '@/types/models';
import { getBlob, putBlobCached } from './blobStore';

const KEY = 'my-travel-log:db:v1';
export const SCHEMA_VERSION = 1;

type Listener = () => void;
const listeners = new Set<Listener>();
let snapshot: DatabaseSnapshot | null = null;
let version = 0;
export let lastSaveError: string | null = null;

export function emptySnapshot(): DatabaseSnapshot {
  const s: any = { schemaVersion: SCHEMA_VERSION, meta: {} };
  TABLE_NAMES.forEach((t) => (s[t] = []));
  return s as DatabaseSnapshot;
}

export const uid = () =>
  (crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));
const now = () => new Date().toISOString();

function normalize(raw: any): DatabaseSnapshot {
  const s = emptySnapshot();
  if (raw && typeof raw === 'object') {
    TABLE_NAMES.forEach((t) => { if (Array.isArray(raw[t])) (s as any)[t] = raw[t]; });
    s.meta = raw.meta ?? {};
  }
  return s;
}

export function load(): DatabaseSnapshot {
  if (snapshot) return snapshot;
  try {
    const txt = localStorage.getItem(KEY);
    snapshot = txt ? normalize(JSON.parse(txt)) : emptySnapshot();
  } catch {
    snapshot = emptySnapshot();
  }
  return snapshot;
}

function persist() {
  try {
    snapshot!.meta.lastSavedAt = now();
    localStorage.setItem(KEY, JSON.stringify(snapshot));
    lastSaveError = null;
  } catch (e) {
    lastSaveError = '브라우저 저장 공간이 부족합니다. 큰 사진을 줄이거나 백업 후 정리해 주세요.';
  }
}

function commit() {
  version++;
  persist();
  listeners.forEach((l) => l());
}

/** Re-render subscribers without writing anything (e.g. live API data arrived). */
export function notify() { version++; listeners.forEach((l) => l()); }

export const subscribe = (l: Listener) => { listeners.add(l); return () => listeners.delete(l); };
export const getVersion = () => version;

/* ---------- generic CRUD ---------- */

export function all<T extends TableName>(t: T): Tables[T][] { return load()[t] as Tables[T][]; }
export function get<T extends TableName>(t: T, id: string): Tables[T] | undefined {
  return all(t).find((r: any) => r.id === id);
}
export function where<T extends TableName>(t: T, pred: (r: Tables[T]) => boolean): Tables[T][] {
  return all(t).filter(pred);
}
export function byTrip<T extends TableName>(t: T, tripId: string): Tables[T][] {
  return all(t).filter((r: any) => r.tripId === tripId);
}

export function insert<T extends TableName>(
  t: T,
  data: Omit<Tables[T], 'id' | 'createdAt' | 'updatedAt' | 'isSample'> & { isSample?: boolean; id?: string },
): Tables[T] {
  const row = { isSample: false, ...data, id: (data as any).id ?? uid(), createdAt: now(), updatedAt: now() } as any;
  (load()[t] as any[]).push(row);
  commit();
  return row;
}

export function update<T extends TableName>(t: T, id: string, patch: Partial<Tables[T]>): Tables[T] | undefined {
  const rows = load()[t] as any[];
  const i = rows.findIndex((r) => r.id === id);
  if (i < 0) return undefined;
  rows[i] = { ...rows[i], ...patch, id, updatedAt: now() };
  commit();
  return rows[i];
}

export function remove(t: TableName, id: string) {
  const s = load();
  (s as any)[t] = (s[t] as any[]).filter((r) => r.id !== id);
  commit();
}

/** Delete a trip and everything attached to it (user-initiated only). */
export function removeTripCascade(tripId: string) {
  const s = load();
  s.trips = s.trips.filter((t) => t.id !== tripId);
  TRIP_SCOPED.forEach((t) => ((s as any)[t] = (s[t] as any[]).filter((r) => r.tripId !== tripId)));
  commit();
}

export function replaceAll(next: DatabaseSnapshot) { snapshot = normalize(next); commit(); }
export function bulkInsert(next: DatabaseSnapshot) { snapshot = normalize(next); commit(); }

export function isEmpty() { return load().trips.length === 0 && load().meta.seededAt === undefined; }

/* ---------- backup / restore ---------- */

/** Backup file = tables + photo files (photos live in IndexedDB, so they are embedded here). */
export async function exportJson(): Promise<string> {
  const blobs: Record<string, string> = {};
  for (const p of load().photos) {
    if (!p.blobId) continue;
    const v = await getBlob(p.blobId).catch(() => undefined);
    if (v) blobs[p.blobId] = v;
  }
  return JSON.stringify({ app: 'my-travel-log', exportedAt: now(), data: load(), blobs }, null, 2);
}

export async function importJson(text: string) {
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { throw new Error('올바른 JSON 백업 파일이 아닙니다.'); }
  if (parsed?.app !== 'my-travel-log' || !parsed.data) throw new Error('MY TRAVEL LOG 백업 파일이 아닙니다.');
  // restore photo files first so the restored rows never point at missing images
  const blobs: Record<string, string> = parsed.blobs ?? {};
  for (const [id, data] of Object.entries(blobs)) await putBlobCached(id, data);
  replaceAll(parsed.data);
}
