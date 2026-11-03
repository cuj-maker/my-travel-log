/**
 * Large binaries (photos) live in IndexedDB so the ~5MB localStorage budget stays for data.
 * Rows in the `photos` table reference them by `blobId`.
 */
const DB_NAME = 'my-travel-log-blobs';
const STORE = 'blobs';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('이 브라우저는 사진 저장(IndexedDB)을 지원하지 않아요.'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error('사진 저장소를 열 수 없어요. 사생활 보호 모드라면 일반 창에서 사용해 주세요.'));
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await open();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const r = run(t.objectStore(STORE));
    t.oncomplete = () => { d.close(); resolve(r.result); };
    t.onerror = () => { d.close(); reject(new Error('사진 저장 중 오류가 났어요. 저장 공간을 확인해 주세요.')); };
    t.onabort = () => { d.close(); reject(new Error('저장 공간이 부족해 사진을 저장하지 못했어요.')); };
  });
}

export const putBlob = (id: string, dataUrl: string) => tx('readwrite', (s) => s.put(dataUrl, id));
export const getBlob = (id: string) => tx<string | undefined>('readonly', (s) => s.get(id));
export const deleteBlob = (id: string) => tx('readwrite', (s) => s.delete(id));

const cache = new Map<string, string>();
/** Cached lookup so galleries don't hit IndexedDB for every render. */
export async function blobUrl(id: string): Promise<string | undefined> {
  if (cache.has(id)) return cache.get(id);
  const v = await getBlob(id);
  if (v) cache.set(id, v);
  return v;
}
export const dropCached = (id: string) => cache.delete(id);
export const putBlobCached = async (id: string, dataUrl: string) => { await putBlob(id, dataUrl); cache.set(id, dataUrl); };
export const deleteBlobCached = async (id: string) => { cache.delete(id); await deleteBlob(id); };
