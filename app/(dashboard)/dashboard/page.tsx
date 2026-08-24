'use client';

import { useEffect, useState } from 'react';
import { Clock, CheckCircle2, RefreshCw, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ensureLineSession } from '@/lib/line';

interface LogItem {
  log_id: string;
  schedule_id?: string;
  status: string;
  scheduled_time: string;
  actual_time: string | null;
  schedules?: {
    dose_amount?: number;
    time?: string;
    schedule_type?: string;
    day_of_week?: string[] | string;
    interval_days?: number;
    created_at?: string;
  } | null;
  medicines?: {
    medicine_id?: string;
    name?: string;
    total_pills?: number;
  } | null;
}

export default function DashboardPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [todayLogs, setTodayLogs] = useState<LogItem[]>([]);
  const [nextDose, setNextDose] = useState<LogItem | null>(null);
  const [timeRemaining, setTimeRemaining] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    initDashboard();
  }, []);

  // 1. ยืนยัน Session และดึง User ID ล่าสุด
  const initDashboard = async () => {
    setLoading(true);
    try {
      const loggedIn = await ensureLineSession();
      if (!loggedIn) return;

      const res = await fetch('/api/me');
      if (res.ok) {
        const data = await res.json();
        if (data.user?.user_id) {
          setUserId(data.user.user_id);
          await fetchDashboardData(data.user.user_id);
          return;
        }
      }
    } catch (err) {
      console.error('Init dashboard error:', err);
    } finally {
      setLoading(false);
    }
  };

  // นับถอยหลังเวลามื้อถัดไป
  useEffect(() => {
    if (!nextDose?.scheduled_time) return;

    const updateCountdown = () => {
      const now = new Date();
      const scheduled = new Date(nextDose.scheduled_time);
      const diffMs = scheduled.getTime() - now.getTime();

      if (diffMs <= 0) {
        setTimeRemaining('ถึงเวลาทานยาแล้ว');
        return;
      }

      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

      if (hours > 0) {
        setTimeRemaining(`อีก ${hours} ชม. ${minutes} นาที`);
      } else {
        setTimeRemaining(`อีก ${minutes} นาที`);
      }
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 60000);
    return () => clearInterval(timer);
  }, [nextDose?.scheduled_time]);

  // ตัวตรวจสอบว่า Schedule นี้ต้องทานวันนี้หรือไม่
  const isScheduleForToday = (sch: any, today: Date) => {
    const type = sch.schedule_type || 'daily';

    if (type === 'daily') return true;

    if (type === 'weekly') {
      const daysMap = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const todayDayName = daysMap[today.getDay()];

      const selectedDays = Array.isArray(sch.day_of_week)
        ? sch.day_of_week
        : typeof sch.day_of_week === 'string'
        ? JSON.parse(sch.day_of_week || '[]')
        : [];

      return selectedDays.includes(todayDayName);
    }

    if (type === 'interval') {
      const interval = sch.interval_days || 1;
      const createdDate = sch.created_at ? new Date(sch.created_at) : today;
      const diffTime = Math.abs(today.getTime() - createdDate.getTime());
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      return diffDays % interval === 0;
    }

    return true;
  };

  const fetchDashboardData = async (currentUserId: string) => {
    try {
      const { data: scheduleData } = await supabase
        .from('schedules')
        .select(`
          schedule_id,
          dose_amount,
          time,
          schedule_type,
          day_of_week,
          interval_days,
          created_at,
          medicines (
            medicine_id,
            name,
            total_pills,
            user_id
          )
        `)
        .eq('active', true);

      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const todayStr = `${year}-${month}-${day}`;

      const { data: logsData } = await supabase
        .from('logs')
        .select('*')
        .eq('user_id', currentUserId)
        .gte('scheduled_time', `${todayStr}T00:00:00`)
        .lte('scheduled_time', `${todayStr}T23:59:59`);

      if (scheduleData && scheduleData.length > 0) {
        // กรอง Schedule ที่เป็นของผู้ใช้ปัจจุบันและเป็นของวันนี้
        const userSchedules = scheduleData.filter((sch: any) => {
          const med = Array.isArray(sch.medicines) ? sch.medicines[0] : sch.medicines;
          return med?.user_id === currentUserId && isScheduleForToday(sch, today);
        });

        const formattedLogs: LogItem[] = userSchedules.map((s: any) => {
          const matchedLog = logsData?.find((l) => l.schedule_id === s.schedule_id);
          const medicineObj = Array.isArray(s.medicines) ? s.medicines[0] : s.medicines;

          const timeValue = s.time || '08:00';
          const formattedTime = timeValue.length === 5 ? `${timeValue}:00` : timeValue;
          const scheduledIso = `${todayStr}T${formattedTime}`;

          return {
            log_id: matchedLog?.log_id || `temp-${s.schedule_id}`,
            schedule_id: s.schedule_id,
            status: matchedLog?.status || 'pending',
            scheduled_time: matchedLog?.scheduled_time || scheduledIso,
            actual_time: matchedLog?.actual_time || null,
            schedules: {
              dose_amount: s.dose_amount,
              time: s.time,
              schedule_type: s.schedule_type,
              day_of_week: s.day_of_week,
              interval_days: s.interval_days,
            },
            medicines: medicineObj,
          };
        });

        formattedLogs.sort((a, b) => (a.schedules?.time || '').localeCompare(b.schedules?.time || ''));

        setTodayLogs(formattedLogs);

        const pending = formattedLogs.find((l) => l.status === 'pending');
        setNextDose(pending || formattedLogs[0] || null);
      } else {
        setTodayLogs([]);
        setNextDose(null);
      }
    } catch (err) {
      console.error('Unexpected Error:', err);
    }
  };

  const handleMarkAsTaken = async (logItem: LogItem) => {
    if (!logItem || !userId) return;
    const now = new Date().toISOString();

    try {
      if (logItem.log_id && !logItem.log_id.startsWith('temp-')) {
        await supabase
          .from('logs')
          .update({ status: 'taken', actual_time: now })
          .eq('log_id', logItem.log_id);
      } else if (logItem.schedule_id) {
        await supabase.from('logs').insert({
          user_id: userId,
          schedule_id: logItem.schedule_id,
          medicine_id: logItem.medicines?.medicine_id,
          status: 'taken',
          scheduled_time: logItem.scheduled_time,
          actual_time: now,
        });
      }

      if (logItem.medicines?.medicine_id && typeof logItem.medicines.total_pills === 'number') {
        const dose = logItem.schedules?.dose_amount || 1;
        const currentPills = logItem.medicines.total_pills;
        const newPills = Math.max(0, currentPills - dose);

        await supabase
          .from('medicines')
          .update({ total_pills: newPills })
          .eq('medicine_id', logItem.medicines.medicine_id);
      }

      setTodayLogs((prev) => {
        const updated = prev.map((item) =>
          item.schedule_id === logItem.schedule_id || item.log_id === logItem.log_id
            ? {
                ...item,
                status: 'taken',
                actual_time: now,
                medicines: item.medicines
                  ? {
                      ...item.medicines,
                      total_pills: Math.max(0, (item.medicines.total_pills || 0) - (item.schedules?.dose_amount || 1)),
                    }
                  : null,
              }
            : item
        );

        const nextPending = updated.find((l) => l.status === 'pending');
        setNextDose(nextPending || updated[0] || null);

        return updated;
      });
    } catch (err) {
      console.error('Mark as taken error:', err);
    }
  };

  const totalDoses = todayLogs.length;
  const takenDoses = todayLogs.filter((l) => l.status === 'taken').length;
  const remainingDoses = todayLogs.filter((l) => l.status === 'pending').length;
  const adherencePercentage = totalDoses > 0 ? Math.round((takenDoses / totalDoses) * 100) : 0;

  if (loading) {
    return (
      <div className="w-full max-w-md mx-auto py-20 flex flex-col items-center justify-center gap-2 text-slate-400 font-['Kanit']">
        <Loader2 size={32} className="animate-spin text-indigo-600" />
        <span className="text-xs">กำลังโหลดข้อมูล...</span>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto flex flex-col gap-4 font-['Kanit'] px-1 pb-8">
      {/* Overview Card */}
      <div className="bg-white border border-slate-100 rounded-[24px] p-5 shadow-sm flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-xs text-slate-800 tracking-wide uppercase">
            ภาพรวมวันนี้ (TODAY'S ADHERENCE)
          </h3>
          <button onClick={() => userId && fetchDashboardData(userId)} className="text-slate-400 hover:text-indigo-600">
            <RefreshCw size={14} />
          </button>
        </div>

        <div className="relative w-32 h-32 mx-auto flex items-center justify-center">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
            <path
              className="text-slate-100"
              strokeWidth="3.8"
              stroke="currentColor"
              fill="none"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
            <path
              className="text-indigo-600 transition-all duration-700 ease-out"
              strokeDasharray={`${adherencePercentage}, 100`}
              strokeWidth="3.8"
              strokeLinecap="round"
              stroke="currentColor"
              fill="none"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
          </svg>
          <div className="absolute flex flex-col items-center">
            <span className="font-extrabold text-2xl text-indigo-600">{adherencePercentage}%</span>
            <span className="text-[10px] text-slate-400 font-light">{takenDoses} จาก {totalDoses} มื้อ</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl flex flex-col gap-0.5">
            <span className="text-[10px] text-slate-400">รายการวันนี้</span>
            <span className="font-bold text-base text-slate-800">{totalDoses}</span>
          </div>
          <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl flex flex-col gap-0.5">
            <span className="text-[10px] text-amber-600">เหลือ</span>
            <span className="font-bold text-base text-slate-800">{remainingDoses}</span>
          </div>
          <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl flex flex-col gap-0.5">
            <span className="text-[10px] text-emerald-600">ทานยาแล้ว</span>
            <span className="font-bold text-base text-slate-800">{takenDoses}</span>
          </div>
        </div>
      </div>

      {/* Next Dose Card */}
      {nextDose ? (
        <div className="bg-[#4F46E5] text-white rounded-[28px] p-6 shadow-xl shadow-indigo-100 flex flex-col gap-5">
          <div className="flex justify-between items-center">
            <span className="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-[10px] font-bold tracking-wider uppercase">
              มื้อถัดไป ({nextDose.schedules?.time?.slice(0, 5)} น.)
            </span>
            <div className="flex items-center gap-1.5 text-white font-bold text-sm">
              <Clock size={16} />
              <span>{timeRemaining || 'ถึงเวลาทานยา'}</span>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <h3 className="font-extrabold text-2xl tracking-tight leading-none">
              {nextDose.medicines?.name || 'ระบุชื่อยา'}
            </h3>
            <p className="text-indigo-100 text-sm font-normal">
              ทานครั้งละ {nextDose.schedules?.dose_amount || 1} เม็ด
            </p>
          </div>

          <button
            onClick={() => handleMarkAsTaken(nextDose)}
            disabled={nextDose.status === 'taken'}
            className={`w-full h-12 rounded-2xl font-bold text-base transition-all shadow-sm flex items-center justify-center gap-2 ${
              nextDose.status === 'taken'
                ? 'bg-emerald-500 text-white cursor-default'
                : 'bg-white text-[#4F46E5] hover:bg-slate-50 active:scale-[0.98]'
            }`}
          >
            <CheckCircle2 size={20} />
            {nextDose.status === 'taken' ? 'ทานยาเรียบร้อยแล้ว' : 'บันทึกการทานยา'}
          </button>
        </div>
      ) : (
        <div className="bg-white border border-slate-100 rounded-[24px] p-6 text-center text-slate-400 text-xs">
          ไม่มีรายการทานยาสำหรับวันนี้
        </div>
      )}

      {/* Schedule List */}
      <div className="bg-white border border-slate-100 rounded-[24px] p-5 shadow-sm flex flex-col gap-3">
        <h4 className="font-bold text-xs text-slate-800 tracking-wide uppercase">
          ตารางทานยาวันนี้ ({todayLogs.length} รายการ)
        </h4>

        <div className="flex flex-col gap-2">
          {todayLogs.map((item) => (
            <div
              key={item.log_id || item.schedule_id}
              className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100"
            >
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${item.status === 'taken' ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-600'}`}>
                  <Clock size={18} />
                </div>
                <div className="flex flex-col">
                  <span className="font-bold text-sm text-slate-800">
                    {item.medicines?.name || 'ยาประจำกล่อง'}
                  </span>
                  <span className="text-xs text-slate-400">
                    {item.schedules?.time?.slice(0, 5)} น. • ทาน {item.schedules?.dose_amount} เม็ด
                  </span>
                </div>
              </div>

              {item.status === 'taken' ? (
                <span className="text-xs font-bold text-emerald-600 flex items-center gap-1 bg-emerald-50 px-2.5 py-1 rounded-lg">
                  <CheckCircle2 size={14} /> ทานแล้ว
                </span>
              ) : (
                <button
                  onClick={() => handleMarkAsTaken(item)}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all"
                >
                  ทานยา
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}