// app/page.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { ensureLineSession } from '@/lib/line';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    checkUserAndRedirect();
  }, []);

  const checkUserAndRedirect = async () => {
    try {
      const loggedIn = await ensureLineSession();
      if (!loggedIn) return;

      // ดึงข้อมูลผู้ใช้เพื่อเช็กว่าผูกกล่องยาไว้หรือยัง
      const res = await fetch('/api/me');
      if (res.ok) {
        const data = await res.json();
        
        // ถ้าไม่มีข้อมูลกล่องยา ให้ไปหน้า Onboarding ก่อน
        if (!data.box || !data.box.box_id) {
          router.replace('/onboarding');
        } else {
          router.replace('/dashboard');
        }
      } else {
        router.replace('/onboarding');
      }
    } catch (err) {
      console.error('Redirect check error:', err);
      router.replace('/onboarding');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 font-['Kanit'] text-slate-400">
      <Loader2 size={36} className="animate-spin text-indigo-600 mb-2" />
      <span className="text-xs">กำลังตรวจสอบการเชื่อมต่อ...</span>
    </div>
  );
}