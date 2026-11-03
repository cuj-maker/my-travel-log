import * as db from '@/db/database';
import { Trip, TripStatus } from '@/types/models';
import { addDays, daysBetween, todayISO } from '@/lib/format';
import { tripActualKRW } from './budgetService';
import { deleteTripBlobs } from './archiveService';

/** Stored status, upgraded to 'ongoing' while today falls inside the trip dates. */
export function effectiveStatus(t: Trip, today = todayISO()): TripStatus {
  if (t.status === 'completed' || t.status === 'cancelled') return t.status;
  if (today >= t.startDate && today <= t.endDate) return 'ongoing';
  return t.status;
}

export const listTrips = () => [...db.all('trips')].sort((a, b) => b.startDate.localeCompare(a.startDate));
export const getTrip = (id: string) => db.get('trips', id);

export function upcomingTrips(today = todayISO()) {
  return listTrips()
    .filter((t) => {
      const s = effectiveStatus(t, today);
      return s !== 'completed' && s !== 'cancelled' && t.endDate >= today;
    })
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}
export const completedTrips = () => listTrips().filter((t) => t.status === 'completed');

export function createTrip(data: Omit<Trip, 'id' | 'createdAt' | 'updatedAt' | 'isSample'>) {
  const trip = db.insert('trips', data);
  // One empty itinerary day per travel date so planner/archive are ready.
  const n = daysBetween(trip.startDate, trip.endDate) + 1;
  for (let i = 0; i < n; i++) {
    db.insert('itineraries', { tripId: trip.id, dayIndex: i + 1, date: addDays(trip.startDate, i) });
  }
  return trip;
}

/** Update a trip; when dates change, keep itinerary days in step (never deleting days that hold places). */
export function updateTrip(id: string, patch: Partial<Trip>) {
  const before = db.get('trips', id);
  const after = db.update('trips', id, patch);
  if (before && after && (before.startDate !== after.startDate || before.endDate !== after.endDate)) {
    const n = daysBetween(after.startDate, after.endDate) + 1;
    const days = db.byTrip('itineraries', id).sort((a, b) => a.dayIndex - b.dayIndex);
    for (let i = 0; i < n; i++) {
      const date = addDays(after.startDate, i);
      if (days[i]) db.update('itineraries', days[i].id, { dayIndex: i + 1, date });
      else db.insert('itineraries', { tripId: id, dayIndex: i + 1, date });
    }
    // Extra days are removed only when empty.
    days.slice(n).forEach((d) => {
      if (!db.byTrip('places', id).some((p) => p.itineraryId === d.id)) db.remove('itineraries', d.id);
    });
  }
  return after;
}

export function deleteTrip(id: string) {
  void deleteTripBlobs(id); // photo files live in IndexedDB
  db.removeTripCascade(id);
}

/* ---------- derived trip numbers ---------- */

/** Actual spend: expenses plus paid bookings that have no linked expense (never double counted). */
export const tripSpentKRW = (tripId: string) => tripActualKRW(tripId);

export function tripStats() {
  const done = completedTrips();
  const all = db.all('trips').filter((t) => t.status !== 'cancelled');
  const countries = new Set(done.map((t) => t.country));
  const cities = new Set(done.flatMap((t) => (t.cities.length ? t.cities : [t.city])));
  const days = done.reduce((s, t) => s + daysBetween(t.startDate, t.endDate) + 1, 0);
  const spent = done.reduce((s, t) => s + tripSpentKRW(t.id), 0);
  return { totalTrips: all.length, completed: done.length, countries: countries.size, cities: cities.size, days, spent };
}
