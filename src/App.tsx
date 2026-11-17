import React, { useRef, useCallback } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { BottomNav } from './components/BottomNav';
import { AccessGate } from './components/AccessGate';
import { Home } from './pages/Home';
import { Attendance } from './pages/Attendance';
import { Timetable } from './pages/Timetable';
import { Admin } from './pages/Admin';
import { Reports } from './pages/Reports';
import { HodAdmin } from './pages/HodAdmin';
import { StudentCheckIn } from './components/StudentCheckIn';

const AppContent: React.FC = () => {
  const { activeTab, verifiedRole } = useApp();
  const mainRef = useRef<HTMLElement | null>(null);
  const isCheckInMode = typeof window !== 'undefined' && window.location.search.includes('checkin=');

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const el = mainRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);
    el.style.setProperty('--spot-x', `${x}px`);
    el.style.setProperty('--spot-y', `${y}px`);
  }, []);

  if (isCheckInMode) {
    return <StudentCheckIn />;
  }

  return (
    <AccessGate>
      <div className="min-h-screen bg-[#f6fafb] dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col selection:bg-teal-500 selection:text-white transition-colors duration-200 overflow-x-clip w-full max-w-full">
        <Header />
        
        <main
          ref={mainRef}
          onPointerMove={handlePointerMove}
          onPointerDown={handlePointerMove}
          className="uenr-main-canvas relative isolate flex-1 w-full overflow-x-clip min-w-0"
        >
          {/* Option 1: Subtle Tech Grid + Cursor-Reactive Spotlight Backdrop */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div className="absolute -top-28 -left-24 w-96 h-96 rounded-full bg-[#007c82]/10 dark:bg-teal-500/10 blur-3xl" />
            <div className="absolute -bottom-24 -right-24 w-[26rem] h-[26rem] rounded-full bg-[#8dc63f]/10 dark:bg-emerald-500/10 blur-3xl" />
            <div className="absolute inset-0 uenr-bg-dots opacity-85" />
            <div className="absolute inset-0 uenr-bg-grid-glow transition-opacity duration-300" />
            <div className="absolute inset-0 uenr-bg-spotlight transition-opacity duration-300" />
          </div>

          <div className="max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 pt-4 sm:pt-8 pb-28 lg:pb-12 min-w-0">
            {activeTab === 'home' && <Home />}
            {activeTab === 'attendance' && <Attendance />}
            {activeTab === 'timetable' && <Timetable />}
            {activeTab === 'admin' && <Admin />}
            {activeTab === 'reports' && <Reports />}
            {activeTab === 'hod_admin' && verifiedRole === 'hod' && <HodAdmin />}
          </div>
        </main>

        <Footer />
        <BottomNav />
      </div>
    </AccessGate>
  );
};

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
