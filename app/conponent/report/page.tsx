'use client';

import { useEffect, useState } from 'react';
import { BarChart3, TrendingUp, Calendar, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ensureLineSession } from '@/lib/line';

export default function ReportPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalLogs: 0,
    takenLogs: 0,
    missedLogs: 0,
    rate: 0,
  });

  useEffect(() => {
    initReport();
  }, []);

  const initReport = async () => {
    setLoading(true);
    try {
      const loggedIn = await ensureLineSession();
      if (!loggedIn) return;

      const res = await fetch('/api/me');
      if (res.ok) {
        const data = await res.json();
        const currentUserId = data.user?.user_id;
        if (currentUserId) {
          await fetchReportData(currentUserId);
        }
      }
    } catch (err) {
      console.error('Init report error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchReportData = async (currentUserId: string) => {
    const { data: logs } = await supabase
      .from('logs')
      .select('status')
      .eq('user_id', currentUserId);

    if (logs && logs.length > 0) {
      const total = logs.length;
      const taken = logs.filter((l) => l.status === 'taken').length;
      const missed = total - taken;
      const rate = Math.round((taken / total) * 100);

      setStats({
        totalLogs: total,
        takenLogs: taken,
        missedLogs: missed,
        rate,
      });
    }
  };

  if (loading) {
    return (
      <div className="w-full max-w-md mx-auto py-24 flex flex-col items-center justify-center gap-2 text-slate-400 font-['Kanit']">
        <Loader2 size={32} className="animate-spin text-indigo-600" />
        <span className="text-xs">กำลังคำนวณสถิติ...</span>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto flex flex-col gap-4 font-['Kanit'] px-1 pb-10">
      <div className="flex flex-col gap-0.5">
        <h1 className="text-xl font-bold text-slate-900">สรุปภาพรวมการทานยา</h1>
        <p className="text-xs text-slate-400 font-light">รายงานความตรงต่อเวลาและการทานยา</p>
      </div>

      <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 text-white rounded-[24px] p-6 shadow-xl flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-indigo-100 flex items-center gap-1.5">
            <TrendingUp size={16} /> อัตราการทานยาสำเร็จ
          </span>
          <span className="text-2xl font-extrabold">{stats.rate}%</span>
        </div>
        <div className="w-full bg-indigo-900/40 h-2.5 rounded-full overflow-hidden">
          <div className="bg-white h-full transition-all duration-700" style={{ width: `${stats.rate}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-slate-100 p-4 rounded-2xl flex flex-col gap-1 shadow-sm">
          <div className="flex items-center gap-2 text-emerald-600 mb-1">
            <BarChart3 size={18} />
            <span className="text-xs font-bold">ทานครบถ้วน</span>
          </div>
          <span className="text-2xl font-extrabold text-slate-800">{stats.takenLogs}</span>
          <span className="text-[10px] text-slate-400">มื้อที่ตรงเวลา</span>
        </div>

        <div className="bg-white border border-slate-100 p-4 rounded-2xl flex flex-col gap-1 shadow-sm">
          <div className="flex items-center gap-2 text-rose-500 mb-1">
            <Calendar size={18} />
            <span className="text-xs font-bold">พลาด / ข้ามมื้อ</span>
          </div>
          <span className="text-2xl font-extrabold text-slate-800">{stats.missedLogs}</span>
          <span className="text-[10px] text-slate-400">มื้อที่ไม่ได้บันทึก</span>
        </div>
      </div>
    </div>
  );
}