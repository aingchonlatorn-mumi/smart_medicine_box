'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Calendar, Check, CheckCircle2, ChevronLeft, Loader2 } from 'lucide-react';
import { ErrorNote, PrimaryButton } from '@/app/components/ui';
import { getLiffProfile } from '@/lib/line';
import { saveSession } from '@/lib/session';
import { formatPhone } from '@/lib/time';

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <OnboardingForm />
    </Suspense>
  );
}

function OnboardingForm() {
  const router = useRouter();
  const params = useSearchParams();
  const boxSerial = params.get('serial') || '';

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [lineUserId, setLineUserId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!boxSerial) router.replace('/');
  }, [boxSerial, router]);

  useEffect(() => {
    // เปิดผ่าน LIFF → เติมชื่อจากโปรไฟล์ LINE ให้อัตโนมัติ
    getLiffProfile().then((profile) => {
      if (!profile) return;
      setLineUserId(profile.userId);
      setName((current) => current || profile.displayName);
    });
  }, []);

  const phoneValid = phone.length === 10;

  const submit = async () => {
    setError('');
    if (!name.trim()) return setError('กรุณากรอกชื่อ-นามสกุล');
    if (!phoneValid) return setError('เบอร์โทรศัพท์ต้องมี 10 หลัก');
    if (!agreed) return setError('กรุณายอมรับเงื่อนไขการใช้งาน');

    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone,
          birth_date: birthDate || null,
          box_serial: boxSerial,
          line_user_id: lineUserId,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'ลงทะเบียนไม่สำเร็จ');

      saveSession({
        userId: body.user_id,
        name: body.name,
        boxSerial: body.box_serial,
        lineUserId: lineUserId || undefined,
      });
      router.replace(`/onboarding/success?serial=${encodeURIComponent(body.box_serial)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ลงทะเบียนไม่สำเร็จ');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <main className="flex-1 w-full max-w-md mx-auto flex flex-col gap-5 p-[22px]">
        <div className="flex items-center gap-2.5">
          <Link
            href="/"
            className="w-9 h-9 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-slate-700"
          >
            <ChevronLeft size={20} />
          </Link>
          <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-[13px] font-semibold text-indigo-600">
            ขั้นที่ 2 · ลงทะเบียนผู้ใช้
          </span>
        </div>

        <div>
          <h1 className="text-[25px] leading-[1.3] font-bold text-slate-900">
            ลงทะเบียนข้อมูลส่วนตัว
          </h1>
          <p className="mt-1.5 text-[14.5px] leading-relaxed text-slate-500">
            ผูกบัญชีเข้ากับกล่อง <b className="text-indigo-600">{boxSerial}</b> และรับแจ้งเตือนผ่าน LINE
          </p>
        </div>

        <div className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-[7px]">
            <span className="text-[13.5px] font-semibold text-slate-700">ชื่อ-นามสกุล</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="เช่น มะลิ ทิ้งใจ"
              className="h-14 rounded-[20px] border border-slate-200 bg-white px-[18px] text-[17px] font-medium text-slate-900 outline-none focus:border-indigo-500"
            />
          </label>

          <label className="flex flex-col gap-[7px]">
            <div className="flex items-center justify-between">
              <span className="text-[13.5px] font-semibold text-slate-700">เบอร์โทรศัพท์</span>
              <span
                className={`flex items-center gap-1.5 text-[12px] font-semibold ${
                  phoneValid ? 'text-emerald-600' : 'text-slate-400'
                }`}
              >
                <CheckCircle2 size={14} />
                {phone.length}/10 ตัว
              </span>
            </div>
            <input
              value={phone.length === 10 ? formatPhone(phone) : phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              inputMode="numeric"
              placeholder="081-555-0192"
              className={`h-14 rounded-[20px] bg-white px-[18px] text-[17px] font-medium text-slate-900 outline-none transition ${
                phoneValid ? 'border border-emerald-500 ring-4 ring-emerald-50' : 'border border-slate-200'
              }`}
            />
          </label>

          <label className="flex flex-col gap-[7px]">
            <span className="text-[13.5px] font-semibold text-slate-700">วัน/เดือน/ปีเกิด</span>
            <div className="h-14 rounded-[20px] border border-slate-200 bg-white flex items-center justify-between px-[18px]">
              <input
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="w-full bg-transparent text-[17px] font-medium text-slate-900 outline-none"
              />
              <Calendar size={20} className="text-slate-400 shrink-0" />
            </div>
          </label>

          <button
            type="button"
            onClick={() => setAgreed((v) => !v)}
            className="flex items-start gap-3 pt-0.5 text-left"
          >
            <span
              className={`mt-0.5 w-[22px] h-[22px] rounded-[7px] flex items-center justify-center shrink-0 transition ${
                agreed ? 'bg-indigo-600' : 'border-2 border-slate-300 bg-white'
              }`}
            >
              {agreed && <Check size={14} strokeWidth={3} className="text-white" />}
            </span>
            <span className="text-[13.5px] leading-relaxed text-slate-500">
              ฉันยอมรับ <span className="font-semibold text-indigo-600">เงื่อนไขการใช้งาน</span> และ{' '}
              <span className="font-semibold text-indigo-600">นโยบายความเป็นส่วนตัว</span>
            </span>
          </button>
        </div>

        {error && <ErrorNote message={error} />}

        <div className="mt-auto pt-4">
          <PrimaryButton onClick={submit} disabled={loading}>
            {loading && <Loader2 size={20} className="animate-spin" />}
            ยืนยันการลงทะเบียน
          </PrimaryButton>
        </div>
      </main>
    </div>
  );
}
