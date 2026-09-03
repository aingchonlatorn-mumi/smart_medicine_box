'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, MessageCircle } from 'lucide-react';
import { useSession } from '@/app/components/useSession';

export default function OnboardingSuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-indigo-600" />}>
      <SuccessScreen />
    </Suspense>
  );
}

function SuccessScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const session = useSession();
  const boxSerial = params.get('serial') || '';
  const name = (session?.name || '').replace(/^คุณ\s*/, '');

  useEffect(() => {
    const timer = setTimeout(() => router.replace('/dashboard'), 3000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="min-h-screen bg-indigo-600 text-white flex flex-col items-center justify-center gap-[26px] px-[26px] py-10 text-center">
      <div className="relative w-[132px] h-[132px] flex items-center justify-center">
        <span className="absolute inset-0 rounded-full border-2 border-white/55 animate-ping" />
        <span className="absolute inset-0 rounded-full border-2 border-white/35 animate-ping [animation-delay:.7s]" />
        <div className="w-[104px] h-[104px] rounded-full bg-white flex items-center justify-center animate-[popin_.7s_cubic-bezier(.2,1.3,.4,1)_both]">
          <Check size={56} strokeWidth={2.6} className="text-indigo-600" />
        </div>
      </div>

      <div>
        <div className="text-[30px] leading-[1.3] font-extrabold">เชื่อมต่อสำเร็จ</div>
        <div className="mt-2 text-[17px] leading-relaxed text-indigo-200">
          กล่อง <b className="text-white">{boxSerial}</b> ผูกกับบัญชีของคุณ {name} แล้ว
          <br />
          ระบบจะเตือนคุณทุกมื้อผ่าน LINE
        </div>
      </div>

      <div className="w-full flex items-center gap-3.5 rounded-[20px] border border-white/25 bg-white/15 px-[18px] py-4 text-left">
        <span className="w-[34px] h-[34px] rounded-xl bg-[#06C755] flex items-center justify-center shrink-0">
          <MessageCircle size={19} className="text-white" />
        </span>
        <div>
          <div className="text-[15px] font-semibold">ส่งข้อความต้อนรับใน LINE แล้ว</div>
          <div className="text-[13px] text-indigo-200">Flex Message แบบที่ 1</div>
        </div>
      </div>

      <div className="w-full mt-1.5">
        <div className="mb-2.5 text-[14px] text-indigo-200">กำลังพาไปหน้าหลัก...</div>
        <div className="h-1.5 rounded-full bg-white/25 overflow-hidden">
          <div className="h-1.5 rounded-full bg-white animate-[bargrow_3s_linear_both]" />
        </div>
      </div>
    </div>
  );
}
