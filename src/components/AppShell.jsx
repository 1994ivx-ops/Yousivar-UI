import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';

export default function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 -z-10 aurora opacity-70" />
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[linear-gradient(180deg,hsl(var(--background)/0.2),hsl(var(--background)/0.92))]" />

      <Sidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />

      <div className="lg:ps-[288px]">
        <TopBar onOpenSidebar={() => setMobileOpen(true)} />
        <main className="px-4 pb-16 pt-2 sm:px-6 lg:px-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}