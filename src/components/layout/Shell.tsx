import { NavLink, Outlet, useLocation, Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Home, Plane, Map, Wallet, BookImage, User, LayoutGrid, Luggage, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Toaster } from '@/components/ui';

export const NAV = [
  { to: '/', label: 'HOME', short: 'Home', icon: Home, end: true },
  { to: '/flight-hotel', label: 'FLIGHT & HOTEL', short: 'Stay', icon: Plane },
  { to: '/planner', label: 'TRAVEL PLANNER', short: 'Plan', icon: Map },
  { to: '/budget', label: 'TRAVEL BUDGET', short: 'Budget', icon: Wallet },
  { to: '/archive', label: 'MY TRAVEL ARCHIVE', short: 'Archive', icon: BookImage },
  { to: '/profile', label: 'MY PROFILE', short: 'Me', icon: User },
];

/* ---------- Mobile app navigation ---------- */
// Bottom tab bar: the four screens used most while travelling + "더보기".
const TABS = [
  { to: '/', label: '홈', icon: Home, end: true },
  { to: '/planner', label: '일정', icon: Map },
  { to: '/budget', label: '경비', icon: Wallet },
  { to: '/archive', label: '기록', icon: BookImage },
];
// Everything else lives in the "더보기" sheet.
const MORE = [
  { to: '/flight-hotel', label: '항공 · 숙소 · 예약', desc: '항공권·호텔 등록과 비교, 확인서', icon: Plane },
  { to: '/trips', label: '모든 여행', desc: '여행 목록 · 만들기 · 수정', icon: Luggage },
  { to: '/profile', label: '프로필 · 데이터', desc: '백업 · 복원 · 샘플 데이터', icon: User },
];
const MORE_PATHS = ['/flight-hotel', '/trips', '/profile'];

/** Title shown in the compact mobile top bar. */
function mobileTitle(pathname: string) {
  if (pathname === '/') return null;
  if (pathname.startsWith('/trips/')) return '여행 상세';
  if (pathname.startsWith('/archive/')) return '여행 기록';
  const map: Record<string, string> = {
    '/trips': '모든 여행', '/flight-hotel': '항공 · 숙소', '/planner': '여행 일정',
    '/budget': '여행 경비', '/archive': '여행 기록', '/profile': '프로필',
  };
  return map[pathname] ?? 'MY TRAVEL LOG';
}
const isRoot = (p: string) => ['/', '/planner', '/budget', '/archive', ...MORE_PATHS].includes(p);

export default function Shell() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [more, setMore] = useState(false);
  useEffect(() => { window.scrollTo({ top: 0 }); setMore(false); }, [pathname]);

  const title = mobileTitle(pathname);
  const moreActive = MORE_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));

  return (
    <div className="min-h-screen">
      {/* Desktop header */}
      <header className="sticky top-0 z-40 hidden border-b border-beige/70 bg-paper/85 backdrop-blur lg:block">
        <div className="page flex h-16 items-center justify-between gap-6">
          <Link to="/" className="flex shrink-0 items-baseline gap-2">
            <span className="font-serif text-xl tracking-wide">MY TRAVEL LOG</span>
          </Link>
          <nav className="flex items-center gap-6" aria-label="주 메뉴">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}
                className={({ isActive }) => `relative py-5 text-[11px] font-medium tracking-[0.14em] transition ${isActive ? 'text-navy' : 'text-charcoal-mute hover:text-charcoal'}`}>
                {({ isActive }) => (<>{n.label}<span className={`absolute inset-x-0 bottom-3 h-px bg-olive transition-transform ${isActive ? 'scale-x-100' : 'scale-x-0'}`} /></>)}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      {/* Mobile top bar (respects the iPhone notch / status bar) */}
      <header className="sticky top-0 z-40 border-b border-beige/70 bg-paper/90 pt-[env(safe-area-inset-top)] backdrop-blur-md lg:hidden">
        <div className="relative flex h-12 items-center justify-center px-12">
          {!isRoot(pathname) && (
            <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} aria-label="뒤로"
              className="absolute left-1.5 top-1/2 -translate-y-1/2 rounded-full p-2 text-charcoal active:bg-beige/60">
              <ChevronLeft size={22} strokeWidth={1.7} />
            </button>
          )}
          {title
            ? <p className="truncate text-[15px] font-semibold text-charcoal">{title}</p>
            : <span className="font-serif text-lg tracking-wide">MY TRAVEL LOG</span>}
          <Link to="/profile" aria-label="프로필" className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-2 text-charcoal-soft active:bg-beige/60">
            <User size={19} strokeWidth={1.6} />
          </Link>
        </div>
      </header>

      <main className="pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-20"><Outlet /></main>

      <footer className="hidden border-t border-beige/70 py-8 text-center lg:block">
        <p className="font-serif italic text-charcoal-soft">Your Journey, Your Story, Your Archive.</p>
      </footer>

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-[46] border-t border-beige bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden" aria-label="모바일 메뉴">
        <div className="grid grid-cols-5">
          {TABS.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => `flex flex-col items-center gap-0.5 pb-1.5 pt-2 text-[10.5px] font-medium ${isActive && !more ? 'text-navy' : 'text-charcoal-mute'}`}>
              {({ isActive }) => (<><n.icon size={22} strokeWidth={isActive && !more ? 2 : 1.6} />{n.label}</>)}
            </NavLink>
          ))}
          <button onClick={() => setMore((v) => !v)} aria-expanded={more}
            className={`flex flex-col items-center gap-0.5 pb-1.5 pt-2 text-[10.5px] font-medium ${more || moreActive ? 'text-navy' : 'text-charcoal-mute'}`}>
            <LayoutGrid size={22} strokeWidth={more || moreActive ? 2 : 1.6} />더보기
          </button>
        </div>
      </nav>

      {/* "더보기" sheet */}
      {more && (
        <div className="fixed inset-0 z-[45] bg-charcoal/30 backdrop-blur-[2px] animate-fade lg:hidden" onClick={() => setMore(false)}>
          <div onClick={(e) => e.stopPropagation()}
            className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-paper px-4 pb-[calc(5.25rem+env(safe-area-inset-bottom))] pt-3 shadow-lift animate-rise">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-beige-dark" />
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="font-serif text-xl">메뉴</p>
              <button onClick={() => setMore(false)} aria-label="닫기" className="rounded-full p-2 text-charcoal-soft active:bg-beige/60"><X size={18} /></button>
            </div>
            <ul className="overflow-hidden rounded-2xl border border-beige bg-white/70">
              {MORE.map((m) => (
                <li key={m.to} className="border-b border-beige/70 last:border-0">
                  <NavLink to={m.to} className={({ isActive }) => `flex items-center gap-3 px-4 py-3.5 active:bg-beige/40 ${isActive ? 'bg-olive-light/50' : ''}`}>
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-navy-light text-navy"><m.icon size={19} strokeWidth={1.7} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium">{m.label}</span>
                      <span className="block truncate text-xs text-charcoal-mute">{m.desc}</span>
                    </span>
                    <ChevronRight size={18} className="text-charcoal-mute" />
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <Toaster />
    </div>
  );
}
