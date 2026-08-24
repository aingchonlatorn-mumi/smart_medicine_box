'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Calendar, Clock, LayoutDashboard, Activity, CheckCircle2, User, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [userName, setUserName] = useState<string>('Mumi');

  useEffect(() => {
    async function loadUserData() {
      try {
        const { data } = await supabase.from('users').select('name').limit(1).single();
        if (data?.name) {
          setUserName(data.name);
        }
      } catch (err) {
        console.log('User fetch bypass');
      }
    }
    loadUserData();
  }, []);

  const navItems = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Schedule', href: '/schedule', icon: Calendar },
    { label: 'Logs', href: '/logs', icon: Clock },
    { label: 'Reports', href: '/reports', icon: Activity },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between font-['Kanit']">
      
      {/* 1. TOP HEADER - เพิ่ม Link ไปยังหน้า /profile */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-100 px-5 py-3.5 shadow-sm">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <Link 
            href="/profile" 
            className="flex items-center gap-3 group hover:opacity-80 transition-opacity"
          >
            <div className="w-11 h-11 rounded-full bg-pink-100 border border-pink-200 flex items-center justify-center shrink-0 text-pink-500 font-bold overflow-hidden shadow-sm">
              <User size={22} />
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-slate-500 font-normal leading-tight">
                สวัสดี
              </span>
              <div className="flex items-center gap-1.5">
              <h1 className="font-bold text-lg text-slate-900 leading-tight">
  {userName.startsWith('คุณ') ? userName : `คุณ ${userName}`}
</h1>
                <CheckCircle2 size={18} className="text-indigo-600 fill-indigo-600 stroke-white shrink-0" />
              </div>
            </div>
          </Link>

          <Link href="/profile" className="text-slate-400 group-hover:text-slate-600">
            <ChevronRight size={20} />
          </Link>
        </div>
      </header>

      {/* 2. PAGE CONTENT */}
      <main className="flex-1 max-w-md w-full mx-auto pb-24 p-5">
        {children}
      </main>

      {/* 3. BOTTOM NAVIGATION */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md border-t border-slate-100 py-2 px-4 shadow-lg z-50">
        <div className="max-w-md mx-auto flex justify-between items-center">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-1 transition-colors ${
                  isActive ? 'text-indigo-600 font-bold' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <Icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
                <span className="text-[10px]">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

    </div>
  );
}