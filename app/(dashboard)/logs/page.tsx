'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Check, X, Loader2, Calendar } from 'lucide-react';
import { supabase, CURRENT_USER_ID } from '@/lib/supabase';

interface LogItem {
  log_id: string;
  user_id: string;
  status: string;
  scheduled_time: string;
  actual_time: string | null;
  image_url: string | null;
  schedules?: {
    dose_amount?: number;
    schedule_type?: string;
  } | null;
  medicines?: {
    name?: string;
  } | null;
}

export default function LogsPage() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date('2026-08-24'));
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeProofUrl, setActiveProofUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchLogsByDate(selectedDate);
  }, [selectedDate]);

  const fetchLogsByDate = async (dateObj: Date) => {
    setLoading(true);

    // สร้าง String ช่วงเวลา YYYY-MM-DD แบบครอบคลุมทั้งวันโดยไม่โดน Local Timezone เหลื่อม
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    const startOfUtcDay = `${dateStr}T00:00:00.000Z`;
    const endOfUtcDay = `${dateStr}T23:59:59.999Z`;

    try {
      // Query ตรงตาม Foreign Key ใน Schema: logs -> schedules และ logs -> medicines
      let { data, error } = await supabase
        .from('logs')
        .select(`
          log_id,
          user_id,
          status,
          scheduled_time,
          actual_time,
          image_url,
          schedules (
            dose_amount,
            schedule_type
          ),
          medicines (
            name
          )
        `)
        .eq('user_id', CURRENT_USER_ID)
        .gte('scheduled_time', startOfUtcDay)
        .lte('scheduled_time', endOfUtcDay)
        .order('scheduled_time', { ascending: true });

      // Fallback: หาก Join ไม่สำเร็จ ให้ดึงข้อมูลเพียวๆ จากตาราง logs
      if (error) {
        console.warn('Join query error, falling back to plain logs query:', error.message);
        const fallbackRes = await supabase
          .from('logs')
          .select('*')
          .eq('user_id', CURRENT_USER_ID)
          .gte('scheduled_time', startOfUtcDay)
          .lte('scheduled_time', endOfUtcDay)
          .order('scheduled_time', { ascending: true });

        data = fallbackRes.data as any;
      }

      setLogs((data as unknown as LogItem[]) || []);
    } catch (err) {
      console.error('Unexpected Fetch Error:', err);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  const handlePrevDay = () => {
    const prev = new Date(selectedDate);
    prev.setDate(prev.getDate() - 1);
    setSelectedDate(prev);
  };

  const handleNextDay = () => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + 1);
    setSelectedDate(next);
  };

  const formatDateTitle = (dateObj: Date) => {
    return dateObj.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const getDoseTitle = (timeStr: string) => {
    if (!timeStr) return 'Scheduled Dose';
    const date = new Date(timeStr);
    const hour = date.getUTCHours();
    if (hour < 11) return 'Morning Dose';
    if (hour < 16) return 'Midday Dose';
    return 'Evening Dose';
  };

  const formatTime12h = (timeStr: string | null) => {
    if (!timeStr) return '';
    const date = new Date(timeStr);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'UTC',
    });
  };

  return (
    <div className="w-full max-w-md mx-auto flex flex-col gap-5 font-['Kanit'] px-2 pb-10">
      {/* Header Section */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">
          Medication Logs
        </h1>
        <p className="text-xs text-slate-500 font-normal leading-relaxed">
          Daily compliance logs synchronized with physical drawer motion sensor.
        </p>
      </div>

      {/* Date Navigator */}
      <div className="flex items-center justify-between py-2">
        <button
          onClick={handlePrevDay}
          className="w-10 h-10 rounded-full border border-slate-200 bg-white flex items-center justify-center text-slate-700 hover:bg-slate-50 shadow-sm active:scale-95 transition-all"
        >
          <ChevronLeft size={20} />
        </button>

        <span className="font-bold text-base text-slate-900">
          {formatDateTitle(selectedDate)}
        </span>

        <button
          onClick={handleNextDay}
          className="w-10 h-10 rounded-full border border-slate-200 bg-white flex items-center justify-center text-slate-700 hover:bg-slate-50 shadow-sm active:scale-95 transition-all"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Logs Display */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-2 text-slate-400">
          <Loader2 size={32} className="animate-spin text-indigo-600" />
          <span className="text-xs">กำลังโหลดบันทึกการทานยา...</span>
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-white border border-slate-100 rounded-3xl p-8 flex flex-col items-center justify-center text-center gap-2 shadow-sm my-4">
          <Calendar size={36} className="text-slate-300" />
          <span className="font-bold text-sm text-slate-700">ไม่มีประวัติการทานยาในวันนี้</span>
          <span className="text-xs text-slate-400">กดลูกศรเปลี่ยนวันที่เพื่อดูข้อมูลวันอื่น</span>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {logs.map((log) => {
            const medicineName = log.medicines?.name || 'Paracetamol';
            const doseAmount = log.schedules?.dose_amount || 1;
            const doseTitle = getDoseTitle(log.scheduled_time);

            return (
              <div
                key={log.log_id}
                className="bg-white border border-slate-100/80 rounded-[28px] p-5 shadow-sm flex flex-col gap-3 transition-all"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-900 text-lg tracking-tight">
                    {doseTitle}
                  </h3>

                  {log.status === 'taken' && (
                    <span className="inline-flex items-center gap-1 bg-emerald-100/70 text-emerald-700 font-bold text-xs px-3 py-1.5 rounded-full">
                      Taken <Check size={14} className="stroke-[3]" />
                    </span>
                  )}

                  {log.status === 'late' && (
                    <span className="inline-flex items-center gap-1 bg-amber-100/70 text-amber-700 font-bold text-xs px-3 py-1.5 rounded-full">
                      Late +45m
                    </span>
                  )}

                  {log.status === 'pending' && (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 font-bold text-xs px-3 py-1.5 rounded-full">
                      Pending
                    </span>
                  )}

                  {log.status === 'missed' && (
                    <span className="inline-flex items-center gap-1 bg-rose-100/70 text-rose-600 font-bold text-xs px-3 py-1.5 rounded-full">
                      Missed <X size={14} className="stroke-[3]" />
                    </span>
                  )}
                </div>

                <p className="text-sm font-medium text-slate-400 -mt-1">
                  {log.status === 'taken'
                    ? `${medicineName} • ${doseAmount} Pills`
                    : `Scheduled: ${formatTime12h(log.scheduled_time)}`}
                </p>

                {log.image_url && (
                  <div className="mt-1 border border-slate-100 bg-slate-50/50 rounded-2xl p-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-14 h-11 rounded-xl overflow-hidden bg-slate-200 relative shrink-0">
                        <img
                          src={log.image_url}
                          alt="ESP32-CAM Proof"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-bold text-xs text-slate-900">
                          ESP32-CAM Proof
                        </span>
                        <span className="text-[11px] text-slate-400">
                          Captured at {formatTime12h(log.actual_time || log.scheduled_time)}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => setActiveProofUrl(log.image_url)}
                      className="bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all shadow-sm shadow-indigo-100"
                    >
                      View
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Proof Modal */}
      {activeProofUrl && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-4 max-w-xs w-full flex flex-col gap-3 shadow-2xl">
            <div className="flex justify-between items-center px-1">
              <span className="font-bold text-sm text-slate-800">ESP32-CAM Proof Image</span>
              <button
                onClick={() => setActiveProofUrl(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>
            <div className="w-full h-48 bg-black rounded-2xl overflow-hidden">
              <img
                src={activeProofUrl}
                alt="Proof Preview"
                className="w-full h-full object-cover"
              />
            </div>
            <button
              onClick={() => setActiveProofUrl(null)}
              className="w-full h-10 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      )}
    </div>
  );
}