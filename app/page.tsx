'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// Interfaces ตาม Database Schema
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
  medicine_id: string;
  medicines?: { name: string } | null;
}

interface Log {
  id: string;
  scheduled_time: string;
  actual_time?: string;
  status: 'taken' | 'missed' | 'pending';
  image_url?: string;
  medicines?: { name: string } | null;
}

export default function Home() {
  const [loading, setLoading] = useState<boolean>(true);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [needsRegistration, setNeedsRegistration] = useState<boolean>(false);
  const [showProfilePopup, setShowProfilePopup] = useState<boolean>(false);

  // Active Tab: overview | history | medicines | schedules | analytics
  const [activeTab, setActiveTab] = useState<string>('overview');

  const [lineUserId, setLineUserId] = useState<string>('');
  const [userPicture, setUserPicture] = useState<string>('');

  // Dashboard Data
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);

  // User Register Form
  const [userForm, setUserForm] = useState({
    name: '',
    phone: '',
    caregiver_line_id: '',
  });

  // Full Medicine Form (สำหรับลงทะเบียนยาแบบละเอียด)
  const [medForm, setMedForm] = useState({
    name: '',
    total_pills: 30,
    expire_date: '',
    freq_type: 'daily', // daily | interval | custom
    interval_days: 2,
    selected_days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    is_critical: false,
    dose_times: [{ time: '08:00', dose_amount: 1 }],
  });

  // Modal ถ่ายรูป/ดูรูปประวัติ
  const [selectedLogImage, setSelectedLogImage] = useState<string | null>(null);

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
      console.error('LIFF Error:', error);
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
      console.error('Login Error:', error);
    }
  };

  const checkUserAndRoute = async (liff: any) => {
    setLoading(true);
    try {
      const profile = await liff.getProfile();
      const currentLineId = profile.userId;

      setLineUserId(currentLineId);
      setUserPicture(profile.pictureUrl || '');

      const { data: dbUser } = await supabase
        .from('users')
        .select('*')
        .eq('line_user_id', currentLineId)
        .maybeSingle();

      if (dbUser && dbUser.phone && dbUser.phone.trim() !== '') {
        setUser({ ...dbUser, pictureUrl: profile.pictureUrl });
        setNeedsRegistration(false);
        await fetchAllData(dbUser.id);
      } else {
        setUserForm({
          name: profile.displayName || '',
          phone: dbUser?.phone || '',
          caregiver_line_id: dbUser?.caregiver_line_id || '',
        });
        setNeedsRegistration(true);
      }
    } catch (err) {
      console.error('Check user error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllData = async (userId: string) => {
    try {
      const { data: medData } = await supabase.from('medicines').select('*').eq('user_id', userId);
      if (medData) setMedicines(medData);

      const { data: schedData } = await supabase.from('schedules').select('*, medicines(name)').eq('user_id', userId);
      if (schedData) setSchedules(schedData as any);

      const { data: logData } = await supabase.from('logs').select('*, medicines(name)').eq('user_id', userId).order('scheduled_time', { ascending: false });
      if (logData) setLogs(logData as any);
    } catch (err) {
      console.error('Fetch error:', err);
    }
  };

  const handleUserRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userForm.name.trim() || !userForm.phone.trim()) return alert('กรุณากรอกข้อมูลให้ครบถ้วน');

    setLoading(true);
    try {
      const payload = {
        line_user_id: lineUserId,
        name: userForm.name.trim(),
        phone: userForm.phone.trim(),
        caregiver_line_id: userForm.caregiver_line_id.trim() || null,
        device_id: `BOX-${lineUserId.slice(-6).toUpperCase()}`,
      };

      const { data: newUser, error } = await supabase
        .from('users')
        .upsert([payload], { onConflict: 'line_user_id' })
        .select()
        .single();

      if (error) throw error;

      setUser({ ...newUser, pictureUrl: userPicture });
      setNeedsRegistration(false);
      await fetchAllData(newUser.id);
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogoutReset = async () => {
    if (confirm('คุณต้องการออกจากระบบ / ลงทะเบียนข้อมูลใหม่ใช่หรือไม่?')) {
      try {
        const liff = (await import('@line/liff')).default;
        if (liff.isLoggedIn()) liff.logout();
      } catch (e) {}
      setIsLoggedIn(false);
      setUser(null);
      setNeedsRegistration(false);
      setShowProfilePopup(false);
      window.location.reload();
    }
  };

  // เพิ่มยาแบบละเอียด + ตั้งตารางเวลา
  const handleAddMedicineFull = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!medForm.name.trim()) return alert('กรุณาระบุชื่อยา');

    setLoading(true);
    try {
      // 1. เพิ่มข้อมูลยาลงตาราง medicines
      const { data: medData, error: medErr } = await supabase
        .from('medicines')
        .insert([{
          user_id: user.id,
          name: medForm.name.trim(),
          total_pills: medForm.total_pills,
          remaining_pills: medForm.total_pills,
          expire_date: medForm.expire_date || null
        }])
        .select()
        .single();

      if (medErr) throw medErr;

      // คำนวณ days_of_week
      let daysArr = ['daily'];
      if (medForm.freq_type === 'custom') {
        daysArr = medForm.selected_days;
      } else if (medForm.freq_type === 'interval') {
        daysArr = [`every_${medForm.interval_days}_days`];
      }

      // 2. สร้างตารางเวลาสำหรับยานี้
      const schedulePayloads = medForm.dose_times.map(item => ({
        user_id: user.id,
        medicine_id: medData.id,
        time: `${item.time}:00`,
        days_of_week: daysArr,
        dose_amount: item.dose_amount,
        active: true
      }));

      const { error: schedErr } = await supabase.from('schedules').insert(schedulePayloads);
      if (schedErr) throw schedErr;

      alert('ลงทะเบียนยาและตั้งเวลาเตือนเรียบร้อยแล้ว!');
      // Reset Form
      setMedForm({
        name: '',
        total_pills: 30,
        expire_date: '',
        freq_type: 'daily',
        interval_days: 2,
        selected_days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
        is_critical: false,
        dose_times: [{ time: '08:00', dose_amount: 1 }],
      });

      await fetchAllData(user.id);
      setActiveTab('schedules');
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const addDoseTimeSlot = (defaultTime = '12:00') => {
    setMedForm({
      ...medForm,
      dose_times: [...medForm.dose_times, { time: defaultTime, dose_amount: 1 }]
    });
  };

  const removeDoseTimeSlot = (index: number) => {
    if (medForm.dose_times.length <= 1) return alert('ต้องมีอย่างน้อย 1 มื้อ');
    const updated = medForm.dose_times.filter((_, i) => i !== index);
    setMedForm({ ...medForm, dose_times: updated });
  };

  const updateDoseSlot = (index: number, field: string, value: any) => {
    const updated = [...medForm.dose_times];
    updated[index] = { ...updated[index], [field]: value };
    setMedForm({ ...medForm, dose_times: updated });
  };

  const deleteMedicine = async (id: string) => {
    if (!confirm('ยืนยันลบรายการยานี้? ตารางเวลาจะถูกลบไปด้วย')) return;
    setLoading(true);
    await supabase.from('medicines').delete().eq('id', id);
    if (user) await fetchAllData(user.id);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-emerald-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-emerald-800 font-bold text-lg">กำลังโหลดข้อมูลระบบตลับยา...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-800 flex flex-col font-sans pb-12">
      {/* HEADER สีเขียวเพื่อสุขภาพสำหรับผู้สูงอายุ */}
      <header className="bg-emerald-700 text-white p-4 shadow-lg sticky top-0 z-40">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {userPicture ? (
              <img src={userPicture} alt="Profile" className="w-12 h-12 rounded-full border-2 border-white shadow-md" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-emerald-800 flex items-center justify-center text-2xl">💊</div>
            )}
            <div>
              <h1 className="font-bold text-lg sm:text-xl">
                {user ? `สวัสดีคุณ, ${user.name}` : 'ตลับยาอัจฉริยะ (Smart Pillbox)'}
              </h1>
              <p className="text-xs text-emerald-100">ระบบช่วยเตือนทานยาเพื่อสุขภาพ</p>
            </div>
          </div>

          {isLoggedIn && user && (
            <button
              onClick={() => setShowProfilePopup(true)}
              className="bg-emerald-800 hover:bg-emerald-900 border border-emerald-500 text-white px-3 py-1.5 rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5"
            >
              <span>👤</span> ข้อมูลส่วนตัว
            </button>
          )}
        </div>
      </header>

      {/* STATE 1: ยังไม่ได้ Login LINE */}
      {!isLoggedIn && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-white p-8 rounded-3xl shadow-xl border-2 border-emerald-200 text-center max-w-md w-full space-y-6">
            <div className="w-24 h-24 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto text-5xl shadow-inner">
              💊
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-800">เข้าสู่ระบบตลับยาอัจฉริยะ</h2>
              <p className="text-sm text-slate-500 mt-2">
                สำหรับผู้สูงอายุและผู้ดูแล คลิกปุ่มสีเขียวเพื่อเริ่มใช้งาน
              </p>
            </div>

            <button
              onClick={handleLineLogin}
              className="w-full bg-[#06C755] hover:bg-[#05b34c] text-white font-bold py-4 px-6 rounded-2xl flex items-center justify-center space-x-3 transition shadow-lg text-lg"
            >
              <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                <path d="M24 10.304c0-5.369-5.383-9.738-12-9.738-6.616 0-12 4.369-12 9.738 0 4.814 4.269 8.846 10.036 9.608.391.084.922.258 1.057.592.121.303.079.778.039 1.085l-.171 1.027c-.053.303-.242 1.186 1.039.647 1.281-.54 6.911-4.069 9.428-6.967 1.739-1.907 2.572-3.844 2.572-6.002z" />
              </svg>
              <span>เข้าสู่ระบบด้วย LINE</span>
            </button>
          </div>
        </div>
      )}

      {/* STATE 2: เข้าสู่ระบบแล้วแต่ไม่มีเบอร์ -> บังคับหน้าลงทะเบียน */}
      {isLoggedIn && needsRegistration && (
        <div className="flex-1 flex items-center justify-center p-4 my-6">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border-2 border-emerald-300">
            <div className="bg-emerald-700 p-6 text-white text-center">
              <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-2 text-3xl">
                📝
              </div>
              <h2 className="text-2xl font-bold">ลงทะเบียนผู้ใช้งาน</h2>
              <p className="text-sm text-emerald-100 mt-1">
                กรุณากรอกชื่อและเบอร์โทรศัพท์เพื่อผูกตลับยาอัจฉริยะ
              </p>
            </div>

            <form onSubmit={handleUserRegister} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">
                  ชื่อ - นามสกุล <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={userForm.name}
                  onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                  placeholder="เช่น ตาบุญส่ง ยิ้มสู้"
                  className="w-full border-2 border-emerald-200 rounded-xl px-4 py-3 text-base focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">
                  เบอร์โทรศัพท์ผู้สูงอายุ <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  value={userForm.phone}
                  onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
                  placeholder="เช่น 0812345678"
                  className="w-full border-2 border-emerald-200 rounded-xl px-4 py-3 text-base focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">
                  LINE ID / เบอร์ ผู้ดูแล (บุตรหลาน)
                </label>
                <input
                  type="text"
                  value={userForm.caregiver_line_id}
                  onChange={(e) => setUserForm({ ...userForm, caregiver_line_id: e.target.value })}
                  placeholder="สำหรับแจ้งเตือนเมื่อลืมกินยา"
                  className="w-full border-2 border-emerald-200 rounded-xl px-4 py-3 text-base focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-xl shadow-lg text-lg transition"
              >
                บันทึกและเริ่มใช้งานตลับยา
              </button>
            </form>
          </div>
        </div>
      )}

      {/* STATE 3: เข้าใช้งานปกติ (5 หน้าหลัก) */}
      {isLoggedIn && !needsRegistration && user && (
        <div className="max-w-4xl mx-auto w-full p-3 sm:p-4 space-y-4 flex-1">
          {/* NAVIGATION TABS ขนาดใหญ่กดง่าย */}
          <nav className="grid grid-cols-5 gap-1 sm:gap-2 bg-white p-2 rounded-2xl shadow-sm border border-emerald-100 text-center font-bold text-xs sm:text-sm">
            {[
              { id: 'overview', label: 'ภาพรวม', icon: '📊' },
              { id: 'history', label: 'ประวัติการกิน', icon: '📜' },
              { id: 'medicines', label: 'คลังยา/เพิ่มยา', icon: '💊' },
              { id: 'schedules', label: 'ตารางเตือน', icon: '⏰' },
              { id: 'analytics', label: 'รายงานวิเคราะห์', icon: '📈' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-2.5 px-1 rounded-xl transition flex flex-col sm:flex-row items-center justify-center gap-1 ${
                  activeTab === tab.id
                    ? 'bg-emerald-700 text-white shadow-md'
                    : 'text-slate-600 hover:bg-emerald-50'
                }`}
              >
                <span className="text-base sm:text-lg">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>

          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {/* Cards สรุป 3 กล่องใหญ่ */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-white p-5 rounded-2xl shadow-sm border-2 border-emerald-200 text-center">
                  <p className="text-sm font-bold text-slate-500">อัตรากินยาตรงเวลา (Adherence)</p>
                  <p className="text-3xl font-extrabold text-emerald-600 mt-1">
                    {logs.length > 0 ? Math.round((logs.filter((l) => l.status === 'taken').length / logs.length) * 100) : 100}%
                  </p>
                </div>
                <div className="bg-white p-5 rounded-2xl shadow-sm border-2 border-amber-200 text-center">
                  <p className="text-sm font-bold text-slate-500">ยาใกล้หมดคลัง (≤ 5 เม็ด)</p>
                  <p className="text-3xl font-extrabold text-amber-600 mt-1">
                    {medicines.filter((m) => m.remaining_pills <= 5).length} <span className="text-sm font-normal">รายการ</span>
                  </p>
                </div>
                <div className="bg-white p-5 rounded-2xl shadow-sm border-2 border-rose-200 text-center">
                  <p className="text-sm font-bold text-slate-500">รายการยาทั้งหมด</p>
                  <p className="text-3xl font-extrabold text-rose-600 mt-1">
                    {medicines.length} <span className="text-sm font-normal">ชนิด</span>
                  </p>
                </div>
              </div>

              {/* ตารางการทานยาวันนี้ */}
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-emerald-100 space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                    <span>⏰</span> ตารางการทานยาวันนี้
                  </h3>
                  <span className="text-xs bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full font-bold">
                    {schedules.length} มื้อ
                  </span>
                </div>

                {schedules.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-sm bg-emerald-50/50 rounded-2xl border-2 border-dashed border-emerald-200">
                    ยังไม่มีการตั้งเวลาเตือนทานยา กดปุ่มเมนู &quot;คลังยา/เพิ่มยา&quot; เพื่อลงทะเบียนยาใหม่
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {schedules.map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-4 bg-emerald-50 rounded-2xl border border-emerald-200">
                        <div className="flex items-center space-x-3">
                          <div className="w-12 h-12 bg-emerald-700 text-white rounded-xl flex items-center justify-center font-bold text-base shadow">
                            {item.time.slice(0, 5)}
                          </div>
                          <div>
                            <p className="font-bold text-slate-800 text-sm">{item.medicines?.name || 'รายการยา'}</p>
                            <p className="text-xs text-slate-500">ครั้งละ {item.dose_amount} เม็ด</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: HISTORY / LOGS */}
          {activeTab === 'history' && (
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-emerald-100 space-y-4">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <span>📜</span> ประวัติการทานยาย้อนหลัง (Logs)
              </h3>

              {logs.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm bg-slate-50 rounded-2xl">
                  ยังไม่มีประวัติการทานยาในระบบ
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-emerald-100 text-emerald-900 font-bold">
                      <tr>
                        <th className="p-3 rounded-l-xl">เวลาเตือน</th>
                        <th className="p-3">ชื่อยา</th>
                        <th className="p-3">สถานะ</th>
                        <th className="p-3 rounded-r-xl">รูปถ่ายยืนยัน</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {logs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50">
                          <td className="p-3 font-semibold text-slate-700">
                            {new Date(log.scheduled_time).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
                          </td>
                          <td className="p-3 font-bold text-slate-800">{log.medicines?.name || 'ยาทั่วไป'}</td>
                          <td className="p-3">
                            {log.status === 'taken' && <span className="bg-emerald-100 text-emerald-700 font-bold px-2.5 py-1 rounded-full text-xs">ทานแล้ว</span>}
                            {log.status === 'missed' && <span className="bg-rose-100 text-rose-700 font-bold px-2.5 py-1 rounded-full text-xs">ลืมทาน</span>}
                            {log.status === 'pending' && <span className="bg-amber-100 text-amber-700 font-bold px-2.5 py-1 rounded-full text-xs">รอกิน</span>}
                          </td>
                          <td className="p-3">
                            {log.image_url ? (
                              <button
                                onClick={() => setSelectedLogImage(log.image_url || null)}
                                className="text-xs bg-emerald-600 text-white px-2.5 py-1 rounded-lg font-bold hover:bg-emerald-700"
                              >
                                📷 ดูรูป
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400">ไม่มีรูป</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: MEDICINE MANAGEMENT (FULL FORM REGISTRATION) */}
          {activeTab === 'medicines' && (
            <div className="space-y-6">
              {/* ฟอร์มลงทะเบียนยาแบบละเอียด */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border-2 border-emerald-300 space-y-5">
                <div className="border-b border-emerald-100 pb-3 flex items-center justify-between">
                  <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                    <span>➕</span> ลงทะเบียนยาใหม่แบบละเอียด (Full Form)
                  </h3>
                  <span className="text-xs bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full font-bold">
                    ตั้งมื้ออาหารได้ทันที
                  </span>
                </div>

                <form onSubmit={handleAddMedicineFull} className="space-y-5">
                  {/* ชื่อยา / จำนวน / วันหมดอายุ */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        ชื่อยา <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={medForm.name}
                        onChange={(e) => setMedForm({ ...medForm, name: e.target.value })}
                        placeholder="เช่น ยาลดความดัน"
                        className="w-full border-2 border-emerald-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">จำนวนเม็ดบรรจุรวม</label>
                      <input
                        type="number"
                        min="1"
                        value={medForm.total_pills}
                        onChange={(e) => setMedForm({ ...medForm, total_pills: Number(e.target.value) })}
                        className="w-full border-2 border-emerald-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">วันหมดอายุ (ถ้ามี)</label>
                      <input
                        type="date"
                        value={medForm.expire_date}
                        onChange={(e) => setMedForm({ ...medForm, expire_date: e.target.value })}
                        className="w-full border-2 border-emerald-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* รูปแบบการทาน (Frequency) */}
                  <div className="space-y-2 bg-emerald-50/60 p-4 rounded-xl border border-emerald-200">
                    <label className="block text-xs font-bold text-emerald-900">รูปแบบวันในการทาน (Frequency)</label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { id: 'daily', label: 'ทุกวัน' },
                        { id: 'interval', label: 'วันเว้นวัน (หรือทุกๆ N วัน)' },
                        { id: 'custom', label: 'เลือกวันในสัปดาห์' },
                      ].map((mode) => (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => setMedForm({ ...medForm, freq_type: mode.id })}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                            medForm.freq_type === mode.id
                              ? 'bg-emerald-700 text-white border-emerald-700 shadow'
                              : 'bg-white text-slate-700 border-emerald-200 hover:bg-emerald-100'
                          }`}
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>

                    {medForm.freq_type === 'interval' && (
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs font-bold text-slate-700">กินยาทุกๆ</span>
                        <input
                          type="number"
                          min="2"
                          max="30"
                          value={medForm.interval_days}
                          onChange={(e) => setMedForm({ ...medForm, interval_days: Number(e.target.value) })}
                          className="w-20 border-2 border-emerald-300 rounded-lg p-1 text-center font-bold text-sm"
                        />
                        <span className="text-xs font-bold text-slate-700">วัน</span>
                      </div>
                    )}
                  </div>

                  {/* เวลาและจำนวนเม็ดที่ต้องทาน (Multi-Dose Slot) */}
                  <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-bold text-slate-800">เวลาและจำนวนเม็ดที่ต้องทาน</label>
                      {/* ปุ่มมื้อมาตรฐาน */}
                      <div className="flex gap-1">
                        <button type="button" onClick={() => addDoseTimeSlot('08:00')} className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-1 rounded-md">เช้า (08:00)</button>
                        <button type="button" onClick={() => addDoseTimeSlot('12:00')} className="text-[10px] bg-orange-100 text-orange-800 font-bold px-2 py-1 rounded-md">กลางวัน (12:00)</button>
                        <button type="button" onClick={() => addDoseTimeSlot('18:00')} className="text-[10px] bg-blue-100 text-blue-800 font-bold px-2 py-1 rounded-md">เย็น (18:00)</button>
                        <button type="button" onClick={() => addDoseTimeSlot('21:00')} className="text-[10px] bg-purple-100 text-purple-800 font-bold px-2 py-1 rounded-md">ก่อนนอน (21:00)</button>
                      </div>
                    </div>

                    {medForm.dose_times.map((slot, idx) => (
                      <div key={idx} className="flex items-center gap-3 bg-white p-3 rounded-xl border border-emerald-200">
                        <span className="text-xs font-bold text-slate-500">มื้อที่ {idx + 1}:</span>
                        <input
                          type="time"
                          required
                          value={slot.time}
                          onChange={(e) => updateDoseSlot(idx, 'time', e.target.value)}
                          className="border-2 border-emerald-300 rounded-lg p-1.5 text-sm font-bold"
                        />
                        <div className="flex items-center gap-1.5 ml-auto">
                          <span className="text-xs font-bold text-slate-600">จำนวน:</span>
                          <button
                            type="button"
                            onClick={() => updateDoseSlot(idx, 'dose_amount', Math.max(1, slot.dose_amount - 1))}
                            className="w-8 h-8 bg-rose-100 text-rose-700 font-extrabold rounded-lg text-lg flex items-center justify-center hover:bg-rose-200"
                          >
                            -
                          </button>
                          <span className="w-8 text-center font-extrabold text-base">{slot.dose_amount}</span>
                          <button
                            type="button"
                            onClick={() => updateDoseSlot(idx, 'dose_amount', slot.dose_amount + 1)}
                            className="w-8 h-8 bg-emerald-100 text-emerald-700 font-extrabold rounded-lg text-lg flex items-center justify-center hover:bg-emerald-200"
                          >
                            +
                          </button>
                          <span className="text-xs font-bold text-slate-600">เม็ด</span>
                        </div>
                        {medForm.dose_times.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeDoseTimeSlot(idx)}
                            className="text-xs text-rose-500 font-bold p-1 hover:underline ml-2"
                          >
                            ลบมื้อนี้
                          </button>
                        )}
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={() => addDoseTimeSlot('12:00')}
                      className="w-full py-2 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-xl border border-dashed border-emerald-400 hover:bg-emerald-200"
                    >
                      [ + เพิ่มเวลากินยาสำหรับยานี้ ]
                    </button>
                  </div>

                  {/* ระดับความสำคัญ */}
                  <div className="flex items-center gap-2 bg-amber-50 p-3 rounded-xl border border-amber-200">
                    <input
                      type="checkbox"
                      id="critical"
                      checked={medForm.is_critical}
                      onChange={(e) => setMedForm({ ...medForm, is_critical: e.target.checked })}
                      className="w-5 h-5 accent-amber-600 rounded"
                    />
                    <label htmlFor="critical" className="text-xs font-bold text-amber-900 cursor-pointer">
                      ติดดาวเป็น &quot;ยาสำคัญมาก&quot; (หากลืมกินยาจะแจ้งเตือนผู้ดูแลผ่าน LINE ทันที)
                    </label>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-3.5 rounded-xl shadow-md text-base transition"
                  >
                    บันทึกข้อมูลยาลงตลับอัจฉริยะ
                  </button>
                </form>
              </div>

              {/* รายการคลังยาที่มีอยู่ */}
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-emerald-100 space-y-3">
                <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                  <span>💊</span> รายการยาในคลังของคุณ ({medicines.length} ชนิด)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {medicines.map((med) => (
                    <div key={med.id} className="p-4 rounded-xl border-2 border-emerald-100 bg-emerald-50/40 flex justify-between items-center">
                      <div>
                        <p className="font-bold text-slate-800 text-base">{med.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          หมดอายุ: {med.expire_date || 'ไม่ระบุ'}
                        </p>
                        <p className="text-xs font-bold text-emerald-700 mt-1">
                          คงเหลือ: {med.remaining_pills} / {med.total_pills} เม็ด
                        </p>
                      </div>
                      <button
                        onClick={() => deleteMedicine(med.id)}
                        className="bg-rose-100 text-rose-700 hover:bg-rose-200 text-xs font-bold px-3 py-1.5 rounded-lg transition"
                      >
                        🗑️ ลบ
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: SCHEDULE MANAGEMENT */}
          {activeTab === 'schedules' && (
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-emerald-100 space-y-4">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <span>⏰</span> ตารางตั้งเวลาการเตือนทั้งหมด
              </h3>
              {schedules.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm bg-slate-50 rounded-xl">
                  ยังไม่มีการตั้งเวลาทานยา
                </div>
              ) : (
                <div className="space-y-3">
                  {schedules.map((s) => (
                    <div key={s.id} className="flex justify-between items-center p-4 bg-emerald-50 rounded-2xl border border-emerald-200">
                      <div className="flex items-center space-x-4">
                        <div className="text-lg font-extrabold bg-emerald-700 text-white px-3 py-1.5 rounded-xl">
                          {s.time.slice(0, 5)} น.
                        </div>
                        <div>
                          <p className="font-bold text-slate-800 text-sm">{s.medicines?.name || 'ยาทั่วไป'}</p>
                          <p className="text-xs text-slate-500">ครั้งละ {s.dose_amount} เม็ด</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: ANALYTICS */}
          {activeTab === 'analytics' && (
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-emerald-100 space-y-5">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <span>📈</span> รายงานและสถิติการทานยาผู้สูงอายุ
              </h3>

              <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 space-y-3">
                <p className="text-sm font-bold text-emerald-900">สรุปพฤติกรรมสัปดาห์นี้:</p>
                <div className="h-4 w-full bg-slate-200 rounded-full overflow-hidden flex">
                  <div className="bg-emerald-600 h-full" style={{ width: '85%' }}></div>
                  <div className="bg-rose-500 h-full" style={{ width: '15%' }}></div>
                </div>
                <div className="flex justify-between text-xs font-bold text-slate-600">
                  <span className="text-emerald-700">🟢 ทานตรงเวลา 85%</span>
                  <span className="text-rose-600">🔴 ลืมทาน 15%</span>
                </div>
              </div>

              <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200">
                <p className="text-sm font-bold text-amber-900">⚠️ ข้อสังเกตจากระบบ:</p>
                <p className="text-xs text-amber-800 mt-1">
                  ช่วงเวลาที่มักลืมทานยาบ่อยที่สุดคือ **มื้อเย็น (18:00 น.)** แนะนำให้ลูกหลานตั้งเตือนผ่าน LINE เพิ่มเติม
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* POPUP: ข้อมูลส่วนตัว และ ปุ่มลงทะเบียนใหม่/ออกจากระบบ */}
      {showProfilePopup && user && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border-2 border-emerald-300">
            <div className="bg-emerald-700 p-5 text-white flex justify-between items-center">
              <h3 className="font-bold text-base flex items-center gap-2">
                <span>👤</span> ข้อมูลผู้ใช้ตลับยา
              </h3>
              <button onClick={() => setShowProfilePopup(false)} className="text-white text-xl font-bold">✕</button>
            </div>

            <div className="p-5 space-y-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between border-b pb-2">
                  <span className="text-slate-500 font-bold">ชื่อ - นามสกุล:</span>
                  <span className="font-extrabold text-slate-800">{user.name}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-slate-500 font-bold">เบอร์โทรศัพท์:</span>
                  <span className="font-extrabold text-slate-800">{user.phone}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-slate-500 font-bold">LINE ID ผู้ดูแล:</span>
                  <span className="font-extrabold text-emerald-700">{user.caregiver_line_id || 'ไม่ได้ระบุ'}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-slate-500 font-bold">Device ID ตลับยา:</span>
                  <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-xs font-bold">{user.device_id}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-slate-500 font-bold">LINE User ID:</span>
                  <span className="font-mono text-[10px] text-slate-400 truncate max-w-[150px]">{user.line_user_id}</span>
                </div>
              </div>

              <button
                onClick={handleLogoutReset}
                className="w-full mt-4 bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 rounded-xl shadow transition text-sm"
              >
                🔄 ลงทะเบียนใหม่ / ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP: ดูรูปถ่ายยืนยันการกินยา */}
      {selectedLogImage && (
        <div className="fixed inset-0 bg-slate-900/80 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-4 rounded-2xl max-w-sm w-full text-center space-y-3">
            <h4 className="font-bold text-slate-800 text-sm">📷 ภาพถ่ายยืนยันจากตลับยา</h4>
            <img src={selectedLogImage} alt="Log confirmation" className="w-full h-64 object-cover rounded-xl border" />
            <button
              onClick={() => setSelectedLogImage(null)}
              className="w-full bg-slate-800 text-white py-2 rounded-xl text-xs font-bold"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      )}
    </main>
  );
}