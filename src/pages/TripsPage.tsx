import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button, EmptyState, PageHeader } from '@/components/ui';
import TripCard from '@/components/trip/TripCard';
import TripFormModal from '@/components/trip/TripFormModal';
import { useDbVersion } from '@/store/useDb';
import { effectiveStatus, listTrips } from '@/services/tripService';

const FILTERS = [['all', '전체'], ['upcoming', '예정'], ['completed', '완료']] as const;

export default function TripsPage() {
  useDbVersion();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<(typeof FILTERS)[number][0]>('all');
  const trips = listTrips().filter((t) => {
    const s = effectiveStatus(t);
    return f === 'all' ? true : f === 'completed' ? s === 'completed' : s !== 'completed' && s !== 'cancelled';
  });

  return (
    <>
      <PageHeader eyebrow="My Trips" title="모든 여행" desc="모든 항공·숙소·일정·경비·사진은 여행 하나(Trip ID)에 연결됩니다."
        action={<Button onClick={() => setOpen(true)}><Plus size={16} /> 새 여행</Button>} />
      <section className="page">
        <div className="mb-6 flex gap-2">
          {FILTERS.map(([k, l]) => (
            <button key={k} onClick={() => setF(k)} className={`chip ${f === k ? 'border-navy bg-navy text-cream' : 'border-beige-dark text-charcoal-soft hover:bg-beige/50'}`}>{l}</button>
          ))}
        </div>
        {trips.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{trips.map((t) => <TripCard key={t.id} trip={t} />)}</div>
        ) : (
          <EmptyState title="여행이 없어요" desc="첫 여행을 만들어 기록을 시작해 보세요." action={<Button onClick={() => setOpen(true)}>여행 만들기</Button>} />
        )}
      </section>
      <TripFormModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
