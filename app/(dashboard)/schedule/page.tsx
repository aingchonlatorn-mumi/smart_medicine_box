'use client';

import { useState } from 'react';
import Image from 'next/image';
import {
  Calendar, Check, ChevronRight, Loader2, Lock, Pencil, Plus, Repeat, Trash2, X,
} from 'lucide-react';
import { apiFetch } from '@/lib/session';
import { MEAL_LABEL } from '@/lib/schedule';
import { DOW_KEYS, DOW_TH, DOW_TH_FULL, hhmm, thaiDate } from '@/lib/time';
import type { MealRelation, MeResponse, ScheduleType } from '@/lib/types';
import {
  Card, ErrorNote, FieldLabel, Loading, Modal, PrimaryButton, SectionTitle,
} from '@/app/components/ui';
import { useApiResource } from '@/app/components/useApiResource';

interface DoseDraft {
  schedule_id?: string;
  time: string;
  dose_amount: number;
  meal_relation: MealRelation;
}

interface Draft {
  name: string;
  total_pills: number;
  expire_date: string;
  schedule_type: ScheduleType;
  interval_days: number;
  day_of_week: string[];
  doses: DoseDraft[];
}

const TYPE_OPTIONS: Array<{ value: ScheduleType; title: string; sub: string }> = [
  { value: 'daily', title: 'ทุกวัน', sub: 'daily' },
  { value: 'weekly', title: 'รายสัปดาห์', sub: 'weekly' },
  { value: 'interval', title: 'ทุก X วัน', sub: 'interval' },
];

const MEALS: MealRelation[] = ['before', 'after', 'none'];

const EMPTY_DRAFT: Draft = {
  name: '',
  total_pills: 0,
  expire_date: '',
  schedule_type: 'daily',
  interval_days: 2,
  day_of_week: [],
  doses: [],
};

/** แปลงข้อมูลจาก /api/me เป็นค่าเริ่มต้นของฟอร์ม */
function draftFrom(me: MeResponse | null): Draft {
  if (!me) return EMPTY_DRAFT;
  const first = me.schedules[0];
  return {
    name: me.medicine?.name || '',
    total_pills: me.medicine?.total_pills ?? 0,
    expire_date: me.medicine?.expire_date?.slice(0, 10) || '',
    schedule_type: (first?.schedule_type as ScheduleType) || 'daily',
    interval_days: first?.interval_days || 2,
    day_of_week: first?.day_of_week || [],
    doses: me.schedules.map((s) => ({
      schedule_id: s.schedule_id,
      time: hhmm(s.time),
      dose_amount: s.dose_amount || 1,
      meal_relation: (s.meal_relation || 'none') as MealRelation,
    })),
  };
}

/** คำอธิบายตารางเป็นภาษาคน เช่น "ทุกวันจันทร์ · พุธ · ศุกร์" */
function describeSchedule(form: Draft, startDate?: string | null): { title: string; detail: string } {
  const perDay = form.doses.reduce((sum, d) => sum + d.dose_amount, 0);

  if (form.schedule_type === 'weekly') {
    const names = form.day_of_week
      .map((key) => DOW_TH_FULL[DOW_KEYS.findIndex((k) => k.toLowerCase() === key.slice(0, 3).toLowerCase())])
      .filter(Boolean);
    return {
      title: names.length ? `ทุกวัน${names.join(' · ')}` : 'รายสัปดาห์',
      detail: `สัปดาห์ละ ${names.length} วัน · วันละ ${form.doses.length} มื้อ · ${perDay} เม็ด/วัน`,
    };
  }

  if (form.schedule_type === 'interval') {
    return {
      title: `ทุก ๆ ${form.interval_days} วัน`,
      detail: `วันละ ${form.doses.length} มื้อ · ${perDay} เม็ด/วัน${
        startDate ? ` · เริ่ม ${thaiDate(startDate)}` : ''
      }`,
    };
  }

  return {
    title: 'ทุกวัน',
    detail: `วันละ ${form.doses.length} มื้อ · ${perDay} เม็ด/วัน`,
  };
}

export default function SchedulePage() {
  const { data, error, loading, reload, setError } = useApiResource<MeResponse>('/api/me');

  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [working, setWorking] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [refillOpen, setRefillOpen] = useState(false);
  const [refillAmount, setRefillAmount] = useState(30);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // ฟอร์มยึดค่าจาก /api/me จนกว่าผู้ใช้จะเริ่มแก้ จากนั้นใช้ draft แทน
  const [draft, setDraft] = useState<Draft | null>(null);
  // null = ตัดสินจากข้อมูลที่มี, ถ้าผู้ใช้กดแก้ไข/ยกเลิกเองค่อยบังคับโหมด
  const [modeOverride, setModeOverride] = useState<'edit' | 'summary' | null>(null);

  const form = draft ?? draftFrom(data);
  const patch = (changes: Partial<Draft>) => setDraft({ ...form, ...changes });

  const medicine = data?.medicine;
  const hasSaved = Boolean(medicine && (data?.schedules.length ?? 0) > 0);
  const mode = modeOverride ?? (hasSaved ? 'summary' : 'edit');

  // ขั้นที่ 1 ต้องครบก่อน ส่วนตั้งตารางถึงจะเปิดให้ใช้
  const medicineReady = form.name.trim().length > 0 && form.total_pills > 0;

  const updateDose = (index: number, changes: Partial<DoseDraft>) => {
    patch({ doses: form.doses.map((dose, i) => (i === index ? { ...dose, ...changes } : dose)) });
  };

  const addDose = () => {
    patch({ doses: [...form.doses, { time: '20:00', dose_amount: 1, meal_relation: 'none' }] });
    setActiveIndex(form.doses.length);
  };

  const removeDose = (index: number) => {
    patch({ doses: form.doses.filter((_, i) => i !== index) });
    setActiveIndex(0);
  };

  const toggleDay = (key: string) => {
    patch({
      day_of_week: form.day_of_week.includes(key)
        ? form.day_of_week.filter((d) => d !== key)
        : [...form.day_of_week, key],
    });
  };

  const save = async () => {
    setSaving(true);
    setError('');
    setNotice('');

    try {
      if (!medicineReady) throw new Error('กรุณากรอกชื่อยาและจำนวนเม็ดให้ครบก่อน');
      if (!form.doses.length) throw new Error('กรุณาเพิ่มอย่างน้อย 1 มื้อ');

      const { medicine: saved } = await apiFetch<{ medicine: { medicine_id: string } }>(
        '/api/medicines',
        {
          method: 'PUT',
          body: JSON.stringify({
            medicine_id: medicine?.medicine_id,
            name: form.name.trim(),
            total_pills: form.total_pills,
            expire_date: form.expire_date || null,
          }),
        },
      );

      await apiFetch('/api/schedules', {
        method: 'PUT',
        body: JSON.stringify({
          medicine_id: saved.medicine_id,
          schedule_type: form.schedule_type,
          interval_days: form.interval_days,
          day_of_week: form.day_of_week,
          doses: form.doses,
        }),
      });

      setDraft(null);
      setModeOverride('summary');
      setNotice('บันทึกตารางเรียบร้อยแล้ว');
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const refill = async () => {
    if (!medicine || refillAmount <= 0) return;
    setWorking(true);
    try {
      await apiFetch('/api/medicines', {
        method: 'POST',
        body: JSON.stringify({ medicine_id: medicine.medicine_id, amount: refillAmount }),
      });
      setRefillOpen(false);
      setNotice(`เติมยาเพิ่ม ${refillAmount} เม็ดแล้ว`);
      setDraft(null);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เติมยาไม่สำเร็จ');
    } finally {
      setWorking(false);
    }
  };

  const removeAll = async () => {
    if (!medicine) return;
    setWorking(true);
    try {
      await apiFetch(`/api/medicines?medicine_id=${medicine.medicine_id}`, { method: 'DELETE' });
      setDeleteOpen(false);
      setDraft(null);
      setModeOverride('edit');
      setNotice('ลบข้อมูลยาและตารางแล้ว');
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ลบไม่สำเร็จ');
    } finally {
      setWorking(false);
    }
  };

  if (loading && !data) return <Loading />;

  const totalPills = medicine?.total_pills ?? form.total_pills;
  const perDayPills = form.doses.reduce((sum, d) => sum + d.dose_amount, 0);
  const daysLeft = perDayPills ? Math.floor(totalPills / perDayPills) : null;
  const capacity = Math.max(totalPills, 30);
  const lowStock = daysLeft !== null && daysLeft <= 7;
  const summary = describeSchedule(form, data?.schedules[0]?.start_date);

  return (
    <div className="flex flex-col gap-4">
      <SectionTitle>ยาและตารางทานยา</SectionTitle>

      {error && <ErrorNote message={error} />}
      {notice && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[14px] font-medium text-emerald-700">
          {notice}
        </div>
      )}

      {mode === 'summary' && medicine ? (
        /* ---------------- หน้าสรุปตาราง ---------------- */
        <>
          <Card className="!p-5 flex flex-col gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-14 h-14 rounded-[18px] bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                <Image src="/medicine1.png" alt="ยา" width={38} height={38} className="object-contain" />
              </div>
              <div className="flex-1">
                <div className="text-[20px] font-bold leading-tight text-slate-900">
                  {medicine.name}
                </div>
                <div className="text-[13.5px] text-slate-500">
                  หมดอายุ {thaiDate(medicine.expire_date)}
                </div>
              </div>
            </div>

            <div className="rounded-[20px] bg-slate-50 border border-slate-100 p-4 flex items-center gap-3.5">
              <div className="flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-[26px] font-extrabold ${lowStock ? 'text-amber-700' : 'text-slate-900'}`}>
                    {totalPills}
                  </span>
                  <span className="text-[13px] text-slate-500">เม็ดในกล่อง</span>
                </div>
                <div className="mt-2 h-2.5 rounded-full bg-slate-200/70 overflow-hidden">
                  <div
                    className={`h-2.5 rounded-full ${lowStock ? 'bg-amber-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(100, Math.round((totalPills / capacity) * 100))}%` }}
                  />
                </div>
                <div className={`mt-1.5 text-[12.5px] ${lowStock ? 'text-amber-700' : 'text-slate-500'}`}>
                  {lowStock ? 'ใกล้หมด · ' : ''}
                  {daysLeft !== null ? `พออีก ${daysLeft} วัน` : 'ยังไม่ได้ตั้งตาราง'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setRefillAmount(30); setRefillOpen(true); }}
                className="shrink-0 rounded-2xl bg-indigo-600 px-4 py-3 text-[14px] font-semibold text-white active:scale-[.98] transition"
              >
                เติมยา
              </button>
            </div>
          </Card>

          <Card className="!p-5 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                {form.schedule_type === 'interval' ? <Repeat size={22} /> : <Calendar size={22} />}
              </div>
              <div>
                <div className="text-[18px] font-bold leading-tight text-slate-900">
                  {summary.title}
                </div>
                <div className="text-[13px] text-slate-500">{summary.detail}</div>
              </div>
            </div>

            {form.schedule_type === 'weekly' && (
              <div className="flex justify-between gap-1.5">
                {DOW_KEYS.map((key, index) => {
                  const active = form.day_of_week.some(
                    (d) => d.slice(0, 3).toLowerCase() === key.toLowerCase(),
                  );
                  return (
                    <span
                      key={key}
                      className={`flex-1 h-10 rounded-xl text-[14px] font-semibold flex items-center justify-center ${
                        active ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-300'
                      }`}
                    >
                      {DOW_TH[index]}
                    </span>
                  );
                })}
              </div>
            )}

            <div className="flex flex-col gap-2.5">
              {form.doses.map((dose, index) => (
                <div
                  key={index}
                  className="rounded-[18px] border border-slate-100 bg-slate-50 px-4 py-3.5 flex items-center gap-3.5"
                >
                  <span className="w-8 h-8 rounded-full bg-white border border-slate-200 text-[13px] font-bold text-indigo-600 flex items-center justify-center shrink-0">
                    {index + 1}
                  </span>
                  <span className="text-[24px] font-bold text-slate-900 tabular-nums">
                    {dose.time}
                  </span>
                  <span className="ml-auto text-right text-[13px] leading-tight text-slate-500">
                    {dose.dose_amount} เม็ด
                    <br />
                    <span className="text-slate-400">{MEAL_LABEL[dose.meal_relation]}</span>
                  </span>
                </div>
              ))}
            </div>

            <p className="text-[12.5px] leading-relaxed text-slate-400">
              เมื่อถึงเวลาแต่ละมื้อ ระบบจะส่ง LINE แจ้งเตือนอัตโนมัติ
              และบันทึกให้เองเมื่อเปิดฝากล่อง
            </p>
          </Card>

          <div className="flex gap-2.5 pb-2">
            <PrimaryButton onClick={() => setModeOverride('edit')} className="flex-1">
              <Pencil size={20} /> แก้ไข
            </PrimaryButton>
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="w-[60px] h-[60px] rounded-[20px] border border-rose-200 bg-white text-rose-600 flex items-center justify-center active:scale-[.98] transition"
              aria-label="ลบข้อมูลยาและตาราง"
            >
              <Trash2 size={22} />
            </button>
          </div>
        </>
      ) : (
        /* ---------------- โหมดกรอก/แก้ไข ---------------- */
        <>
          {/* ขั้นที่ 1 · ข้อมูลยา */}
          <Card className="flex flex-col gap-[15px]">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-[14px] font-semibold text-slate-700">
                <StepBadge active>1</StepBadge> ข้อมูลยาในกล่อง
              </span>
              {medicineReady && (
                <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-semibold text-emerald-700">
                  <Check size={13} /> ครบแล้ว
                </span>
              )}
            </div>

            <div className="flex flex-col gap-[7px]">
              <FieldLabel>ชื่อยา</FieldLabel>
              <div className="h-14 rounded-[18px] flex items-center gap-3 px-3.5 bg-white border-2 border-slate-200 focus-within:border-indigo-600 focus-within:ring-4 focus-within:ring-indigo-50 transition">
                <Image src="/medicine1.png" alt="ยา" width={34} height={34} className="object-contain" />
                <input
                  value={form.name}
                  onChange={(e) => patch({ name: e.target.value })}
                  placeholder="เช่น Metformin 500"
                  className="flex-1 bg-transparent text-[18px] font-semibold text-slate-900 outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="flex flex-col gap-[7px]">
                <FieldLabel>จำนวนเม็ดในกล่อง</FieldLabel>
                <div className="h-14 rounded-[18px] border-2 border-slate-200 bg-white flex items-center justify-between px-3.5 focus-within:border-indigo-600 focus-within:ring-4 focus-within:ring-indigo-50 transition">
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={form.total_pills || ''}
                    onChange={(e) => patch({ total_pills: Math.max(0, Number(e.target.value)) })}
                    placeholder="0"
                    className="w-full bg-transparent text-[20px] font-bold text-slate-900 outline-none"
                  />
                  <span className="text-[13px] text-slate-400">เม็ด</span>
                </div>
              </div>
              <div className="flex flex-col gap-[7px]">
                <FieldLabel>วันหมดอายุ</FieldLabel>
                <label className="h-14 rounded-[18px] border-2 border-slate-200 bg-white flex items-center justify-between px-3.5 focus-within:border-indigo-600 transition">
                  <input
                    type="date"
                    value={form.expire_date}
                    onChange={(e) => patch({ expire_date: e.target.value })}
                    className="w-full bg-transparent text-[15px] font-semibold text-slate-900 outline-none"
                  />
                  <Calendar size={18} className="text-slate-400 shrink-0" />
                </label>
              </div>
            </div>
          </Card>

          {/* ขั้นที่ 2 · ตาราง — จาง/กดไม่ได้จนกว่าขั้นที่ 1 จะครบ */}
          {!medicineReady && (
            <div className="flex items-center gap-2.5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3.5 text-[13.5px] leading-relaxed text-slate-500">
              <Lock size={18} className="shrink-0 text-slate-400" />
              <span>
                กรอก <b className="text-slate-700">ชื่อยา</b> และ{' '}
                <b className="text-slate-700">จำนวนเม็ด</b> ให้ครบก่อน
                แล้วส่วนตั้งตารางด้านล่างจะเปิดให้ตั้งเวลา
              </span>
            </div>
          )}

          <fieldset
            disabled={!medicineReady}
            className={`m-0 flex flex-col gap-4 border-0 p-0 transition-opacity duration-300 ${
              medicineReady ? 'opacity-100' : 'opacity-40'
            }`}
          >
            <Card className="flex flex-col gap-3.5">
              <span className="flex items-center gap-2 text-[14px] font-semibold text-slate-700">
                <StepBadge active={medicineReady}>2</StepBadge> ประเภทตารางเวลา
              </span>

              <div className="grid grid-cols-3 gap-2">
                {TYPE_OPTIONS.map((option) => {
                  const active = form.schedule_type === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => patch({ schedule_type: option.value })}
                      className={`rounded-2xl px-2 py-3.5 text-center transition ${
                        active
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-50 border border-slate-200 text-slate-600'
                      }`}
                    >
                      <div className="text-[15px] font-bold leading-tight">{option.title}</div>
                      <div className={`text-[11.5px] ${active ? 'opacity-80' : 'text-slate-400'}`}>
                        {option.sub}
                      </div>
                    </button>
                  );
                })}
              </div>

              {form.schedule_type === 'weekly' && (
                <div className="flex justify-between gap-1.5">
                  {DOW_KEYS.map((key, index) => {
                    const active = form.day_of_week.includes(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleDay(key)}
                        className={`flex-1 h-12 rounded-2xl text-[14px] font-semibold transition ${
                          active
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-50 border border-slate-200 text-slate-500'
                        }`}
                      >
                        {DOW_TH[index]}
                      </button>
                    );
                  })}
                </div>
              )}

              {form.schedule_type === 'interval' && (
                <div className="flex items-center gap-3 rounded-2xl bg-slate-50 border border-slate-200 p-3.5">
                  <span className="text-[15px] text-slate-600">ทานทุก ๆ</span>
                  <input
                    type="number"
                    min={1}
                    value={form.interval_days}
                    onChange={(e) => patch({ interval_days: Math.max(1, Number(e.target.value)) })}
                    className="w-20 h-12 rounded-xl border border-slate-200 bg-white text-center text-[20px] font-bold outline-none"
                  />
                  <span className="text-[15px] text-slate-600">วัน</span>
                </div>
              )}

              {form.schedule_type === 'daily' && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3.5 text-[13.5px] leading-relaxed text-slate-500">
                  เลือก <b className="text-slate-700">ทุกวัน</b> อยู่ — ระบบจะเตือนทุกวันตามเวลาที่ตั้งไว้ด้านล่าง
                </div>
              )}
            </Card>

            <Card className="flex flex-col gap-3.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-[14px] font-semibold text-slate-700">
                  <StepBadge active={medicineReady}>3</StepBadge> มื้อยา ({form.doses.length} มื้อ)
                </span>
                <button
                  type="button"
                  onClick={addDose}
                  className="flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1.5 text-[13px] font-semibold text-indigo-600"
                >
                  <Plus size={14} /> เพิ่มมื้อ
                </button>
              </div>

              {form.doses.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-[14px] text-slate-500">
                  ยังไม่มีมื้อยา กด &quot;เพิ่มมื้อ&quot; เพื่อเริ่มตั้งเวลา
                </div>
              )}

              {form.doses.map((dose, index) =>
                index === activeIndex ? (
                  <div
                    key={index}
                    className="rounded-[20px] border border-indigo-100 bg-indigo-50/40 p-4 flex flex-col gap-3.5"
                  >
                    <div className="flex items-center justify-between">
                      <input
                        type="time"
                        value={dose.time}
                        onChange={(e) => updateDose(index, { time: e.target.value })}
                        className="bg-transparent text-[34px] font-extrabold tracking-tight text-slate-900 outline-none"
                      />
                      <div className="flex items-center gap-2.5">
                        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
                          <span className="text-[13px] text-slate-500">เม็ด</span>
                          <input
                            type="number"
                            min={1}
                            value={dose.dose_amount}
                            onChange={(e) =>
                              updateDose(index, { dose_amount: Math.max(1, Number(e.target.value)) })
                            }
                            className="w-8 bg-transparent text-center text-[17px] font-bold outline-none"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeDose(index)}
                          className="w-10 h-10 rounded-[13px] border border-rose-200 bg-white text-rose-600 flex items-center justify-center"
                        >
                          <Trash2 size={19} />
                        </button>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      {MEALS.map((meal) => {
                        const active = dose.meal_relation === meal;
                        return (
                          <button
                            key={meal}
                            type="button"
                            onClick={() => updateDose(index, { meal_relation: meal })}
                            className={`flex-1 h-[46px] rounded-[13px] text-[14.5px] transition ${
                              active
                                ? 'bg-indigo-600 text-white font-semibold'
                                : 'bg-white border border-slate-200 text-slate-600 font-medium'
                            }`}
                          >
                            {MEAL_LABEL[meal]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setActiveIndex(index)}
                    className="rounded-[20px] border border-slate-100 bg-slate-50 px-4 py-[15px] flex items-center justify-between text-left"
                  >
                    <div>
                      <div className="text-[24px] font-bold text-slate-900">{dose.time}</div>
                      <div className="text-[13px] text-slate-500">
                        {dose.dose_amount} เม็ด · {MEAL_LABEL[dose.meal_relation]}
                      </div>
                    </div>
                    <ChevronRight size={22} className="text-slate-400" />
                  </button>
                ),
              )}
            </Card>
          </fieldset>

          <div className="flex gap-2.5">
            <PrimaryButton
              onClick={save}
              disabled={saving || !medicineReady || !form.doses.length}
              className="flex-1"
            >
              {saving ? <Loader2 size={22} className="animate-spin" /> : <Check size={22} />}
              บันทึกตาราง
            </PrimaryButton>
            {hasSaved && (
              <button
                type="button"
                onClick={() => { setDraft(null); setModeOverride('summary'); setError(''); }}
                className="w-[60px] h-[60px] rounded-[20px] border border-slate-200 bg-white text-slate-500 flex items-center justify-center"
                aria-label="ยกเลิก"
              >
                <X size={24} />
              </button>
            )}
          </div>

          <p className="pb-2 text-center text-[12.5px] leading-relaxed text-slate-400">
            บันทึกแล้วจะเห็นเป็นหน้าสรุปตาราง แก้ไขหรือลบภายหลังได้ตลอด
          </p>
        </>
      )}

      {/* popup เติมยา — บวกเพิ่มจากจำนวนที่เหลืออยู่ */}
      <Modal open={refillOpen} title="เติมยาเข้ากล่อง" onClose={() => setRefillOpen(false)}>
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3 text-[14px] text-slate-600">
            ตอนนี้เหลือ <b className="text-slate-900">{totalPills}</b> เม็ด
          </div>

          <label className="flex flex-col gap-2">
            <span className="text-[13.5px] font-semibold text-slate-700">จำนวนที่เติมเพิ่ม</span>
            <div className="h-16 rounded-[20px] border-2 border-indigo-600 ring-4 ring-indigo-50 bg-white flex items-center px-5">
              <input
                type="number"
                min={1}
                inputMode="numeric"
                autoFocus
                value={refillAmount || ''}
                onChange={(e) => setRefillAmount(Math.max(0, Number(e.target.value)))}
                className="w-full bg-transparent text-[26px] font-extrabold text-slate-900 outline-none"
              />
              <span className="text-[14px] text-slate-400">เม็ด</span>
            </div>
          </label>

          <div className="flex gap-2">
            {[10, 20, 30, 60].map((amount) => (
              <button
                key={amount}
                type="button"
                onClick={() => setRefillAmount(amount)}
                className={`flex-1 h-11 rounded-2xl text-[15px] font-semibold transition ${
                  refillAmount === amount
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-50 border border-slate-200 text-slate-600'
                }`}
              >
                +{amount}
              </button>
            ))}
          </div>

          <div className="rounded-2xl bg-indigo-50 px-4 py-3 text-center text-[15px] font-semibold text-indigo-700">
            หลังเติมจะมีทั้งหมด {totalPills + refillAmount} เม็ด
            {perDayPills > 0 && ` · พออีก ${Math.floor((totalPills + refillAmount) / perDayPills)} วัน`}
          </div>

          <PrimaryButton onClick={refill} disabled={working || refillAmount <= 0}>
            {working ? <Loader2 size={22} className="animate-spin" /> : <Plus size={22} />}
            ยืนยันการเติมยา
          </PrimaryButton>
        </div>
      </Modal>

      {/* popup ยืนยันการลบ */}
      <Modal open={deleteOpen} title="ลบข้อมูลยาและตาราง" onClose={() => setDeleteOpen(false)}>
        <div className="flex flex-col gap-4">
          <p className="text-[15px] leading-relaxed text-slate-600">
            จะลบ <b className="text-slate-900">{medicine?.name}</b> พร้อมตารางทานยาทั้งหมด
            {form.doses.length > 0 && ` (${form.doses.length} มื้อ)`} ออกจากกล่อง
            <br />
            <span className="text-slate-400">ประวัติการทานยาที่ผ่านมายังเก็บไว้เหมือนเดิม</span>
          </p>

          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => setDeleteOpen(false)}
              className="flex-1 h-[56px] rounded-[20px] border border-slate-200 bg-white text-[16px] font-semibold text-slate-600"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={removeAll}
              disabled={working}
              className="flex-1 h-[56px] rounded-[20px] bg-rose-600 text-[16px] font-bold text-white flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {working ? <Loader2 size={20} className="animate-spin" /> : <Trash2 size={20} />}
              ลบเลย
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/** ตัวเลขบอกขั้นตอนหน้าหัวข้อ */
function StepBadge({ children, active }: { children: React.ReactNode; active: boolean }) {
  return (
    <span
      className={`w-[22px] h-[22px] rounded-full text-[12px] font-bold flex items-center justify-center ${
        active ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'
      }`}
    >
      {children}
    </span>
  );
}
