'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Clock, XCircle } from 'lucide-react';
import { groupLogsByDate, type DoseSlot } from '@/lib/schedule';
import { dayLabel, humanMinutes, timeOf } from '@/lib/time';
import type { Medicine } from '@/lib/types';
import { Chip, ErrorNote, Loading, SectionTitle, StateBadge } from '@/app/components/ui';
import { useApiResource } from '@/app/components/useApiResource';

type Filter = 'all' | 'taken' | 'missed';

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'taken', label: 'ทานแล้ว' },
  { value: 'missed', label: 'ลืมทาน' },
];

export default function LogsPage() {
  const [filter, setFilter] = useState<Filter>('all');
  const [days, setDays] = useState(7);
  const { data, error, loading, reload } = useApiResource<{
    slots: DoseSlot[];
    medicine: Medicine | null;
  }>(`/api/logs?days=${days}&filter=${filter}`);

  const groups = groupLogsByDate(data?.slots || []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <SectionTitle>ประวัติการทานยา</SectionTitle>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-[13.5px] font-semibold text-slate-600 outline-none"
        >
          <option value={7}>7 วันล่าสุด</option>
          <option value={14}>14 วันล่าสุด</option>
          <option value={30}>30 วันล่าสุด</option>
        </select>
      </div>

      <div className="flex gap-2">
        {FILTERS.map((item) => (
          <Chip key={item.value} active={filter === item.value} onClick={() => setFilter(item.value)}>
            {item.label}
          </Chip>
        ))}
      </div>

      {error && <ErrorNote message={error} onRetry={reload} />}
      {loading && <Loading />}

      {!loading && !error && groups.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-[14px] text-slate-500">
          ยังไม่มีประวัติในช่วงเวลานี้
        </div>
      )}

      {!loading &&
        groups.map((group) => (
          <section key={group.date} className="flex flex-col gap-3">
            <div className="mt-1 text-[14px] font-semibold text-slate-400">
              {dayLabel(group.date)}
            </div>
            {group.items.map((slot) => (
              <LogRow key={slot.key} slot={slot} medicineName={data?.medicine?.name} />
            ))}
          </section>
        ))}
    </div>
  );
}

function LogRow({ slot, medicineName }: { slot: DoseSlot; medicineName?: string }) {
  const late = slot.state === 'late' && slot.delay_minutes;

  return (
    <div
      className={`bg-white rounded-[20px] p-3.5 flex items-center gap-3.5 border ${
        slot.state === 'missed'
          ? 'border-rose-200'
          : slot.state === 'pending'
            ? 'border-indigo-100'
            : 'border-slate-100'
      }`}
    >
      <div className="w-14 h-14 rounded-2xl overflow-hidden shrink-0">
        {slot.image_url ? (
          <Image
            src={slot.image_url}
            alt="ภาพจากกล่อง"
            width={56}
            height={56}
            className="w-full h-full object-cover"
            unoptimized
          />
        ) : slot.state === 'missed' ? (
          <div className="w-full h-full bg-rose-50 text-rose-600 flex items-center justify-center">
            <XCircle size={24} />
          </div>
        ) : (
          <div className="w-full h-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Clock size={24} />
          </div>
        )}
      </div>

      <div className="flex-1">
        <div className={`text-[17px] font-bold ${slot.state === 'pending' ? 'text-indigo-600' : 'text-slate-900'}`}>
          {slot.time} น.
        </div>
        <div className="text-[13.5px] text-slate-500">
          {slot.state === 'missed'
            ? 'ไม่มีการเปิดฝา · ไม่มีภาพ'
            : slot.state === 'pending'
              ? 'รอทาน'
              : `เปิดฝา ${slot.actual_time ? timeOf(slot.actual_time) : '-'} · ${slot.dose_amount} เม็ด`}
          {medicineName && slot.state !== 'missed' && ` · ${medicineName}`}
        </div>
      </div>

      <StateBadge
        state={slot.state}
        label={late ? `เลท ${humanMinutes(slot.delay_minutes || 0)}` : undefined}
      />
    </div>
  );
}
