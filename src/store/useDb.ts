import { useSyncExternalStore } from 'react';
import { getVersion, subscribe } from '@/db/database';

/** Re-render the component whenever any table changes. */
export function useDbVersion() {
  return useSyncExternalStore(subscribe, getVersion);
}
