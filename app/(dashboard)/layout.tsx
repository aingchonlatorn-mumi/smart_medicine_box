'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Activity, Calendar, CheckCircle2, ChevronRight, Clock, LayoutDashboard } from 'lucide-react';
import { useSession } from '@/app/components/useSession';

const NAV = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Schedule', href: '/schedule', icon: Calendar },
  { label: 'Logs', href: '/logs', icon: Clock },
  { label: 'Reports', href: '/reports', icon: Activity },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useSession();

  useEffect(() => {
    // ยังไม่เคยเข้าสู่ระบบบนเครื่องนี้ → กลับไปหน้าแรก
    if (typeof window !== 'undefined' && !localStorage.getItem('user_id')) {
      router.replace('/');
    }
  }, [router]);

  const displayName = (session?.name || '').replace(/^คุณ\s*/, '');
  const initial = displayName.trim().charAt(0) || '•';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* ส่วนหัว — ชื่อผู้ใช้ กดเข้าโปรไฟล์ */}
      <header className="sticky top-0 z-40 bg-white/92 backdrop-blur-md border-b border-slate-100">
        <Link
          href="/profile"
          className="max-w-md mx-auto flex items-center justify-between px-5 py-3.5 active:opacity-70"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-pink-100 border border-pink-200 flex items-center justify-center text-pink-500 text-[18px] font-semibold">
              {initial}
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-[13px] text-slate-500">สวัสดี</span>
              <span className="flex items-center gap-1.5 text-[19px] font-bold text-slate-900">
                คุณ {displayName || '...'}
                <CheckCircle2 size={19} className="fill-indigo-600 text-white" />
              </span>
            </div>
          </div>
          <ChevronRight size={22} className="text-slate-400" />
        </Link>
      </header>

      <main className="flex-1 w-full max-w-md mx-auto px-5 pt-5 pb-32">{children}</main>

      {/* แถบเมนู 4 ปุ่ม */}
      <nav className="fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur-md border-t border-slate-100">
        <div className="max-w-md mx-auto flex justify-between px-[26px] pt-3 pb-[18px]">
          {NAV.map(({ label, href, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center gap-[5px] ${
                  active ? 'text-indigo-600' : 'text-slate-400'
                }`}
              >
                <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
                <span className={`text-[11px] ${active ? 'font-semibold' : 'font-normal'}`}>
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
