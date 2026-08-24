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
      // ตั้งเวลาเพื่อความรวดเร็ว หาก LIFF ไม่ตอบสนองภายใน 3 วินาที ให้ข้ามไปเรียก API เลย
      const sessionPromise = ensureLineSession();
      const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(false), 3000));

      await Promise.race([sessionPromise, timeoutPromise]);

      // ดึงข้อมูลผู้ใช้เพื่อเช็กว่าผูกกล่องยาไว้หรือยัง
      const res = await fetch('/api/me');
      if (res.ok) {
        const data = await res.json();
        
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