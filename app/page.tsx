'use client';

import React, { useState, useEffect } from 'react';
import { 
  Home, Clock, Pill, Calendar, BarChart2, Bell, 
  CheckCircle, AlertTriangle, AlertCircle, Eye, 
  Plus, Trash2, Edit2, Type, RefreshCw, Send, X, Filter
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid 
} from 'recharts';
import { supabase } from '@/lib/supabase';

// --- Interfaces ให้ตรงกับ SQL Schema ---
interface UserProfile {
  id: string; // UUID จาก Supabase
  line_user_id: string;
  name: string;
  pictureUrl?: string;
}

interface Medicine {
  id: string;
  user_id: string;
  name: string;
  total_pills: number;
  remaining_pills: number;
  expire_date: string;
}

interface Schedule {
  id: string;
  user_id: string;
  medicine_id: string;
  time: string;
  days_of_week: string[];
  dose_amount: number;
  active: boolean;
  medicines?: { name: string };
}

interface Log {
  id: string;
  user_id: string;
  scheduled_time: string;
  status: 'taken' | 'missed' | 'pending';
  image_url?: string;
  medicines?: { name: string };
}

export default function HomePage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [isLargeFont, setIsLargeFont] = useState(true);
  const [loading, setLoading] = useState(true);
  
  const [dbUser, setDbUser] = useState<UserProfile | null>(null);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);

  // Filters
  const [filterDate, setFilterDate] = useState('');
  const [filterPill, setFilterPill] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  // Modals
  const [isAddMedOpen, setIsAddMedOpen] = useState(false);
  const [editingMed, setEditingMed] = useState<Medicine | null>(null);
  const [medForm, setMedForm] = useState({ name: '', total_pills: 30, remaining_pills: 30, expire_date: '' });

  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [scheduleForm, setScheduleForm] = useState({ medicine_id: '', time: '08:00:00', dose_amount: 1, active: true });

  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [lineTestStatus, setLineTestStatus] = useState<string | null>(null);

  // 1. LIFF & Get or Create Supabase User
  useEffect(() => {
    const initApp = async () => {
      try {
        const liffModule = (await import('@line/liff')).default;
        const liffId = process.env.NEXT_PUBLIC_LIFF_ID || "2010881248-4xHWQGRQ";

        await liffModule.init({ liffId, withLoginOnExternalBrowser: true });

        if (liffModule.isLoggedIn()) {
          const profile = await liffModule.getProfile();
          await syncUserWithSupabase(profile.userId, profile.displayName, profile.pictureUrl);
        } else {
          liffModule.login();
        }
      } catch (error) {
        console.error("LIFF / Init Error:", error);
      } finally {
        setLoading(false);
      }
    };

    if (typeof window !== 'undefined') {
      initApp();
    }
  }, []);

  // Sync / Auto Register User in Supabase `users` table
  const syncUserWithSupabase = async (lineUserId: string, name: string, pictureUrl?: string) => {
    try {
      let { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('line_user_id', lineUserId)
        .maybeSingle();

      if (!user) {
        // Auto create user if not exists
        const { data: newUser, error: createError } = await supabase
          .from('users')
          .insert([{ 
            line_user_id: lineUserId, 
            name: name,
            device_id: `DEV-${lineUserId.slice(-6)}`
          }])
          .select()
          .single();

        if (createError) throw createError;
        user = newUser;
      }

      if (user) {
        const userObj = { ...user, pictureUrl };
        setDbUser(userObj);
        await fetchUserData(user.id);
      }
    } catch (err) {
      console.error("User Sync Error:", err);
    }
  };

  // Fetch Data from DB
  const fetchUserData = async (userId: string) => {
    try {
      const { data: medData } = await supabase.from('medicines').select('*').eq('user_id', userId);
      if (medData) {
        setMedicines(medData);
        if (medData.length > 0) setScheduleForm(prev => ({ ...prev, medicine_id: medData[0].id }));
      }

      const { data: schData } = await supabase
        .from('schedules')
        .select('*, medicines(name)')
        .eq('user_id', userId);
      if (schData) setSchedules(schData as any);

      const { data: logData } = await supabase
        .from('logs')
        .select('*, medicines(name)')
        .eq('user_id', userId)
        .order('scheduled_time', { ascending: false });
      if (logData) setLogs(logData as any);
    } catch (err) {
      console.error("Fetch Data Error:", err);
    }
  };

  // --- Medicine Handlers ---
  const handleSaveMedicine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dbUser) return alert("ไม่พบข้อมูลผู้ใช้");

    if (editingMed) {
      const { error } = await supabase.from('medicines').update({
        name: medForm.name,
        total_pills: medForm.total_pills,
        remaining_pills: medForm.remaining_pills,
        expire_date: medForm.expire_date || null
      }).eq('id', editingMed.id);

      if (!error) fetchUserData(dbUser.id);
    } else {
      const { error } = await supabase.from('medicines').insert([{
        user_id: dbUser.id,
        name: medForm.name,
        total_pills: medForm.total_pills,
        remaining_pills: medForm.remaining_pills,
        expire_date: medForm.expire_date || null
      }]);

      if (!error) fetchUserData(dbUser.id);
      else console.error("Insert Med Error:", error);
    }
    closeMedModal();
  };

  const handleDeleteMedicine = async (id: string) => {
    if (!confirm("คุณต้องการลบรายการยานี้ใช่หรือไม่?") || !dbUser) return;
    const { error } = await supabase.from('medicines').delete().eq('id', id);
    if (!error) fetchUserData(dbUser.id);
  };

  const openMedModal = (med?: Medicine) => {
    if (med) {
      setEditingMed(med);
      setMedForm({ name: med.name, total_pills: med.total_pills, remaining_pills: med.remaining_pills, expire_date: med.expire_date || '' });
    } else {
      setEditingMed(null);
      setMedForm({ name: '', total_pills: 30, remaining_pills: 30, expire_date: '' });
    }
    setIsAddMedOpen(true);
  };

  const closeMedModal = () => {
    setIsAddMedOpen(false);
    setEditingMed(null);
  };

  // --- Schedule Handlers ---
  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dbUser) return alert("ไม่พบข้อมูลผู้ใช้");

    const timeFormatted = scheduleForm.time.length === 5 ? `${scheduleForm.time}:00` : scheduleForm.time;

    if (editingSchedule) {
      const { error } = await supabase.from('schedules').update({
        medicine_id: scheduleForm.medicine_id,
        time: timeFormatted,
        dose_amount: scheduleForm.dose_amount,
        active: scheduleForm.active
      }).eq('id', editingSchedule.id);

      if (!error) fetchUserData(dbUser.id);
    } else {
      const { error } = await supabase.from('schedules').insert([{
        user_id: dbUser.id,
        medicine_id: scheduleForm.medicine_id,
        time: timeFormatted,
        days_of_week: ['daily'],
        dose_amount: scheduleForm.dose_amount,
        active: scheduleForm.active
      }]);

      if (!error) fetchUserData(dbUser.id);
      else console.error("Insert Schedule Error:", error);
    }
    closeScheduleModal();
  };

  const handleDeleteSchedule = async (id: string) => {
    if (!confirm("คุณต้องการลบเวลาเตือนนี้ใช่หรือไม่?") || !dbUser) return;
    const { error } = await supabase.from('schedules').delete().eq('id', id);
    if (!error) fetchUserData(dbUser.id);
  };

  const openScheduleModal = (sch?: Schedule) => {
    if (sch) {
      setEditingSchedule(sch);
      setScheduleForm({ medicine_id: sch.medicine_id, time: sch.time, dose_amount: sch.dose_amount, active: sch.active });
    } else {
      setEditingSchedule(null);
      setScheduleForm({ medicine_id: medicines[0]?.id || '', time: '08:00:00', dose_amount: 1, active: true });
    }
    setIsScheduleModalOpen(true);
  };

  const closeScheduleModal = () => {
    setIsScheduleModalOpen(false);
    setEditingSchedule(null);
  };

  // --- Test LINE Alert ---
  const handleTestLineAlert = async () => {
    setLineTestStatus('sending');
    try {
      const res = await fetch('/api/cron/check-schedule', { method: 'GET' });
      if (res.ok) setLineTestStatus('success');
      else setLineTestStatus('error');
    } catch {
      setLineTestStatus('error');
    } 
    setTimeout(() => setLineTestStatus(null), 4000);
  };

  // Calculations
  const adherenceRate = logs.length > 0 
    ? Math.round((logs.filter(l => l.status === 'taken').length / logs.length) * 100) 
    : 100;

  const lowStockCount = medicines.filter(m => m.remaining_pills <= 5).length;
  const todayStr = new Date().toISOString().split('T')[0];
  const expiringCount = medicines.filter(m => m.expire_date && m.expire_date <= todayStr).length;

  const filteredLogs = logs.filter(log => {
    const matchesDate = filterDate ? log.scheduled_time.startsWith(filterDate) : true;
    const matchesPill = filterPill !== 'all' ? log.medicines?.name === filterPill : true;
    const matchesStatus = filterStatus !== 'all' ? log.status === filterStatus : true;
    return matchesDate && matchesPill && matchesStatus;
  });

  const weeklyData = [
    { day: 'จ.', rate: 100 },
    { day: 'อ.', rate: 80 },
    { day: 'พ.', rate: 100 },
    { day: 'พฤ.', rate: 60 },
    { day: 'ศ.', rate: 100 },
    { day: 'ส.', rate: 100 },
    { day: 'อา.', rate: adherenceRate }
  ];

  const fontSizeClass = isLargeFont ? 'text-lg md:text-xl' : 'text-base';
  const headingSizeClass = isLargeFont ? 'text-2xl md:text-3xl' : 'text-xl';

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-3">
        <RefreshCw className="w-10 h-10 text-emerald-600 animate-spin" />
        <p className="text-emerald-800 font-bold text-lg">กำลังเชื่อมต่อฐานข้อมูล...</p>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-slate-50 text-slate-800 ${fontSizeClass} pb-12`}>
      {/* Header */}
      <header className="bg-emerald-600 text-white shadow-md sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            {dbUser?.pictureUrl ? (
              <img src={dbUser.pictureUrl} alt="Profile" className="w-11 h-11 rounded-full border-2 border-white shadow" />
            ) : (
              <div className="bg-white text-emerald-600 p-2 rounded-2xl shadow">
                <Pill className="w-7 h-7" />
              </div>
            )}
            <div>
              <h1 className="font-bold text-lg md:text-xl leading-tight">
                สวัสดี, {dbUser?.name || 'ผู้ใช้งาน'}
              </h1>
              <p className="text-emerald-100 text-xs">ตลับยาอัจฉริยะ Smart Pillbox</p>
            </div>
          </div>

          <button
            onClick={() => setIsLargeFont(!isLargeFont)}
            className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white px-3 py-2 rounded-xl border border-emerald-400/30 shadow-sm"
          >
            <Type className="w-5 h-5" />
            <span className="font-bold text-sm hidden sm:inline">
              {isLargeFont ? 'ขนาดอักษร: ใหญ่ (ก+)' : 'ขนาดอักษร: ปกติ'}
            </span>
          </button>
        </div>

        {/* Navigation Tabs */}
        <nav className="bg-emerald-700 border-t border-emerald-600 px-2 overflow-x-auto">
          <div className="max-w-6xl mx-auto flex gap-1 md:gap-2">
            {[
              { id: 'overview', label: 'ภาพรวม', icon: Home },
              { id: 'logs', label: 'ประวัติการกินยา', icon: Clock },
              { id: 'inventory', label: 'จัดการคลังยา', icon: Pill },
              { id: 'schedule', label: 'ตั้งเวลาเตือน', icon: Calendar },
              { id: 'analytics', label: 'สถิติ & ทดสอบ', icon: BarChart2 }
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 font-bold whitespace-nowrap transition border-b-4 ${
                    isActive
                      ? 'bg-white text-emerald-800 border-yellow-400 rounded-t-xl shadow'
                      : 'text-emerald-100 border-transparent hover:bg-emerald-600/50'
                  }`}
                >
                  <Icon className={`w-6 h-6 ${isActive ? 'text-emerald-600' : ''}`} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-4 pt-6">

        {/* 1. OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-5 rounded-3xl border-2 border-emerald-200 shadow-sm flex items-center gap-4">
                <div className="bg-emerald-100 text-emerald-700 p-4 rounded-2xl">
                  <CheckCircle className="w-10 h-10" />
                </div>
                <div>
                  <p className="text-slate-500 font-bold text-sm">กินยาตรงเวลา (Adherence)</p>
                  <p className="text-3xl font-black text-emerald-600">{adherenceRate}%</p>
                </div>
              </div>

              <div className="bg-white p-5 rounded-3xl border-2 border-amber-200 shadow-sm flex items-center gap-4">
                <div className="bg-amber-100 text-amber-600 p-4 rounded-2xl">
                  <AlertTriangle className="w-10 h-10" />
                </div>
                <div>
                  <p className="text-slate-500 font-bold text-sm">ยาใกล้หมดคลัง (&le; 5 เม็ด)</p>
                  <p className="text-3xl font-black text-amber-600">{lowStockCount} รายการ</p>
                </div>
              </div>

              <div className="bg-white p-5 rounded-3xl border-2 border-rose-200 shadow-sm flex items-center gap-4">
                <div className="bg-rose-100 text-rose-600 p-4 rounded-2xl">
                  <AlertCircle className="w-10 h-10" />
                </div>
                <div>
                  <p className="text-slate-500 font-bold text-sm">ยาหมดอายุ / ใกล้หมดอายุ</p>
                  <p className="text-3xl font-black text-rose-600">{expiringCount} รายการ</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
              <h2 className={`font-bold text-slate-800 flex items-center gap-2 ${headingSizeClass}`}>
                <Calendar className="text-emerald-600 w-8 h-8" /> ตารางการทานยาวันนี้
              </h2>

              {schedules.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <Clock className="w-12 h-12 mx-auto mb-2 opacity-40" />
                  <p>ยังไม่มีการตั้งเวลาเตือนทานยา</p>
                  <button onClick={() => setActiveTab('schedule')} className="mt-2 text-emerald-600 font-bold underline">
                    + กดเพิ่มเวลาเตือนทานยา
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {schedules.map((sch) => (
                    <div key={sch.id} className="p-4 rounded-2xl border-2 bg-slate-50 border-slate-200 flex justify-between items-center">
                      <div className="flex items-center gap-4">
                        <div className="px-4 py-2 rounded-xl font-black text-xl bg-emerald-600 text-white">
                          {sch.time.slice(0, 5)} น.
                        </div>
                        <div>
                          <p className="font-bold text-slate-800 text-lg">{sch.medicines?.name || 'รายการยา'}</p>
                          <p className="text-sm text-slate-500">ครั้งละ {sch.dose_amount} เม็ด</p>
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${sch.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                        {sch.active ? 'เปิดเตือน' : 'ปิดเตือน'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 2. HISTORY / LOGS */}
        {activeTab === 'logs' && (
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
            <h2 className={`font-bold text-slate-800 flex items-center gap-2 ${headingSizeClass}`}>
              <Clock className="text-emerald-600 w-8 h-8" /> ประวัติการกินยา
            </h2>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex items-center gap-2 font-bold text-slate-700">
                <Filter className="w-5 h-5 text-emerald-600" /> ตัวกรองค้นหา (Filter)
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">วันที่</label>
                  <input 
                    type="date" 
                    value={filterDate} 
                    onChange={(e) => setFilterDate(e.target.value)}
                    className="w-full p-2.5 rounded-xl border bg-white font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">ชื่อยา</label>
                  <select 
                    value={filterPill} 
                    onChange={(e) => setFilterPill(e.target.value)}
                    className="w-full p-2.5 rounded-xl border bg-white font-medium"
                  >
                    <option value="all">ยาทั้งหมด</option>
                    {medicines.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">สถานะ</label>
                  <select 
                    value={filterStatus} 
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="w-full p-2.5 rounded-xl border bg-white font-medium"
                  >
                    <option value="all">ทุกสถานะ</option>
                    <option value="taken">ทานแล้ว (Taken)</option>
                    <option value="missed">ไม่ได้ทาน/ลืม (Missed)</option>
                    <option value="pending">รอทาน (Pending)</option>
                  </select>
                </div>
              </div>
            </div>

            {filteredLogs.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Clock className="w-16 h-16 mx-auto mb-2 opacity-30" />
                <p>ไม่พบประวัติการกินยาตามที่ค้นหา</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b-2 border-slate-200 bg-slate-100">
                      <th className="p-3 font-bold">วัน-เวลากำหนด</th>
                      <th className="p-3 font-bold">รายการยา</th>
                      <th className="p-3 font-bold">สถานะ</th>
                      <th className="p-3 font-bold text-center">ภาพถ่ายหลักฐาน</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredLogs.map((log) => (
                      <tr key={log.id}>
                        <td className="p-3 font-medium">{new Date(log.scheduled_time).toLocaleString('th-TH')}</td>
                        <td className="p-3 font-bold text-slate-800">{log.medicines?.name || '-'}</td>
                        <td className="p-3">
                          <span className={`px-3 py-1 rounded-full font-bold text-xs ${
                            log.status === 'taken' ? 'bg-emerald-100 text-emerald-800' :
                            log.status === 'missed' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {log.status === 'taken' ? 'ทานแล้ว' : log.status === 'missed' ? 'ลืมทาน' : 'รอทาน'}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          {log.image_url ? (
                            <button 
                              onClick={() => setSelectedImage(log.image_url!)} 
                              className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-xl border border-emerald-300 font-bold text-xs inline-flex items-center gap-1"
                            >
                              <Eye className="w-4 h-4" /> ดูภาพ
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">ไม่มีภาพ</span>
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

        {/* 3. MEDICINE MANAGEMENT */}
        {activeTab === 'inventory' && (
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
            <div className="flex justify-between items-center">
              <h2 className={`font-bold text-slate-800 flex items-center gap-2 ${headingSizeClass}`}>
                <Pill className="text-emerald-600 w-8 h-8" /> จัดการคลังยาในตลับ
              </h2>
              <button 
                onClick={() => openMedModal()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-2xl flex items-center gap-2 shadow text-sm"
              >
                <Plus className="w-5 h-5" /> เพิ่มรายการยา
              </button>
            </div>

            {medicines.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Pill className="w-16 h-16 mx-auto mb-2 opacity-30" />
                <p>ยังไม่มีรายการยาในคลัง</p>
                <button onClick={() => openMedModal()} className="mt-2 text-emerald-600 font-bold underline">
                  + เพิ่มยาลงคลัง
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {medicines.map((item) => {
                  const percent = item.total_pills > 0 ? Math.round((item.remaining_pills / item.total_pills) * 100) : 0;
                  return (
                    <div key={item.id} className="p-5 rounded-3xl border-2 border-slate-200 bg-slate-50 space-y-3 relative">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-bold text-slate-800 text-xl">{item.name}</h3>
                          <p className="text-xs text-slate-500">วันหมดอายุ: {item.expire_date || 'ไม่ได้ระบุ'}</p>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => openMedModal(item)} className="p-2 text-slate-500 hover:text-emerald-600">
                            <Edit2 className="w-5 h-5" />
                          </button>
                          <button onClick={() => handleDeleteMedicine(item.id)} className="p-2 text-slate-500 hover:text-rose-600">
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-sm font-bold mb-1">
                          <span>คงเหลือ: {item.remaining_pills} / {item.total_pills} เม็ด</span>
                          <span>{percent}%</span>
                        </div>
                        <div className="w-full bg-slate-200 h-4 rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${item.remaining_pills <= 5 ? 'bg-rose-500' : 'bg-emerald-500'}`} 
                            style={{ width: `${percent}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 4. SCHEDULE MANAGEMENT */}
        {activeTab === 'schedule' && (
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
            <div className="flex justify-between items-center">
              <h2 className={`font-bold text-slate-800 flex items-center gap-2 ${headingSizeClass}`}>
                <Calendar className="text-emerald-600 w-8 h-8" /> ตั้งเวลาแจ้งเตือนทานยา
              </h2>
              <button 
                onClick={() => openScheduleModal()}
                disabled={medicines.length === 0}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold px-4 py-2.5 rounded-2xl flex items-center gap-2 shadow text-sm"
              >
                <Plus className="w-5 h-5" /> เพิ่มเวลาเตือน
              </button>
            </div>

            {medicines.length === 0 && (
              <p className="text-rose-600 text-sm font-bold bg-rose-50 p-3 rounded-xl">⚠️ กรุณาเพิ่มรายการยาในเมนู "จัดการคลังยา" ก่อนตั้งเวลาเตือน</p>
            )}

            {schedules.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Calendar className="w-16 h-16 mx-auto mb-2 opacity-30" />
                <p>ยังไม่มีการตั้งเวลาแจ้งเตือน</p>
              </div>
            ) : (
              <div className="space-y-3">
                {schedules.map((sch) => (
                  <div key={sch.id} className="p-5 rounded-3xl border-2 border-slate-200 flex justify-between items-center bg-slate-50">
                    <div className="flex items-center gap-4">
                      <div className="bg-emerald-600 text-white px-4 py-2 rounded-2xl font-black text-xl">{sch.time.slice(0, 5)} น.</div>
                      <div>
                        <span className="font-bold text-slate-800 text-lg">{sch.medicines?.name || 'รายการยา'}</span>
                        <p className="text-sm text-slate-500">รับประทานครั้งละ {sch.dose_amount} เม็ด</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => openScheduleModal(sch)} className="p-2 text-slate-500 hover:text-emerald-600">
                        <Edit2 className="w-5 h-5" />
                      </button>
                      <button onClick={() => handleDeleteSchedule(sch.id)} className="p-2 text-slate-500 hover:text-rose-600">
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 5. ANALYTICS & TEST LINE */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
              <h2 className={`font-bold text-slate-800 flex items-center gap-2 ${headingSizeClass}`}>
                <BarChart2 className="text-emerald-600 w-8 h-8" /> สถิติอัตราการกินยาตรงเวลา (%)
              </h2>

              <div className="h-64 w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip formatter={(value: any) => [`${value}%`, 'ความตรงเวลา']} />
                    <Bar dataKey="rate" fill="#10b981" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border-2 border-emerald-300 shadow-sm space-y-4">
              <h3 className="font-bold text-slate-800 text-xl flex items-center gap-2">
                <Bell className="text-emerald-600" /> ทดสอบระบบ LINE Notification Alert
              </h3>
              <p className="text-sm text-slate-600 font-medium">
                กดปุ่มด้านล่างเพื่อสั่งงาน Cron / Trigger ตรวจสอบเวลาเตือนทันที
              </p>
              
              <button
                onClick={handleTestLineAlert}
                disabled={lineTestStatus === 'sending'}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-3.5 rounded-2xl flex items-center gap-2 shadow-lg"
              >
                {lineTestStatus === 'sending' ? <RefreshCw className="animate-spin" /> : <Send />} กดทดสอบยิง LINE Alert สดๆ
              </button>
              {lineTestStatus === 'success' && <p className="text-emerald-600 font-bold">✅ ส่งข้อความเข้า LINE สำเร็จ!</p>}
              {lineTestStatus === 'error' && <p className="text-rose-600 font-bold">❌ เกิดข้อผิดพลาดในการส่ง (เช็ค API Route)</p>}
            </div>
          </div>
        )}

      </main>

      {/* MODAL: เพิ่ม/แก้ไขยา */}
      {isAddMedOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-3xl max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-xl text-slate-800">{editingMed ? 'แก้ไขรายการยา' : 'เพิ่มรายการยา'}</h3>
              <button onClick={closeMedModal}><X className="w-6 h-6 text-slate-400" /></button>
            </div>

            <form onSubmit={handleSaveMedicine} className="space-y-3 text-sm">
              <div>
                <label className="block font-bold mb-1">ชื่อยา</label>
                <input 
                  type="text" 
                  required 
                  placeholder="เช่น พาราเซตามอล" 
                  value={medForm.name}
                  onChange={(e) => setMedForm({ ...medForm, name: e.target.value })}
                  className="w-full p-3 border rounded-xl bg-slate-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold mb-1">จำนวนทั้งหมด (เม็ด)</label>
                  <input 
                    type="number" 
                    value={medForm.total_pills}
                    onChange={(e) => setMedForm({ ...medForm, total_pills: Number(e.target.value) })}
                    className="w-full p-3 border rounded-xl bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">จำนวนคงเหลือ (เม็ด)</label>
                  <input 
                    type="number" 
                    value={medForm.remaining_pills}
                    onChange={(e) => setMedForm({ ...medForm, remaining_pills: Number(e.target.value) })}
                    className="w-full p-3 border rounded-xl bg-slate-50"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold mb-1">วันหมดอายุ</label>
                <input 
                  type="date" 
                  value={medForm.expire_date}
                  onChange={(e) => setMedForm({ ...medForm, expire_date: e.target.value })}
                  className="w-full p-3 border rounded-xl bg-slate-50"
                />
              </div>

              <button type="submit" className="w-full bg-emerald-600 text-white font-bold py-3.5 rounded-xl shadow mt-2 hover:bg-emerald-700">
                บันทึกข้อมูลยา
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: เพิ่ม/แก้ไขเวลาเตือน */}
      {isScheduleModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-3xl max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-xl text-slate-800">{editingSchedule ? 'แก้ไขเวลาเตือน' : 'เพิ่มเวลาเตือน'}</h3>
              <button onClick={closeScheduleModal}><X className="w-6 h-6 text-slate-400" /></button>
            </div>

            <form onSubmit={handleSaveSchedule} className="space-y-3 text-sm">
              <div>
                <label className="block font-bold mb-1">เลือกยาที่ต้องการเตือน</label>
                <select 
                  value={scheduleForm.medicine_id}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, medicine_id: e.target.value })}
                  className="w-full p-3 border rounded-xl bg-slate-50 font-bold text-slate-800"
                >
                  {medicines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold mb-1">เวลาเตือน</label>
                  <input 
                    type="time" 
                    required 
                    value={scheduleForm.time.slice(0, 5)}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, time: e.target.value })}
                    className="w-full p-3 border rounded-xl bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">จำนวนที่ทาน (เม็ด)</label>
                  <input 
                    type="number" 
                    min={1}
                    value={scheduleForm.dose_amount}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, dose_amount: Number(e.target.value) })}
                    className="w-full p-3 border rounded-xl bg-slate-50"
                  />
                </div>
              </div>

              <button type="submit" className="w-full bg-emerald-600 text-white font-bold py-3.5 rounded-xl shadow mt-2 hover:bg-emerald-700">
                บันทึกเวลาเตือน
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ดูภาพถ่ายหลักฐาน */}
      {selectedImage && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-3xl max-w-lg w-full space-y-4">
            <h3 className="font-bold text-xl">📸 ภาพถ่ายหลักฐานการเปิดกล่อง</h3>
            <img src={selectedImage} alt="Proof" className="w-full h-auto rounded-2xl border" />
            <button onClick={() => setSelectedImage(null)} className="w-full bg-slate-800 text-white font-bold py-3 rounded-xl">ปิด</button>
          </div>
        </div>
      )}

    </div>
  );
}