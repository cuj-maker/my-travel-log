import { Route, Routes } from 'react-router-dom';
import Shell from '@/components/layout/Shell';
import HomePage from '@/pages/HomePage';
import TripsPage from '@/pages/TripsPage';
import TripDetailPage from '@/pages/TripDetailPage';
import FlightHotelPage from '@/pages/FlightHotelPage';
import PlannerPage from '@/pages/PlannerPage';
import BudgetPage from '@/pages/BudgetPage';
import ArchivePage from '@/pages/ArchivePage';
import ArchiveTripPage from '@/pages/ArchiveTripPage';
import ProfilePage from '@/pages/ProfilePage';
import { EmptyState } from '@/components/ui';

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<HomePage />} />
        <Route path="trips" element={<TripsPage />} />
        <Route path="trips/:id" element={<TripDetailPage />} />
        <Route path="flight-hotel" element={<FlightHotelPage />} />
        <Route path="planner" element={<PlannerPage />} />
        <Route path="budget" element={<BudgetPage />} />
        <Route path="archive" element={<ArchivePage />} />
        <Route path="archive/:id" element={<ArchiveTripPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="*" element={<div className="page py-20"><EmptyState title="페이지를 찾을 수 없어요" desc="주소를 확인하거나 상단 메뉴에서 이동해 주세요." /></div>} />
      </Route>
    </Routes>
  );
}
