/**
 * MY TRAVEL LOG — domain model.
 * Every travel record hangs off a Trip via `tripId` (see docs/ARCHITECTURE.md).
 * Table names mirror the planned relational schema so the local adapter can
 * later be swapped for SQLite / Supabase without touching the UI.
 */

export type ID = string;
export type ISODate = string; // YYYY-MM-DD (local date)
export type ISODateTime = string; // full ISO timestamp

/** Where a record came from. SAMPLE rows are always badged in the UI. */
export interface BaseRecord {
  id: ID;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  isSample: boolean;
}

/** Origin of any price. Never show 'sample' / 'user' as if it were live. */
export type PriceSource = 'sample' | 'user' | 'api';
export type CurrencyCode = 'KRW' | 'USD' | 'JPY' | 'EUR' | 'TWD' | 'THB' | 'GBP' | 'CNY' | 'VND' | 'HKD';

export const TRAVEL_STYLES = [
  '휴양', '관광', '액티비티', '미식', '쇼핑', '자연', '문화·역사', '감성 여행', '혼자 여행', '커플 여행',
] as const;
export type TravelStyle = (typeof TRAVEL_STYLES)[number];

export const CLIMATES = ['따뜻한', '온화한', '선선한', '추운'] as const;
export type Climate = (typeof CLIMATES)[number];

/* ---------------- users / preferences ---------------- */

export interface User extends BaseRecord {
  name: string;
  homeCountry: string;
  homeCity: string;
  homeAirport: string;
  baseCurrency: CurrencyCode;
}

export interface TravelPreference extends BaseRecord {
  userId: ID;
  styles: TravelStyle[];
  climates: Climate[];
  activities: string[];
  transport: string[];
  budgetPerPersonKRW?: number;
}

/* ---------------- trips ---------------- */

/** Stored status. 'ongoing' is also derived from dates — see services/tripService.ts */
export type TripStatus = 'planning' | 'booked' | 'ongoing' | 'completed' | 'cancelled';

export interface Trip extends BaseRecord {
  title: string;
  country: string;
  countryCode?: string;
  city: string;
  /** Additional cities visited on the same trip */
  cities: string[];
  startDate: ISODate;
  endDate: ISODate;
  travelers: number;
  companions: string[];
  styles: TravelStyle[];
  status: TripStatus;
  coverImage?: string; // remote URL or compressed data URL
  budgetTotalKRW?: number;
  memo?: string;
  destinationId?: ID;
  /** Set when created from an AI/rule recommendation */
  recommendationId?: ID;
  completedAt?: ISODateTime;
  /** Snapshot written when the trip is ended; can be regenerated at any time */
  report?: TripReport;
}

export interface TripReport {
  generatedAt: ISODateTime;
  days: number;
  totalSpendKRW: number;
  perPersonKRW: number;
  budgetKRW?: number;
  plannedKRW: number;
  byCategory: Partial<Record<ExpenseCategory, number>>;
  placesTotal: number;
  placesVisited: number;
  photos: number;
  flights: number;
  hotels: number;
  rating?: number;
  bestPhotoId?: ID;
  highlights: string[];
}

export interface Destination {
  id: ID;
  country: string;
  countryCode: string;
  city: string;
  cityEn: string;
  region: 'East Asia' | 'Southeast Asia' | 'Europe' | 'Oceania' | 'Americas';
  image?: string;
  styles: TravelStyle[];
  climate: Climate;
  bestMonths: number[];
  flightHours: number;
  recommendedNights: [number, number];
  /** SAMPLE estimates in KRW — not live prices */
  est: { flightKRW: number; hotelPerNightKRW: number; dailyLocalKRW: number };
  difficulty: 1 | 2 | 3;
  highlights: string[];
  blurb: string;
  pros: string[];
  cons: string[];
}

/* ---------------- flights / hotels / bookings ---------------- */

export type BookingStatus = 'considering' | 'reserved' | 'paid' | 'cancelled';
/** Payment state prevents double-counting a booking and an expense (Phase 4). */
export type PaymentStatus = 'unpaid' | 'paid' | 'refunded';

export interface Flight extends BaseRecord {
  tripId: ID;
  direction: 'outbound' | 'return' | 'internal';
  airline: string;
  flightNo: string;
  fromAirport: string;
  toAirport: string;
  departAt: string; // local 'YYYY-MM-DDTHH:mm'
  arriveAt: string;
  durationMin: number;
  stops: number;
  layovers?: { airport: string; minutes: number }[];
  priceKRW: number;
  priceSource: PriceSource;
  checkedBaggage?: string;
  cabinBaggage?: string;
  cabinClass: 'economy' | 'premium' | 'business' | 'first';
  refundPolicy?: string;
  bookingRef?: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  /** Price memo trail: every price the user records (sample/user/api) */
  priceHistory?: { at: ISODateTime; priceKRW: number; source: PriceSource }[];
  fileIds?: ID[];
}

export interface Hotel extends BaseRecord {
  tripId: ID;
  name: string;
  address: string;
  lat?: number;
  lng?: number;
  image?: string;
  rating?: number;
  checkIn: ISODate;
  checkOut: ISODate;
  checkInTime?: string;
  checkOutTime?: string;
  pricePerNightKRW: number;
  priceSource: PriceSource;
  breakfast: boolean;
  freeCancel: boolean;
  amenities: string[];
  bookingRef?: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  /** Comparison inputs (minutes / 1-5 score); entered by the user, not live data */
  airportMin?: number;
  transitScore?: number;
  sightsScore?: number;
  fileIds?: ID[];
}

export type BookingKind = 'flight' | 'hotel' | 'restaurant' | 'ticket' | 'show' | 'activity' | 'rentcar' | 'pickup';

export interface Booking extends BaseRecord {
  tripId: ID;
  kind: BookingKind;
  vendor: string;
  title: string;
  bookingRef?: string;
  bookedOn?: ISODate;
  useAt?: string;
  amountKRW?: number;
  paymentStatus: PaymentStatus;
  cancelPolicy?: string;
  fileIds: ID[];
  memo?: string;
}

/* ---------------- itinerary / places / routes ---------------- */

export interface ItineraryDay extends BaseRecord {
  tripId: ID;
  dayIndex: number; // 1-based
  date: ISODate;
  title?: string;
}

export const PLACE_CATEGORIES = ['관광지', '맛집', '카페', '쇼핑', '숙소', '액티비티', '이동', '기타'] as const;
export type PlaceCategory = (typeof PLACE_CATEGORIES)[number];

export interface Place extends BaseRecord {
  tripId: ID;
  itineraryId: ID;
  order: number;
  time?: string; // HH:mm
  name: string;
  category: PlaceCategory;
  address?: string;
  lat?: number;
  lng?: number;
  image?: string;
  purpose?: string;
  stayMin?: number;
  estCostKRW?: number;
  needsReservation?: boolean;
  memo?: string;
  visited?: boolean;
  /** Auto-generated by a flight/hotel; kept in sync when that record changes */
  /** Opening hours / closed weekdays (0=Sun) for the optimizer's warnings */
  openTime?: string;
  closeTime?: string;
  closedDays?: number[];
  indoor?: boolean;
  linkedType?: 'flight' | 'hotel-in' | 'hotel-out';
  linkedId?: ID;
}

export type TransportMode = 'walk' | 'subway' | 'bus' | 'taxi' | 'rentcar' | 'train';

export interface Route extends BaseRecord {
  tripId: ID;
  fromPlaceId: ID;
  toPlaceId: ID;
  mode: TransportMode;
  distanceKm?: number;
  durationMin?: number;
  transfers?: number;
  estCostKRW?: number;
  /** 'estimate' until a routing API is connected */
  source: 'estimate' | 'user' | 'api';
  /** Which routing service produced 'api' values */
  provider?: 'google' | 'osm';
}

/* ---------------- expenses ---------------- */

export const EXPENSE_CATEGORIES = ['항공', '숙박', '교통', '식비', '쇼핑', '관광·액티비티', '기타'] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export interface Expense extends BaseRecord {
  tripId: ID;
  placeId?: ID;
  bookingId?: ID;
  date: ISODate;
  vendor: string;
  category: ExpenseCategory;
  amount: number;
  currency: CurrencyCode;
  fxRate: number; // KRW per 1 unit, at time of entry
  amountKRW: number;
  method?: '카드' | '현금' | '간편결제' | '기타';
  paidBy?: string;
  receiptFileId?: ID;
  memo?: string;
  /** Shared costs are split among `participants` (default: everyone); personal ones are not settled. */
  shared?: boolean;
  participants?: string[];
}

export interface TripBudget extends BaseRecord {
  tripId: ID;
  totalKRW: number;
  byCategory: Partial<Record<ExpenseCategory, number>>;
  /** User-entered KRW-per-unit rates for this trip (overrides the sample rates) */
  fx?: Partial<Record<CurrencyCode, number>>;
}

/* ---------------- archive ---------------- */

export interface Photo extends BaseRecord {
  tripId: ID;
  placeId?: ID;
  src: string;
  caption?: string;
  takenAt?: ISODateTime;
  isCover?: boolean;
  /** Photos you upload are kept in IndexedDB (see db/blobStore.ts); `src` is only for remote/sample images */
  blobId?: ID;
  /** GPS position read from EXIF, when present */
  lat?: number;
  lng?: number;
}

export interface Review extends BaseRecord {
  tripId: ID;
  targetType: 'trip' | 'place' | 'hotel' | 'restaurant';
  targetId?: ID;
  rating: number; // 1–5
  text: string;
  revisit?: string[];
  regrets?: string;
}

export interface ChecklistItem extends BaseRecord {
  tripId: ID;
  label: string;
  group: string;
  done: boolean;
}

export interface AiRecommendation extends BaseRecord {
  destinationId: ID;
  engine: 'rules' | 'llm';
  score: number;
  reasons: string[];
  convertedTripId?: ID;
}

/** Stored file blobs (cover uploads, receipts, confirmations). */
export interface StoredFile extends BaseRecord {
  tripId?: ID;
  name: string;
  mime: string;
  size: number;
  dataUrl: string;
}

/* ---------------- database snapshot ---------------- */

export interface Tables {
  users: User;
  travel_preferences: TravelPreference;
  trips: Trip;
  flights: Flight;
  hotels: Hotel;
  bookings: Booking;
  itineraries: ItineraryDay;
  places: Place;
  routes: Route;
  expenses: Expense;
  budgets: TripBudget;
  photos: Photo;
  reviews: Review;
  checklists: ChecklistItem;
  ai_recommendations: AiRecommendation;
  files: StoredFile;
}

export type TableName = keyof Tables;

export const TABLE_NAMES: TableName[] = [
  'users', 'travel_preferences', 'trips', 'flights', 'hotels', 'bookings', 'itineraries', 'places',
  'routes', 'expenses', 'budgets', 'photos', 'reviews', 'checklists', 'ai_recommendations', 'files',
];

/** Tables whose rows belong to a trip and cascade on trip delete. */
export const TRIP_SCOPED: TableName[] = [
  'flights', 'hotels', 'bookings', 'itineraries', 'places', 'routes', 'expenses', 'budgets',
  'photos', 'reviews', 'checklists', 'files',
];

export type DatabaseSnapshot = {
  schemaVersion: number;
  meta: { seededAt?: ISODateTime; lastSavedAt?: ISODateTime };
} & { [K in TableName]: Tables[K][] };
