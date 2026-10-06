'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ChevronDown, Clock, ImageOff, Loader2, XCircle } from 'lucide-react';
import { groupLogsByDate, type DoseSlot } from '@/lib/schedule';
import { dayLabel, humanMinutes, timeOf } from '@/lib/time';
import type { Medicine } from '@/lib/types';
import { Chip, ErrorNote, FieldLabel, Loading, SectionTitle, StateBadge } from '@/app/components/ui';
import { useApiResource } from '@/app/components/useApiResource';
import { apiFetch } from '@/lib/session';

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

/** ภาพหลักฐานของมื้อหนึ่ง โหลดเมื่อผู้ใช้กดเปิดดูเท่านั้น ไม่ต้องดึงทุกแถวตั้งแต่แรก */
interface Evidence {
  images: Array<{ image_id: string; url: string; sequence: number }>;
  pills_before: number | null;
  pills_after: number | null;
}

function LogRow({ slot, medicineName }: { slot: DoseSlot; medicineName?: string }) {
  const late = slot.state === 'late' && slot.delay_minutes;
  const [open, setOpen] = useState(false);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [loadingImages, setLoadingImages] = useState(false);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (!next || evidence || !slot.log_id) return;
    setLoadingImages(true);
    apiFetch<Evidence>(`/api/images?log_id=${slot.log_id}`)
      .then(setEvidence)
      .catch(() => setEvidence({ images: [], pills_before: null, pills_after: null }))
      .finally(() => setLoadingImages(false));
  };

  return (
    <div
      className={`bg-white rounded-[20px] border ${
        slot.state === 'missed'
          ? 'border-rose-200'
          : slot.state === 'pending'
            ? 'border-indigo-100'
            : 'border-slate-100'
      }`}
    >
     <div className="p-3.5 flex items-center gap-3.5">
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

      <div className="flex items-center gap-1.5">
        <StateBadge
          state={slot.state}
          label={late ? `เลท ${humanMinutes(slot.delay_minutes || 0)}` : undefined}
        />
        {slot.log_id && (
          <button
            type="button"
            onClick={toggle}
            aria-label={open ? 'ซ่อนภาพหลักฐาน' : 'ดูภาพหลักฐาน'}
            className="p-1.5 text-slate-400 hover:text-slate-600"
          >
            <ChevronDown size={18} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
     </div>

      {open && (
        <div className="border-t border-slate-100 px-3.5 py-3 flex flex-col gap-2.5">
          {loadingImages && (
            <div className="flex items-center gap-2 text-[13px] text-slate-400">
              <Loader2 size={14} className="animate-spin" />
              กำลังโหลดภาพ
            </div>
          )}

          {!loadingImages && evidence && evidence.images.length === 0 && (
            <div className="flex items-center gap-2 text-[13px] text-slate-400">
              <ImageOff size={14} />
              ไม่มีภาพของมื้อนี้
            </div>
          )}

          {evidence && evidence.images.length > 0 && (
            <div className="flex gap-2.5 overflow-x-auto pb-1">
              {evidence.images.map((image, index) => (
                <Image
                  key={image.image_id}
                  src={image.url}
                  alt={`ภาพเฟรมที่ ${index + 1}`}
                  width={132}
                  height={132}
                  unoptimized
                  className="h-[132px] w-[132px] shrink-0 rounded-2xl border border-slate-100 object-cover"
                />
              ))}
            </div>
          )}

          {evidence && evidence.pills_after !== null && (
            <div className="flex items-center gap-2 rounded-2xl bg-slate-50 px-3.5 py-2.5">
              <FieldLabel>จำนวนยาในกล่อง</FieldLabel>
              <span className="text-[14px] text-slate-700">
                ก่อน {evidence.pills_before ?? '-'} เม็ด → หลัง {evidence.pills_after} เม็ด
                {evidence.pills_before !== null && (
                  <b className="ml-1.5 text-slate-900">
                    (หยิบไป {evidence.pills_before - evidence.pills_after} เม็ด)
                  </b>
                )}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
