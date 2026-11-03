import { Link } from 'react-router-dom';
import { Trip } from '@/types/models';
import { SampleBadge, Tag } from '@/components/ui';
import { dday, fmtRange, nightsLabel, STATUS_LABEL } from '@/lib/format';
import { effectiveStatus } from '@/services/tripService';

export const FALLBACK_COVER = 'linear-gradient(135deg,#E8E0D4,#78836A)';

export function Cover({ trip, className = '' }: { trip: Pick<Trip, 'coverImage'>; className?: string }) {
  return trip.coverImage ? (
    <img src={trip.coverImage} alt="" loading="lazy" className={`img-zoom h-full w-full object-cover ${className}`} />
  ) : (
    <div className="h-full w-full" style={{ background: FALLBACK_COVER }} />
  );
}

export default function TripCard({ trip, variant = 'tall' }: { trip: Trip; variant?: 'tall' | 'wide' }) {
  const status = effectiveStatus(trip);
  const upcoming = status !== 'completed' && status !== 'cancelled';
  return (
    <Link to={`/trips/${trip.id}`} className="group relative block overflow-hidden rounded-xl2 shadow-card transition hover:-translate-y-1 hover:shadow-lift">
      <div className={`relative ${variant === 'tall' ? 'aspect-[5/4] sm:aspect-[4/5]' : 'aspect-[16/9]'}`}>
        <Cover trip={trip} />
        <div className="absolute inset-0 bg-gradient-to-t from-charcoal/80 via-charcoal/10 to-transparent" />
        <div className="absolute left-4 top-4 flex gap-2">
          {trip.isSample && <SampleBadge />}
          <Tag tone={status === 'completed' ? 'beige' : 'olive'}>{STATUS_LABEL[status]}</Tag>
        </div>
        {upcoming && (
          <span className="absolute right-4 top-4 rounded-full bg-paper/90 px-3 py-1 font-serif text-sm text-navy">{dday(trip.startDate)}</span>
        )}
        <div className="absolute inset-x-0 bottom-0 p-5 text-cream">
          <p className="eyebrow !text-cream/70">{trip.country} · {trip.city}</p>
          <h3 className="mt-1 text-2xl leading-snug">{trip.title}</h3>
          <p className="mt-2 text-xs text-cream/80">{fmtRange(trip.startDate, trip.endDate)} · {nightsLabel(trip.startDate, trip.endDate)}</p>
        </div>
      </div>
    </Link>
  );
}
