'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Box, Loader2, LogIn } from 'lucide-react';
import BrandHeader from '@/app/components/BrandHeader';
import SerialInput from '@/app/components/SerialInput';
import { ErrorNote, PrimaryButton } from '@/app/components/ui';
import { getSession } from '@/lib/session';
import { ensureLineSession } from '@/lib/line';

export default function HomePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [digits, setDigits] = useState(['', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // เข้าสู่ระบบไว้แล้ว → เข้าหน้าหลักเลย
    if (getSession()) {
      router.replace('/dashboard');
      return;
    }
    // เปิดผ่าน LIFF ให้เตรียม session ไว้ล่วงหน้า (บน localhost จะข้ามให้เอง)
    ensureLineSession().finally(() => setChecking(false));
  }, [router]);

  const verify = async (value?: string) => {
    const serial = value || digits.join('');
    if (serial.length < 3) {
      setError('กรุณากรอกรหัสประจำตัวเครื่องให้ครบ 3 หลัก');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/boxes/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'ตรวจสอบกล่องยาไม่สำเร็จ');
      router.push(`/onboarding?serial=${encodeURIComponent(body.box_serial)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ตรวจสอบกล่องยาไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 size={32} className="animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <BrandHeader action={{ label: 'เข้าสู่ระบบ', href: '/login' }} />

      <main className="flex-1 w-full max-w-md mx-auto flex flex-col gap-[22px] px-[22px] pt-7 pb-6 text-center">
        <div>
          <h1 className="text-[26px] leading-[1.35] font-extrabold text-slate-900">
            เชื่อมต่อกล่องยาของคุณ
          </h1>
          <p className="mt-2 text-[14.5px] leading-relaxed text-slate-500">
            โปรดกรอกรหัสระบุตัวเครื่อง <b className="text-indigo-600">3 หลัก</b> ด้านข้างกล่องยา
          </p>
        </div>

        <div className="mx-auto w-[150px] h-[150px] rounded-[34px] border border-slate-100 bg-slate-50 shadow-[0_6px_18px_rgba(15,23,42,.06)] flex items-center justify-center">
          <Box size={86} strokeWidth={1.3} className="text-indigo-600" />
        </div>

        <div className="flex flex-col gap-[18px] rounded-[26px] border border-slate-100 bg-slate-50 px-[18px] py-[22px]">
          <SerialInput digits={digits} onChange={setDigits} onComplete={verify} autoFocus />
          <PrimaryButton onClick={() => verify()} disabled={loading}>
            {loading && <Loader2 size={20} className="animate-spin" />}
            ถัดไป (ตรวจสอบกล่องยา)
          </PrimaryButton>
        </div>

        {error && <ErrorNote message={error} />}

        <div className="mt-auto flex items-center justify-center gap-2 text-[14.5px] text-slate-500">
          เคยลงทะเบียนไว้แล้ว?
          <Link href="/login" className="flex items-center gap-1.5 font-semibold text-indigo-600">
            <LogIn size={17} /> เข้าสู่ระบบ
          </Link>
        </div>
      </main>
    </div>
  );
}