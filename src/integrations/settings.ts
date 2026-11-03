/**
 * API settings. Two ways to provide them:
 *  1. Build time (recommended): GitHub repo → Settings → Secrets and variables → Actions
 *       secret   GOOGLE_MAPS_API_KEY  → VITE_GOOGLE_MAPS_API_KEY
 *       variable FLIGHT_PROXY_URL     → VITE_FLIGHT_PROXY_URL
 *     Every device (PC, iPhone home-screen app) then gets them automatically.
 *  2. In the app: MY PROFILE → API 설정 (saved in this browser only; overrides build values).
 */
import { useSyncExternalStore } from 'react';

export interface ApiSettings { googleMapsKey: string; flightProxyUrl: string }

const KEY = 'my-travel-log:api-settings:v1';
const env = {
  googleMapsKey: (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ?? '',
  flightProxyUrl: (import.meta.env.VITE_FLIGHT_PROXY_URL as string | undefined) ?? '',
};

const readLocal = (): Partial<ApiSettings> => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
let local = readLocal();
let snapshot: ApiSettings = compute();
const listeners = new Set<() => void>();

function compute(): ApiSettings {
  return {
    googleMapsKey: (local.googleMapsKey || env.googleMapsKey || '').trim(),
    flightProxyUrl: (local.flightProxyUrl || env.flightProxyUrl || '').trim().replace(/\/+$/, ''),
  };
}

export const apiSettings = () => snapshot;
export const buildDefaults = () => env;
export const localOverrides = () => local;

export function saveApiSettings(patch: Partial<ApiSettings>) {
  local = { ...local, ...patch };
  (Object.keys(local) as (keyof ApiSettings)[]).forEach((k) => { if (!local[k]) delete local[k]; });
  try { localStorage.setItem(KEY, JSON.stringify(local)); } catch { /* ignore */ }
  snapshot = compute();
  listeners.forEach((l) => l());
}

export function useApiSettings() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => snapshot);
}
