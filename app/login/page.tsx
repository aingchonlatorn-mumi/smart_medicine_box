'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Phone } from 'lucide-react';
import BrandHeader from '@/app/components/BrandHeader';
import SerialInput from '@/app/components/SerialInput';
import { ErrorNote, PrimaryButton } from '@/app/components/ui';
import { saveSession } from '@/lib/session';
import { getLiffProfile } from '@/lib/line';
import { formatPhone } from '@/lib/time';

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [digits, setDigits] = useState(['', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (useLine = false) => {
    setError('');

    if (phone.length !== 10) {
      setError('กรุณากรอกเบอร์โทรศัพท์ 10 หลัก');
      return;
    }
    if (digits.join('').length < 3) {
      setError('กรุณากรอกซีเรียลกล่องยา 3 หลัก');
      return;
    }

    setLoading(true);
    try {
      const profile = useLine ? await getLiffProfile() : null;
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          serial: digits.join(''),
          line_user_id: profile?.userId || '',
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'เข้าสู่ระบบไม่สำเร็จ');

      saveSession({
        userId: body.user_id,
        name: body.name,
        boxSerial: body.box_serial,
        lineUserId: profile?.userId,
      });
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <BrandHeader />

      <main className="flex-1 w-full max-w-md mx-auto flex flex-col gap-[22px] px-[22px] pt-8 pb-6">
        <div>
          <h1 className="text-[26px] leading-[1.35] font-extrabold text-slate-900">เข้าสู่ระบบ</h1>
          <p className="mt-2 text-[14.5px] text-slate-500">สำหรับผู้ที่ลงทะเบียนกล่องยาไว้แล้ว</p>
        </div>

        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-[13.5px] font-semibold text-slate-700">เบอร์โทรศัพท์</span>
            <div
              className={`h-[60px] rounded-[20px] bg-white flex items-center gap-3 px-[18px] transition ${
                phone ? 'border-2 border-indigo-600 ring-4 ring-indigo-50' : 'border-2 border-slate-200'
              }`}
            >
              <Phone size={22} className="text-indigo-600 shrink-0" strokeWidth={1.9} />
              <input
                value={formatPhone(phone) === '-' ? phone : phone.length === 10 ? formatPhone(phone) : phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                inputMode="numeric"
                placeholder="081-555-0192"
                className="w-full bg-transparent text-[20px] font-semibold tracking-wide text-slate-900 outline-none"
              />
            </div>
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-[13.5px] font-semibold text-slate-700">ซีเรียลกล่องยา</span>
            <div className="flex justify-start">
              <SerialInput digits={digits} onChange={setDigits} />
            </div>
          </div>

          {error && <ErrorNote message={error} />}

          <PrimaryButton onClick={() => submit(false)} disabled={loading}>
            {loading && <Loader2 size={20} className="animate-spin" />}
            เข้าสู่ระบบ
          </PrimaryButton>

          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-slate-100" />
            <span className="text-[12.5px] text-slate-400">หรือ</span>
            <span className="h-px flex-1 bg-slate-100" />
          </div>

          <button
            type="button"
            onClick={() => submit(true)}
            disabled={loading}
            className="h-[60px] rounded-[20px] border border-slate-200 bg-white text-[17px] font-semibold text-slate-700
              flex items-center justify-center gap-2.5 transition active:scale-[.98] disabled:opacity-60"
          >
            <span className="w-6 h-6 rounded-[7px] bg-[#06C755]" />
            เข้าสู่ระบบด้วย LINE
          </button>
        </div>

        <div className="mt-auto text-center text-[14.5px] text-slate-500">
          ยังไม่มีบัญชี?{' '}
          <Link href="/" className="font-semibold text-indigo-600">
            เชื่อมต่อกล่องยาใหม่
          </Link>
        </div>
      </main>
    </div>
  );
}
