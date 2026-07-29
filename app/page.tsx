'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// Types
interface UserProfile {
  id: string;
  name: string;
  phone?: string;
  line_user_id: string;
  caregiver_line_id?: string;
  device_id: string;
  pictureUrl?: string;
}

interface Medicine {
  id: string;
  name: string;
  total_pills: number;
  remaining_pills: number;
  expire_date?: string;
}

interface Schedule {
  id: string;
  time: string;
  dose_amount: number;
  days_of_week: string[];
  medicines?: { name: string } | null;
}

interface Log {
  id: string;
  scheduled_time: string;
  actual_time?: string;
  status: 'taken' | 'missed' | 'pending';
  medicines?: { name: string } | null;
}

export default function Home() {
  const [loading, setLoading] = useState<boolean>(true);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  
  // State ควบคุมว่าจะแสดงหน้าลงทะเบียนหรือไม่
  const [needsRegistration, setNeedsRegistration] = useState<boolean>(false);

  const [lineUserId, setLineUserId] = useState<string>('');
  const [userPicture, setUserPicture] = useState<string>('');

  // Dashboard Data
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);

  // Register Form
  const [form, setForm] = useState({
    name: '',
    phone: '',
    caregiver_line_id: '',
  });

  useEffect(() => {
    initLiff();
  }, []);

  const initLiff = async () => {
    try {
      const liff = (await import('@line/liff')).default;
      const liffId = process.env.NEXT_PUBLIC_LIFF_ID || '';

      if (liffId) {
        await liff.init({ liffId });
        if (liff.isLoggedIn()) {
          setIsLoggedIn(true);
          await checkUserAndRoute(liff);
        } else {
          setIsLoggedIn(false);
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    } catch (error) {
      console.error('LIFF Init Error:', error);
      setLoading(false);
    }
  };

  const handleLineLogin = async () => {
    try {
      const liff = (await import('@line/liff')).default;
      if (!liff.isLoggedIn()) {
        liff.login({ redirectUri: window.location.href });
      } else {
        setIsLoggedIn(true);
        await checkUserAndRoute(liff);
      }
    } catch (error) {
      console.error('LINE Login Error:', error);
    }
  };

  // เช็กข้อมูลใน Supabase: ถ้าไม่มีข้อมูล หรือ ไม่มีเบอร์โทร -> สั่งเด้งไปหน้าลงทะเบียน
  const checkUserAndRoute = async (liff: any) => {
    setLoading(true);
    try {
      const profile = await liff.getProfile();
      const currentLineId = profile.userId;

      setLineUserId(currentLineId);
      setUserPicture(profile.pictureUrl || '');

      // ดึงข้อมูล User จากตาราง users ใน Supabase
      const { data: dbUser, error } = await supabase
        .from('users')
        .select('*')
        .eq('line_user_id', currentLineId)
        .maybeSingle();

      if (error) console.error('Error fetching user:', error);

      // เงื่อนไข: ถ้ามี User และ มีเบอร์โทรศัพท์เรียบร้อย -> เข้าหน้า Dashboard
      if (dbUser && dbUser.phone && dbUser.phone.trim() !== '') {
        setUser({ ...dbUser, pictureUrl: profile.pictureUrl });
        setNeedsRegistration(false);
        await fetchDashboardData(dbUser.id);
      } else {
        // ถ้ายังไม่มี User ใน DB หรือ ยังไม่มีเบอร์โทรศัพท์ -> ให้เด้งไปหน้าลงทะเบียน
        setForm({
          name: profile.displayName || '',
          phone: dbUser?.phone || '',
          caregiver_line_id: dbUser?.caregiver_line_id || '',
        });
        setNeedsRegistration(true);
      }
    } catch (err) {
      console.error('Check User Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDashboardData = async (userId: string) => {
    try {
      const { data: medData } = await supabase.from('medicines').select('*').eq('user_id', userId);
      if (medData) setMedicines(medData);

      const { data: schedData } = await supabase.from('schedules').select('*, medicines(name)').eq('user_id', userId).eq('active', true);
      if (schedData) setSchedules(schedData as any);

      const { data: logData } = await supabase.from('logs').select('*, medicines(name)').eq('user_id', userId).order('scheduled_time', { ascending: false }).limit(5);
      if (logData) setLogs(logData as any);
    } catch (err) {
      console.error('Fetch Data Error:', err);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lineUserId) return alert('ไม่พบข้อมูล LINE User ID กรุณาล็อกอินใหม่');
    if (!form.name.trim()) return alert('กรุณากรอกชื่อ-นามสกุล');
    if (!form.phone.trim()) return alert('กรุณากรอกเบอร์โทรศัพท์');

    setLoading(true);

    try {
      const payload = {
        line_user_id: lineUserId,
        name: form.name.trim(),
        phone: form.phone.trim(),
        caregiver_line_id: form.caregiver_line_id.trim() || null,
        device_id: `DEV-${lineUserId.slice(-6).toUpperCase()}`,
      };

      const { data: newUser, error } = await supabase
        .from('users')
        .upsert([payload], { onConflict: 'line_user_id' })
        .select()
        .single();

      if (error) throw error;

      alert('ลงทะเบียนสำเร็จ!');
      setUser({ ...newUser, pictureUrl: userPicture });
      setNeedsRegistration(false); // ปิดหน้าลงทะเบียน แล้วย้ายไปแสดง Dashboard
      await fetchDashboardData(newUser.id);
    } catch (err: any) {
      console.error('Register Error:', err);
      alert('เกิดข้อผิดพลาดในการลงทะเบียน: ' + (err.message || ''));
    } finally {
      setLoading(false);
    }
  };

  // หน้าจอตอนกำลังโหลด
  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#fff1f2]">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-[#ec4899] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-[#db2777] font-medium text-sm">กำลังตรวจสอบข้อมูล...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#fff1f2] text-slate-800 flex flex-col justify-between font-sans">
      {/* HEADER */}
      <header className="bg-gradient-to-r from-[#ec4899] to-[#f43f5e] text-white p-4 shadow-md flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {userPicture ? (
            <img src={userPicture} alt="Profile" className="w-10 h-10 rounded-full border-2 border-white/80 shadow-sm" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-lg">💊</div>
          )}
          <div>
            <h1 className="font-bold text-base">
              {user ? `สวัสดี, ${user.name}` : 'Smart Pillbox'}
            </h1>
            <p className="text-[11px] text-pink-100">ระบบตลับยาอัจฉริยะ</p>
          </div>
        </div>
        {user?.device_id && (
          <span className="text-[10px] bg-white/20 px-2.5 py-1 rounded-full text-white backdrop-blur-sm">
            {user.device_id}
          </span>
        )}
      </header>

      {/* CASE 1: ยังไม่ได้ Login LINE */}
      {!isLoggedIn && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-white p-8 rounded-3xl shadow-xl border border-pink-100 text-center max-w-sm w-full space-y-6">
            <div className="w-20 h-20 bg-[#fce7f3] text-[#ec4899] rounded-full flex items-center justify-center mx-auto text-4xl shadow-inner">
              💊
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Smart Pillbox</h2>
              <p className="text-xs text-slate-400 mt-1">
                กรุณาเข้าสู่ระบบด้วย LINE เพื่อใช้งาน
              </p>
            </div>

            <button
              onClick={handleLineLogin}
              className="w-full bg-[#06C755] hover:bg-[#05b34c] text-white font-medium py-3 px-4 rounded-2xl flex items-center justify-center space-x-2 transition shadow-lg text-sm"
            >
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M24 10.304c0-5.369-5.383-9.738-12-9.738-6.616 0-12 4.369-12 9.738 0 4.814 4.269 8.846 10.036 9.608.391.084.922.258 1.057.592.121.303.079.778.039 1.085l-.171 1.027c-.053.303-.242 1.186 1.039.647 1.281-.54 6.911-4.069 9.428-6.967 1.739-1.907 2.572-3.844 2.572-6.002z" />
              </svg>
              <span>เข้าสู่ระบบด้วย LINE</span>
            </button>
          </div>
        </div>
      )}

      {/* CASE 2: เข้า LINE แล้วแต่ไม่มีเบอร์ -> เด้งเข้าหน้าลงทะเบียนทันที */}
      {isLoggedIn && needsRegistration && (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-xl overflow-hidden border border-pink-100">
            <div className="bg-gradient-to-r from-[#ec4899] to-[#f43f5e] p-6 text-white text-center">
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-2 text-2xl">
                📝
              </div>
              <h2 className="text-lg font-bold">ลงทะเบียนผู้ใช้งาน</h2>
              <p className="text-xs text-pink-100 mt-1">
                กรุณากรอกข้อมูลเบอร์โทรศัพท์เพื่อผูกตลับยา
              </p>
            </div>

            <form onSubmit={handleRegisterSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  ชื่อ - นามสกุล <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="เช่น สมหญิง รักสุขภาพ"
                  className="w-full border border-pink-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#ec4899] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  เบอร์โทรศัพท์ <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="เช่น 0812345678"
                  className="w-full border border-pink-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#ec4899] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  LINE ID ผู้ดูแล (ถ้ามี)
                </label>
                <input
                  type="text"
                  value={form.caregiver_line_id}
                  onChange={(e) => setForm({ ...form, caregiver_line_id: e.target.value })}
                  placeholder="สำหรับส่งแจ้งเตือนเมื่อลืมทานยา"
                  className="w-full border border-pink-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#ec4899] focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full mt-2 bg-[#ec4899] hover:bg-[#db2777] text-white font-medium py-3 rounded-xl transition shadow-lg shadow-pink-500/30 text-sm"
              >
                บันทึกและเริ่มใช้งาน
              </button>
            </form>
          </div>
        </div>
      )}

      {/* CASE 3: ลงทะเบียนเรียบร้อยแล้ว -> แสดงหน้าหลัก (Dashboard สีชมพู) */}
      {isLoggedIn && !needsRegistration && user && (
        <div className="max-w-4xl mx-auto p-4 space-y-4 w-full flex-1 pb-8">
          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-pink-100 text-center">
              <p className="text-[11px] font-medium text-slate-400">ทานตรงเวลา</p>
              <p className="text-xl font-bold text-[#ec4899] mt-1">
                {logs.length > 0 ? Math.round((logs.filter(l => l.status === 'taken').length / logs.length) * 100) : 100}%
              </p>
            </div>
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-pink-100 text-center">
              <p className="text-[11px] font-medium text-slate-400">ยาใกล้หมด</p>
              <p className="text-xl font-bold text-[#f43f5e] mt-1">
                {medicines.filter(m => m.remaining_pills <= 5).length} <span className="text-xs font-normal">ชนิด</span>
              </p>
            </div>
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-pink-100 text-center">
              <p className="text-[11px] font-medium text-slate-400">รายการยาทั้งหมด</p>
              <p className="text-xl font-bold text-purple-500 mt-1">
                {medicines.length} <span className="text-xs font-normal">ชนิด</span>
              </p>
            </div>
          </div>

          {/* Schedules Section */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-pink-100 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-700 text-sm flex items-center gap-1.5">
                <span>⏰</span> ตารางการทานยาวันนี้
              </h3>
              <span className="text-[10px] text-[#ec4899] bg-[#fce7f3] px-2 py-0.5 rounded-full font-medium">
                {schedules.length} รายการ
              </span>
            </div>

            {schedules.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-xs bg-[#fff1f2]/50 rounded-xl border border-dashed border-pink-200">
                ยังไม่มีการตั้งเวลาทานยา
              </div>
            ) : (
              <div className="space-y-2">
                {schedules.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 bg-[#fdf2f8] rounded-xl border border-pink-100">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-[#ec4899] text-white rounded-xl flex items-center justify-center font-bold text-xs shadow-sm">
                        {item.time.slice(0, 5)}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-700 text-xs">{item.medicines?.name || 'ยาไม่ระบุชื่อ'}</p>
                        <p className="text-[10px] text-slate-400">ครั้งละ {item.dose_amount} เม็ด</p>
                      </div>
                    </div>
                    <span className="text-[10px] bg-white text-[#ec4899] border border-pink-200 px-2 py-0.5 rounded-md font-medium">
                      {item.days_of_week.join(', ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Medicines Section */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-pink-100 space-y-3">
            <h3 className="font-bold text-slate-700 text-sm flex items-center gap-1.5">
              <span>💊</span> คลังยาของคุณ
            </h3>

            {medicines.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-xs bg-[#fff1f2]/50 rounded-xl border border-dashed border-pink-200">
                ยังไม่มีข้อมูลยาในระบบ
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {medicines.map((med) => (
                  <div key={med.id} className="p-3 border border-slate-100 bg-slate-50/50 rounded-xl flex justify-between items-center">
                    <div>
                      <p className="font-semibold text-slate-700 text-xs">{med.name}</p>
                      <p className="text-[10px] text-slate-400">
                        {med.expire_date ? `หมดอายุ: ${med.expire_date}` : 'ไม่ระบุวันหมดอายุ'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-xs font-bold ${med.remaining_pills <= 5 ? 'text-[#f43f5e]' : 'text-emerald-600'}`}>
                        {med.remaining_pills} / {med.total_pills} เม็ด
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}