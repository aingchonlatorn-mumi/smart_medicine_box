'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Activity, Check, ChevronRight, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/session';
import { bangkokToday, daysBetween, humanMinutes, timeOf } from '@/lib/time';
import { MEAL_LABEL } from '@/lib/schedule';
import type { DoseSlot, AdherenceSummary } from '@/lib/schedule';
import type { Box, MealRelation, Medicine, Schedule, User } from '@/lib/types';
import { ErrorNote, Loading, STATE_STYLE } from '@/app/components/ui';
import { useApiResource } from '@/app/components/useApiResource';

interface TodayResponse {
  user: User;
  box: Box | null;
  medicine: Medicine | null;
  schedules: Schedule[];
  today: DoseSlot[];
  today_summary: AdherenceSummary;
  week_summary: AdherenceSummary;
  next_dose: {
    time: string;
    date: string;
    at: string;
    minutes_until: number;
    dose_amount: number;
    meal_relation: MealRelation;
  } | null;
  last_photo: { image_url: string | null; at: string | null; time: string } | null;
  days_left: number | null;
}

export default function DashboardPage() {
  const { data, error, loading, reload, setError } = useApiResource<TodayResponse>('/api/today');
  const [saving, setSaving] = useState(false);

  // นับเวลาถอยหลังของมื้อถัดไปให้ขยับเองทุกนาที
  useEffect(() => {
    const timer = setInterval(reload, 60_000);
    return () => clearInterval(timer);
  }, [reload]);

  const confirmDose = async () => {
    setSaving(true);
    try {
      await apiFetch('/api/doses/confirm', { method: 'POST', body: '{}' });
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  if (error && !data) return <div className="pt-6"><ErrorNote message={error} onRetry={reload} /></div>;
  if (loading || !data) return <Loading />;

  const { next_dose: next, medicine, today, today_summary: todayStat, week_summary: week } = data;
  const meal = next && next.meal_relation !== 'none' ? ` · ${MEAL_LABEL[next.meal_relation]}` : '';
  const countdown = next ? countdownLabel(next.minutes_until, next.date) : '';

  return (
    <div className="-mx-5 -mt-5">
      {/* มื้อถัดไป — ตอบคำถามเดียวว่า "ตอนนี้ต้องทานยาหรือยัง" */}
      <section className="bg-indigo-600 text-white px-6 pt-8 pb-9 flex flex-col items-center gap-5 text-center">
        {next ? (
          <div>
            <div className="text-[17px] text-indigo-200">
              {next.minutes_until <= 0 ? 'ถึงเวลาทานยาแล้ว' : 'มื้อถัดไป'}
            </div>
            <div
              className={`${
                countdown.length > 9 ? 'text-[40px]' : 'text-[64px]'
              } leading-none font-extrabold my-1.5 tracking-tight`}
            >
              {countdown}
            </div>
            <div className="text-[20px] font-semibold text-indigo-100">
              {next.time} น. · {next.dose_amount} เม็ด{meal}
            </div>
          </div>
        ) : (
          <div className="py-4">
            <div className="text-[26px] font-extrabold">ยังไม่ได้ตั้งตารางยา</div>
            <Link href="/schedule" className="mt-2 inline-block text-indigo-200 underline">
              ไปตั้งเวลาทานยา
            </Link>
          </div>
        )}

        {medicine && (
          <div className="w-full flex items-center gap-4 rounded-3xl border border-white/25 bg-white/15 p-5 text-left">
            <div className="w-[60px] h-[60px] rounded-[20px] bg-white flex items-center justify-center shrink-0 overflow-hidden">
              <Image src="/medicine1.png" alt="ยา" width={46} height={46} className="object-contain" />
            </div>
            <div>
              <div className="text-[22px] font-bold leading-tight">{medicine.name}</div>
              <div className="text-[16px] text-indigo-200">
                เหลือในกล่อง {medicine.total_pills} เม็ด
              </div>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={confirmDose}
          disabled={saving}
          className="w-full h-[72px] rounded-[22px] bg-white text-indigo-600 text-[22px] font-bold
            flex items-center justify-center gap-3 shadow-[0_10px_24px_rgba(0,0,0,.18)]
            transition active:scale-[.98] disabled:opacity-60"
        >
          {saving ? <Loader2 size={28} className="animate-spin" /> : <Check size={28} strokeWidth={2.6} />}
          ทานยาแล้ว
        </button>
        <div className="text-[14px] text-indigo-200">
          กล่องจะบันทึกและถ่ายภาพให้เองเมื่อเปิดฝา
        </div>
      </section>

      {/* ไทม์ไลน์วันนี้ */}
      <section className="bg-slate-50 rounded-t-[28px] -mt-[18px] relative pt-6 pb-5 flex flex-col gap-4">
        <div className="px-5 flex justify-between items-baseline">
          <span className="text-[17px] font-bold text-slate-900">ไทม์ไลน์วันนี้</span>
          <span className="text-[15px] font-semibold text-indigo-600">
            {todayStat.onTime + todayStat.late} จาก {todayStat.total} มื้อ · {todayStat.adherence}%
          </span>
        </div>

        {today.length > 0 ? (
          <div className="px-5 overflow-hidden">
            <div className="flex items-stretch">
              {today.map((slot, index) => (
                <TimelineNode
                  key={slot.key}
                  slot={slot}
                  first={index === 0}
                  last={index === today.length - 1}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="px-5 text-[14px] text-slate-500">วันนี้ไม่มีมื้อยาตามตาราง</div>
        )}

        <div className="px-5 flex flex-col gap-3.5">
          {data.last_photo?.image_url && (
            <div className="bg-white border border-slate-100 rounded-[22px] p-4 flex items-center gap-3.5">
              <div className="w-[66px] h-[66px] rounded-2xl overflow-hidden bg-slate-100 shrink-0">
                <Image
                  src={data.last_photo.image_url}
                  alt="ภาพจากกล่อง"
                  width={66}
                  height={66}
                  className="w-full h-full object-cover"
                  unoptimized
                />
              </div>
              <div className="flex-1">
                <div className="text-[15.5px] font-semibold">ภาพล่าสุดจากกล่อง</div>
                <div className="text-[13px] text-slate-500">
                  {data.last_photo.at ? `${timeOf(data.last_photo.at)} น.` : data.last_photo.time} · หลักฐานการเปิดฝา
                </div>
              </div>
              <ChevronRight size={22} className="text-slate-400" />
            </div>
          )}

          {medicine && data.days_left !== null && data.days_left <= 7 && (
            <Link
              href="/schedule"
              className="bg-amber-50 border border-amber-200 rounded-[22px] p-[18px] flex items-center justify-between"
            >
              <div>
                <div className="text-[16px] font-semibold text-amber-800">
                  ยาเหลือ {medicine.total_pills} เม็ด
                </div>
                <div className="text-[13.5px] text-amber-700">
                  พออีก {data.days_left} วัน · หมดอายุ {(medicine.expire_date || '-').slice(0, 7)}
                </div>
              </div>
              <span className="rounded-xl bg-amber-600 px-[15px] py-2.5 text-[14px] font-semibold text-white">
                เติมยา
              </span>
            </Link>
          )}

          <Link
            href="/reports"
            className="bg-white border border-slate-100 rounded-[22px] p-[18px] flex items-center gap-3.5"
          >
            <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Activity size={22} />
            </div>
            <div className="flex-1">
              <div className="text-[15.5px] font-semibold">
                สัปดาห์นี้ทานตรงเวลา {week.adherence}%
              </div>
              <div className="text-[13px] text-slate-500">
                สรุปส่งเข้า LINE ทุกวันอาทิตย์ 20:00
              </div>
            </div>
            <ChevronRight size={22} className="text-slate-400" />
          </Link>
        </div>
      </section>
    </div>
  );
}

/** จุดหนึ่งมื้อบนไทม์ไลน์แนวนอน */
function TimelineNode({ slot, first, last }: { slot: DoseSlot; first: boolean; last: boolean }) {
  const style = STATE_STYLE[slot.state];
  const done = slot.state === 'taken' || slot.state === 'late';

  const lineColor =
    slot.state === 'taken' ? 'bg-emerald-500'
      : slot.state === 'late' ? 'bg-amber-500'
      : slot.state === 'missed' ? 'bg-rose-300'
      : 'bg-slate-200';

  const caption =
    slot.state === 'pending'
      ? 'ถึงคิว'
      : slot.state === 'missed'
        ? 'ลืมทาน'
        : slot.state === 'late'
          ? 'ทานเลท'
          : 'ทานแล้ว';

  return (
    <div className="flex-1 flex flex-col items-center gap-2.5">
      <div className={`text-[17px] font-bold ${style.text}`}>{slot.time}</div>
      <div className="relative w-full h-[22px] flex items-center">
        {!first && <span className={`absolute left-0 right-1/2 h-1 ${lineColor}`} />}
        {!last && <span className={`absolute left-1/2 right-0 h-1 ${lineColor}`} />}
        {slot.state === 'pending' && (
          <span className="absolute left-1/2 -ml-4 w-8 h-8 rounded-full bg-indigo-600/30 animate-ping" />
        )}
        <div
          className={`relative mx-auto w-[22px] h-[22px] rounded-full border-4 border-slate-50
            flex items-center justify-center ${style.dot}`}
        >
          {done && <Check size={12} strokeWidth={3.4} className="text-white" />}
        </div>
      </div>
      <div className={`text-center text-[12.5px] leading-tight font-medium ${style.text}`}>
        {caption}
        <br />
        <span className="font-normal text-slate-400">
          {slot.actual_time ? timeOf(slot.actual_time) : slot.state === 'pending' ? 'รออยู่' : '—'}
        </span>
      </div>
    </div>
  );
}

/** ข้อความนับถอยหลังของมื้อถัดไป — สั้นพอที่จะอ่านจบในบรรทัดเดียว */
function countdownLabel(minutesUntil: number, date: string): string {
  if (minutesUntil <= 0) return 'ตอนนี้';

  const dayGap = daysBetween(bangkokToday(), date);
  if (dayGap === 1) return 'พรุ่งนี้';
  if (dayGap > 1) return `อีก ${dayGap} วัน`;

  return `อีก ${humanMinutes(minutesUntil)}`;
}
