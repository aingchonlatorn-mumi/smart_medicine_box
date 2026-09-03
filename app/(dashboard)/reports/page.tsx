'use client';

import { useState } from 'react';
import { Download, Share2 } from 'lucide-react';
import type { AdherenceSummary } from '@/lib/schedule';
import { DOW_TH, thaiDayMonth } from '@/lib/time';
import type { Box, DoseState, Medicine, User } from '@/lib/types';
import { Card, ErrorNote, Loading, SectionTitle } from '@/app/components/ui';
import { useApiResource } from '@/app/components/useApiResource';

interface ReportResponse {
  days: number;
  range: { start: string; end: string };
  summary: AdherenceSummary;
  delta: number;
  weekly: Array<{ dow: number; rate: number } & AdherenceSummary>;
  timeline: Array<{ date: string; states: DoseState[] }>;
  medicine: Medicine | null;
  user: User;
  box: Box | null;
}

const STATE_BAR: Record<DoseState, string> = {
  taken: 'bg-emerald-500',
  late: 'bg-amber-500',
  missed: 'bg-rose-400',
  pending: 'bg-slate-200',
};

export default function ReportsPage() {
  const [days, setDays] = useState<7 | 30>(7);
  const { data, error, loading, reload } = useApiResource<ReportResponse>(`/api/reports?days=${days}`);

  const share = async () => {
    if (!data) return;
    const text =
      `รายงานการทานยา ${thaiDayMonth(data.range.start)}–${thaiDayMonth(data.range.end)}\n` +
      `${data.user.name} · กล่อง ${data.box?.box_serial || '-'}\n` +
      `ทานตรงเวลา ${data.summary.adherence}% (${data.summary.onTime + data.summary.late}/${data.summary.total} มื้อ)\n` +
      `ตรงเวลา ${data.summary.onTime} · เลท ${data.summary.late} · ลืม ${data.summary.missed}`;

    if (navigator.share) {
      await navigator.share({ title: 'รายงานการทานยา', text }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(text);
      alert('คัดลอกสรุปรายงานแล้ว');
    }
  };

  if (error && !data) return <div className="pt-6"><ErrorNote message={error} onRetry={reload} /></div>;
  if (loading || !data) return <Loading />;

  const { summary } = data;
  const taken = summary.onTime + summary.late;

  return (
    <div className="flex flex-col gap-4">
      <SectionTitle>รายงานการทานยา</SectionTitle>

      <div className="flex gap-2 rounded-2xl bg-slate-200/60 p-[5px]">
        {([7, 30] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setDays(value)}
            className={`flex-1 rounded-xl py-2.5 text-[15px] transition ${
              days === value
                ? 'bg-white font-bold text-indigo-600 shadow-sm'
                : 'font-medium text-slate-500'
            }`}
          >
            {value} วัน
          </button>
        ))}
      </div>

      {/* Adherence rate */}
      <Card className="!p-[22px] flex flex-col gap-[18px]">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[13.5px] text-slate-500">Adherence Rate</div>
            <div className="flex items-baseline gap-2">
              <span className="text-[48px] leading-none font-extrabold text-indigo-600">
                {summary.adherence}%
              </span>
              {data.delta !== 0 && (
                <span
                  className={`text-[14px] font-semibold ${
                    data.delta > 0 ? 'text-emerald-600' : 'text-rose-500'
                  }`}
                >
                  {data.delta > 0 ? '+' : ''}{data.delta}%
                </span>
              )}
            </div>
          </div>
          <div className="relative w-[92px] h-[92px] flex items-center justify-center">
            <svg viewBox="0 0 36 36" className="w-[92px] h-[92px] -rotate-90">
              <circle cx="18" cy="18" r="15.9155" fill="none" stroke="#f1f5f9" strokeWidth="4" />
              <circle
                cx="18" cy="18" r="15.9155" fill="none" stroke="#4f46e5" strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={`${summary.adherence} 100`}
              />
            </svg>
            <span className="absolute text-[13px] font-semibold text-slate-500">
              {taken}/{summary.total}
            </span>
          </div>
        </div>

        <div className="flex items-end gap-1.5 h-[78px]">
          {data.weekly.map((day, index) => {
            const height = Math.max(10, Math.round(day.rate * 62));
            const color =
              day.total === 0 ? 'bg-slate-200'
                : day.rate >= 0.99 ? 'bg-emerald-500'
                : day.rate >= 0.5 ? 'bg-amber-500'
                : 'bg-rose-400';
            return (
              <div key={index} className="flex-1 flex flex-col items-center gap-[7px]">
                <div className={`w-full rounded-[7px] ${color}`} style={{ height }} />
                <span className="text-[11.5px] text-slate-400">{DOW_TH[day.dow]}</span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* สรุปสามช่อง */}
      <div className="grid grid-cols-3 gap-2.5">
        <StatCard color="bg-emerald-500" border="border-emerald-100" text="text-emerald-700" value={summary.onTime} label="ตรงเวลา" />
        <StatCard color="bg-amber-500" border="border-amber-200" text="text-amber-700" value={summary.late} label="ทานเลท" />
        <StatCard color="bg-rose-400" border="border-rose-200" text="text-rose-700" value={summary.missed} label="ลืมทาน" />
      </div>

      {/* บันทึกสำหรับแพทย์ */}
      <Card className="!p-5 flex flex-col gap-[15px]">
        <div className="flex items-baseline justify-between">
          <span className="text-[15px] font-semibold text-slate-900">บันทึกสำหรับแพทย์</span>
          <span className="text-[12.5px] text-slate-400">
            {thaiDayMonth(data.range.start)}–{thaiDayMonth(data.range.end)}
          </span>
        </div>

        <div className="flex flex-col gap-2.5">
          {data.timeline.slice(0, days === 7 ? 7 : 14).map((row) => (
            <div key={row.date} className="grid grid-cols-[64px_1fr] items-center gap-2.5">
              <span className="text-[14px] font-semibold text-slate-900">
                {thaiDayMonth(row.date)}
              </span>
              <div className="flex gap-1.5">
                {row.states.length === 0 && (
                  <span className="flex-1 h-[11px] rounded-full bg-slate-100" />
                )}
                {row.states.map((state, index) => (
                  <span key={index} className={`flex-1 h-[11px] rounded-full ${STATE_BAR[state]}`} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3.5 pt-0.5 text-[12px] text-slate-400">
          <Legend color="bg-emerald-500" label="ตรงเวลา" />
          <Legend color="bg-amber-500" label="เลท" />
          <Legend color="bg-rose-400" label="ลืม" />
          <Legend color="bg-slate-200" label="ยังไม่ถึง" />
        </div>
      </Card>

      <div className="flex gap-2.5 pb-2">
        <button
          type="button"
          onClick={() => window.print()}
          className="flex-1 h-[58px] rounded-[20px] bg-indigo-600 text-white text-[17px] font-bold
            flex items-center justify-center gap-2.5 shadow-[0_10px_22px_rgba(79,70,229,.22)]"
        >
          <Download size={22} /> ดาวน์โหลด PDF
        </button>
        <button
          type="button"
          onClick={share}
          className="w-[58px] h-[58px] rounded-[20px] border border-slate-200 bg-white text-slate-500 flex items-center justify-center"
        >
          <Share2 size={23} />
        </button>
      </div>
    </div>
  );
}

function StatCard({
  color, border, text, value, label,
}: {
  color: string; border: string; text: string; value: number; label: string;
}) {
  return (
    <div className={`bg-white border ${border} rounded-[20px] px-3.5 py-4`}>
      <div className={`w-2.5 h-2.5 rounded-full mb-2.5 ${color}`} />
      <div className={`text-[26px] font-extrabold ${text}`}>{value}</div>
      <div className="text-[12.5px] text-slate-500">{label}</div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
      {label}
    </span>
  );
}
