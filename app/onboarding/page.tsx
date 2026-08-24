'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { AlertCircle, Box, CheckCircle2 } from 'lucide-react';

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<'match_box' | 'signup'>('match_box');

  // Form State
  const [serialDigits, setSerialDigits] = useState<string[]>(['', '', '']);
  const inputRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];
  
  const [verifiedBoxId, setVerifiedBoxId] = useState<string>('');
  const [name, setName] = useState('');
  const [rawPhone, setRawPhone] = useState(''); // เก็บเฉพาะตัวเลข 10 หลัก
  const [birthDate, setBirthDate] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // ฟอร์แมตเบอร์โทรศัพท์สำหรับแสดงผล (081-555-0192)
  const formatPhoneNumber = (value: string) => {
    const cleaned = value.replace(/\D/g, '').slice(0, 10);
    setRawPhone(cleaned);
  };

  const getFormattedPhone = (digits: string) => {
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  // จัดการการพิมพ์ Serial Number แบบ Smooth Auto-Focus
  const handleDigitChange = (index: number, value: string) => {
    const cleanVal = value.replace(/\D/g, '').slice(-1); // รับเฉพาะตัวเลขตัวสุดท้าย
    const newDigits = [...serialDigits];
    newDigits[index] = cleanVal;
    setSerialDigits(newDigits);
    setErrorMessage('');

    // ย้ายไปช่องถัดไปถ้ามีการกรอกตัวเลข
    if (cleanVal && index < 2) {
      inputRefs[index + 1].current?.focus();
    }

    // ตรวจสอบอัตโนมัติหากกรอกครบ 3 หลัก
    if (cleanVal && index === 2 && newDigits.every((d) => d !== '')) {
      handleVerifyBox(newDigits.join(''));
    }
  };

  // จัดการกด ปุ่มลบ (Backspace) ถอยหลัง
  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !serialDigits[index] && index > 0) {
      inputRefs[index - 1].current?.focus();
    }
  };

  // 1. ตรวจสอบ Status Serial Number ของกล่องยา
  const handleVerifyBox = async (customDigits?: string) => {
    const digitsToVerify = customDigits || serialDigits.join('');
    const fullSerial = `B-${digitsToVerify}`;
    setErrorMessage('');

    if (digitsToVerify.length < 3) {
      setErrorMessage('กรุณากรอกรหัสประจำตัวเครื่องให้ครบถ้วน 3 หลัก');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('boxes')
        .select('box_id, owner_user_id, status')
        .eq('box_serial', fullSerial);

      if (error) {
        setErrorMessage(`ข้อผิดพลาดจากระบบ: ${error.message}`);
        return;
      }

      if (!data || data.length === 0) {
        setErrorMessage(`ไม่พบหมายเลขกล่อง ${fullSerial} ในระบบ`);
        return;
      }

      const box = data[0];

      if (box.owner_user_id) {
        setErrorMessage('กล่องยานี้มีผู้ใช้งานอื่นลงทะเบียนไปแล้ว');
        return;
      }

      setVerifiedBoxId(box.box_id);
      setStep('signup');
    } catch (err: any) {
      setErrorMessage('ไม่สามารถเชื่อมต่อกับฐานข้อมูลได้');
    }
  };

  // 2. บันทึกข้อมูลสมัครสมาชิก
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || rawPhone.length < 10 || !agreed) {
      alert('กรุณากรอกข้อมูลให้ครบถ้วน และตรวจสอบเบอร์โทรศัพท์ 10 หลัก');
      return;
    }

    let lineUserId = localStorage.getItem('line_user_id') || 'U_MOCK_LINE_USER_ID';
    let lineDisplayName = name;

    try {
      if (typeof window !== 'undefined' && (window as any).liff) {
        const liff = (window as any).liff;
        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          if (profile?.userId) {
            lineUserId = profile.userId;
            localStorage.setItem('line_user_id', lineUserId);
          }
          if (profile?.displayName) {
            lineDisplayName = profile.displayName;
          }
        }
      }
    } catch (liffErr) {
      console.warn('LINE Profile bypass:', liffErr);
    }

    try {
      const { data: newUser, error: userError } = await supabase
        .from('users')
        .insert({
          name: name || lineDisplayName,
          phone: rawPhone,
          birth_date: birthDate || null,
          line_user_id: lineUserId,
        })
        .select()
        .single();

      if (userError) throw userError;

      const { error: boxError } = await supabase
        .from('boxes')
        .update({ 
          owner_user_id: newUser.user_id,
          status: 'active'
        })
        .eq('box_id', verifiedBoxId);

      if (boxError) throw boxError;

      router.replace('/dashboard');
    } catch (err: any) {
      alert('เกิดข้อผิดพลาดในการลงทะเบียน: ' + err.message);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] w-full flex flex-col justify-between p-6 lg:p-12 text-slate-800">
      
      {/* GLOBAL HEADER */}
      <header className="w-full max-w-7xl mx-auto flex justify-between items-center pb-6 border-b border-[#E2E8F0]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#4F46E5] rounded-2xl flex items-center justify-center text-white shadow-md shadow-indigo-100">
            <Box size={24} />
          </div>
          <span className="font-['Kanit'] font-bold text-2xl text-[#4F46E5]">PillBox Web</span>
        </div>

        <div className="flex items-center gap-4">
          <span className="px-4 py-2 bg-indigo-50 text-[#4F46E5] rounded-2xl text-xs font-extrabold border border-indigo-200 font-['Kanit']">
            {step === 'match_box' ? 'Step 1: เชื่อมต่อกล่องยา' : 'Step 2: ลงทะเบียนผู้ใช้งาน'}
          </span>
        </div>
      </header>

      {/* STEP 1: MATCH THE BOX */}
      {step === 'match_box' && (
        <main className="w-full max-w-7xl mx-auto my-auto py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          
          <div className="lg:col-span-5 flex flex-col items-center text-center gap-6">
            <div className="w-full">
              <h1 className="font-['Kanit'] font-bold text-3xl lg:text-4xl text-[#0F172A]">
                เชื่อมต่อกล่องยาของคุณ
              </h1>
              <p className="font-['Inter'] text-base text-[#475569] mt-2 leading-relaxed max-w-md mx-auto">
                โปรดกรอกรหัสระบุตัวเครื่อง <span className="font-bold text-[#4F46E5]">3 หลัก</span> ด้านข้างกล่องยา
              </p>
            </div>

            <div className="relative w-48 h-48 my-2 flex items-center justify-center">
              <div className="absolute inset-0 bg-indigo-200/40 rounded-full blur-3xl" />
              <div className="relative w-full h-full bg-white rounded-[32px] border-2 border-[#E2E8F0] flex items-center justify-center shadow-xl p-6">
                <svg viewBox="0 0 100 100" className="w-44 h-44 stroke-[#4F46E5] fill-none stroke-[2.5] drop-shadow-md">
                  <path d="M50 12 L88 32 L88 68 L50 88 L12 68 L12 32 Z" />
                  <path d="M50 12 L50 88" />
                  <path d="M12 32 L50 50 L88 32" />
                  <path d="M50 50 L88 32 L88 68 L50 88 Z" className="fill-indigo-50/50" />
                </svg>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 bg-white border border-[#E2E8F0] p-8 lg:p-12 rounded-[32px] shadow-xl shadow-slate-100 flex flex-col justify-center items-center gap-8">
  
  {/* Input Serial Numbers (Center Aligned) */}
  <div className="flex items-center justify-center gap-3 sm:gap-4 w-full">
    <span className="text-5xl sm:text-5xl lg:text-6xl font-black text-[#0F172A] tracking-wider font-['Kanit'] select-none">
      B -
    </span>
    {serialDigits.map((digit, index) => (
      <input
        key={index}
        ref={inputRefs[index]}
        type="text"
        inputMode="numeric"
        maxLength={1}
        value={digit}
        onChange={(e) => handleDigitChange(index, e.target.value)}
        onKeyDown={(e) => handleKeyDown(index, e)}
        className="w-14 h-18 sm:w-16 sm:h-20 bg-[#F8FAFC] border-2 border-[#E2E8F0] rounded-[20px] text-center text-3xl font-extrabold text-[#0F172A] focus:border-[#4F46E5] focus:bg-white focus:outline-none shadow-sm transition-all font-['Inter'] cursor-text"
      />
    ))}
  </div>

            {errorMessage && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm p-4 rounded-[16px] flex items-center gap-3">
                <AlertCircle size={20} className="shrink-0 text-red-500" />
                <span className="font-semibold">{errorMessage}</span>
              </div>
            )}

            <button
              onClick={() => handleVerifyBox()}
              className="w-full h-[60px] bg-[#4F46E5] hover:bg-indigo-700 active:scale-[0.99] text-white font-['Kanit'] font-bold text-xl rounded-[20px] shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2 mt-2"
            >
              ถัดไป (ตรวจสอบกล่องยา)
            </button>
          </div>

        </main>
      )}

      {/* STEP 2: SIGN UP */}
{step === 'signup' && (
  <main className="w-full max-w-lg mx-auto my-auto py-6 flex flex-col gap-6">
    
    {/* Header Section (คล้ายแบบในรูป) */}
    <div className="flex flex-col gap-2 text-left">
      <h1 className="font-['Kanit'] font-extrabold text-3xl sm:text-4xl text-[#0F172A] tracking-tight">
        ลงทะเบียนข้อมูลส่วนตัว
      </h1>
      <p className="font-['Inter'] text-sm sm:text-base text-slate-500 leading-relaxed">
        กรอกรายละเอียดผู้ใช้เพื่อผูกบัญชีเข้ากับกล่องยาอัจฉริยะ <strong className="text-indigo-600 font-semibold">B-{serialDigits.join('') || '___'}</strong> และรับการแจ้งเตือนผ่าน LINE
      </p>
    </div>

    {/* Form Section */}
    <form onSubmit={handleSignUp} className="flex flex-col gap-5 mt-2">
      
      {/* Input 1: FULL NAME */}
      <div className="flex flex-col gap-2">
        <label className="font-['Kanit'] font-bold text-l text-slate-700 uppercase tracking-wider">
          ชื่อ-นามสกุล 
        </label>
        <div className="w-full h-14 px-5 bg-white border border-slate-200 rounded-[22px] flex items-center focus-within:border-indigo-600 focus-within:ring-2 focus-within:ring-indigo-100 transition-all shadow-sm">
          <input
            type="text"
            placeholder="สมพงษ์ จารุเดช"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-transparent font-['Inter'] text-base text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
        </div>
      </div>

    

      {/* Input 2: EMERGENCY PHONE */}
      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <label className="font-['Kanit'] font-bold text-l text-slate-700 uppercase tracking-wider">
            เบอร์โทรศัพท์
          </label>
          <span className={`text-xs font-['Inter'] flex items-center gap-1 ${rawPhone.length === 10 ? 'text-emerald-600 font-bold' : 'text-slate-400'}`}>
            {rawPhone.length === 10 && <CheckCircle2 size={13} />}
            {rawPhone.length}/10 ตัว
          </span>
        </div>
        <div className={`w-full h-14 px-5 bg-white border rounded-[22px] flex items-center transition-all shadow-sm ${
          rawPhone.length === 10 
            ? 'border-emerald-500 focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-100' 
            : 'border-slate-200 focus-within:border-indigo-600 focus-within:ring-2 focus-within:ring-indigo-100'
        }`}>
          <input
            type="tel"
            inputMode="numeric"
            placeholder="081-555-0192"
            value={getFormattedPhone(rawPhone)}
            onChange={(e) => formatPhoneNumber(e.target.value)}
            className="w-full bg-transparent font-['Inter'] text-base text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
        </div>
      </div>

      {/* Input 3: BIRTHDAY / AGE */}
      <div className="flex flex-col gap-2">
        <label className="font-['Kanit'] font-bold text-l text-slate-700 uppercase tracking-wider">
          วัน/เดือน/ปีเกิด 
        </label>
        <div className="w-full h-14 px-5 bg-white border border-slate-200 rounded-[22px] flex items-center focus-within:border-indigo-600 focus-within:ring-2 focus-within:ring-indigo-100 transition-all shadow-sm">
          <input
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            className="w-full bg-transparent font-['Inter'] text-base text-slate-900 focus:outline-none cursor-pointer"
          />
        </div>
      </div>


      {/* Terms Checkbox */}
      <div className="flex items-start gap-2.5 pt-2">
        <input
          type="checkbox"
          id="terms"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 w-4 h-4 accent-indigo-600 rounded border-slate-300 cursor-pointer shrink-0"
        />
        <label htmlFor="terms" className="font-['Inter'] text-xs text-slate-500 leading-relaxed cursor-pointer select-none">
          ฉันยอมรับ <span className="text-indigo-600 font-semibold underline">เงื่อนไขการใช้งาน</span> และ <span className="text-indigo-600 font-semibold underline">นโยบายความเป็นส่วนตัว</span> ของระบบ Smart Pill Box
        </label>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white font-['Kanit'] font-bold text-lg rounded-[22px] shadow-md shadow-indigo-200 transition-all flex items-center justify-center gap-2 mt-2"
      >
        ยืนยันการลงทะเบียน
      </button>

    </form>
  </main>
)}

      {/* GLOBAL FOOTER */}
      <footer className="w-full max-w-7xl mx-auto pt-6 border-t border-[#E2E8F0] flex justify-between items-center text-xs text-slate-400 font-['Inter']">
        <span>© 2026 Smart Pill Box Platform. All rights reserved.</span>
        <span>IoT & Medical Caregiver Assistant</span>
      </footer>

    </div>
  );
}