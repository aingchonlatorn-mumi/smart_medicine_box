'use client';

// หน้าตั้งค่ายาครั้งแรก — รอให้กล่องสแกนยา แล้วให้ผู้ใช้ตรวจสอบผลก่อนบันทึก
//
// ลำดับ: ผูกกล่องเสร็จ → หน้านี้ → ผู้ใช้เปิดกล่องใส่ยา → กล่องถ่ายภาพและนับ
//        → แสดงผลให้ตรวจสอบ → ยืนยัน → ไปหน้าตั้งเวลาทานยา
//
// ระบบเดาชื่อยาและจำนวนให้ แต่คนเป็นผู้ตัดสินใจสุดท้ายเสมอ
// เพราะโมเดลรู้จักยาเพียงไม่กี่ชนิด และการบันทึกชื่อยาผิดเป็นเรื่องที่ยอมรับไม่ได้

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, CheckCircle2, Loader2, Package, RefreshCw } from 'lucide-react';
import { Card, ErrorNote, FieldLabel, GhostButton, PrimaryButton, SectionTitle } from '@/app/components/ui';
import { apiFetch } from '@/lib/session';
import { MEDICINE_TYPES, medicineByCode, medicineByModelClass } from '@/lib/medicines';
import type { Medicine } from '@/lib/types';

interface ScanResponse {
  status: 'waiting' | 'ready';
  medicine: Medicine | null;
  images: string[];
  per_class?: Record<string, number>;
  frames?: number[];
  stable?: boolean;
  /** โมเดลจับคู่ยาในภาพกับรายการที่ระบบรองรับได้หรือไม่ */
  recognised?: boolean;
}

/** ถามผลทุก 4 วินาที — ถี่พอให้รู้สึกทันที แต่ไม่ถี่จนยิงคำขอทิ้งเปล่า */
const POLL_MS = 4000;

export default function SetupScanPage() {
  const router = useRouter();
  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [code, setCode] = useState('');
  const [pills, setPills] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const filled = useRef(false);

  const load = useCallback(() => {
    apiFetch<ScanResponse>('/api/scans')
      .then((data) => {
        setScan(data);
        // เติมค่าลงฟอร์มครั้งเดียวตอนผลมาถึง ไม่งั้นจะทับสิ่งที่ผู้ใช้กำลังพิมพ์
        if (data.status === 'ready' && data.medicine && !filled.current) {
          filled.current = true;
          setCode(data.medicine.code || '');
          setPills(data.medicine.total_pills);
        }
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const ready = scan?.status === 'ready';

  const confirm = async () => {
    setError('');
    if (!code) return setError('กรุณาเลือกชนิดยา');
    setSaving(true);
    try {
      await apiFetch('/api/scans', {
        method: 'POST',
        body: JSON.stringify({ code, total_pills: pills }),
      });
      router.replace('/schedule');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ');
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-[18px] py-6">
      <div className="mx-auto w-full max-w-[560px] flex flex-col gap-4">
        <div>
          <SectionTitle>{ready ? 'ตรวจสอบผลการสแกน' : 'ใส่ยาลงในกล่อง'}</SectionTitle>
          <p className="mt-1 text-[15px] leading-relaxed text-slate-500">
            {ready
              ? 'กล้องในกล่องอ่านข้อมูลได้ตามนี้ กรุณาตรวจสอบและแก้ไขให้ถูกต้องก่อนบันทึก'
              : 'เปิดฝากล่อง เทยาลงในถาด แล้วปิดฝา ระบบจะถ่ายภาพและนับจำนวนให้อัตโนมัติ'}
          </p>
        </div>

        {error && <ErrorNote message={error} onRetry={load} />}

        {!ready && (
          <Card className="flex flex-col items-center gap-3 py-10 text-center">
            <span className="relative flex h-16 w-16 items-center justify-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-indigo-100" />
              <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50">
                <Camera size={28} className="text-indigo-600" />
              </span>
            </span>
            <div className="text-[17px] font-semibold text-slate-900">รอสัญญาณจากกล่องยา</div>
            <div className="flex items-center gap-2 text-[14px] text-slate-500">
              <Loader2 size={15} className="animate-spin" />
              ระบบจะแสดงผลทันทีที่กล่องส่งภาพเข้ามา
            </div>
          </Card>
        )}

        {ready && scan?.medicine && (
          <>
            {scan.images.length > 0 && (
              <Card className="flex flex-col gap-2.5">
                <FieldLabel>ภาพจากกล้องในกล่อง</FieldLabel>
                <div className="flex gap-2.5 overflow-x-auto pb-1">
                  {scan.images.map((url, index) => (
                    // ภาพมาจาก signed URL ของ Supabase Storage จึงใช้ img ธรรมดา
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={url}
                      src={url}
                      alt={`ภาพยาเฟรมที่ ${index + 1}`}
                      className="h-[150px] w-[150px] shrink-0 rounded-2xl border border-slate-100 object-cover"
                    />
                  ))}
                </div>
              </Card>
            )}

            <Card className="flex flex-col gap-4">
              <div className="flex items-center gap-2 text-[15px] font-semibold text-emerald-600">
                <CheckCircle2 size={18} />
                ประมวลผลเสร็จแล้ว
              </div>

              {scan.recognised === false && (
                <div className="rounded-2xl bg-amber-50 px-3.5 py-3 text-[13px] leading-relaxed text-amber-700">
                  ยาในภาพไม่ตรงกับชนิดที่ระบบจำแนกได้ กรุณาเลือกชนิดยาด้วยตนเอง
                  หรือเปลี่ยนไปใช้ยาในรายการ เพราะระบบจะนับเม็ดยาให้ไม่ได้ถ้าเป็นยานอกรายการ
                </div>
              )}

              <label className="flex flex-col gap-1.5">
                <FieldLabel>ชนิดยา</FieldLabel>
                <select
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="h-[52px] rounded-2xl border border-slate-200 bg-white px-4 text-[16px] text-slate-900 outline-none focus:border-indigo-500"
                >
                  <option value="">— เลือกชนิดยา —</option>
                  {MEDICINE_TYPES.map((type) => (
                    <option key={type.code} value={type.code}>
                      {type.nameTh} ({type.nameEn})
                    </option>
                  ))}
                </select>
                <span className="text-[13px] leading-relaxed text-slate-500">
                  {medicineByCode(code)?.description
                    ?? 'ระบบรองรับยา 6 ชนิดนี้ เพราะเป็นชนิดที่ใช้ฝึกแบบจำลองจำแนกภาพ'}
                </span>
              </label>

              <label className="flex flex-col gap-1.5">
                <FieldLabel>จำนวนเม็ดที่นับได้</FieldLabel>
                <div className="flex items-center gap-2.5">
                  <input
                    type="number"
                    min={0}
                    value={pills || ''}
                    onChange={(e) => setPills(Math.max(0, Number(e.target.value)))}
                    className="h-[52px] w-[120px] rounded-2xl border border-slate-200 px-4 text-[16px] text-slate-900 outline-none focus:border-indigo-500"
                  />
                  <span className="text-[15px] text-slate-500">เม็ด</span>
                </div>
              </label>

              {scan.stable === false && (
                <div className="rounded-2xl bg-amber-50 px-3.5 py-3 text-[13px] leading-relaxed text-amber-700">
                  ผลการนับแต่ละภาพไม่เท่ากัน ({(scan.frames || []).join(', ')} เม็ด)
                  กรุณาตรวจสอบจำนวนด้วยตาอีกครั้ง
                </div>
              )}

              {scan.per_class && Object.keys(scan.per_class).length > 1 && (
                <div className="rounded-2xl bg-rose-50 px-3.5 py-3 text-[13px] leading-relaxed text-rose-700">
                  พบยามากกว่าหนึ่งชนิดในกล่อง:{' '}
                  {Object.entries(scan.per_class)
                    .map(([k, v]) => `${medicineByModelClass(k)?.nameTh ?? k} ${v} เม็ด`)
                    .join(' · ')}
                  <br />
                  กล่องนี้รองรับยาหนึ่งชนิด เพราะระบบยืนยันการทานยาจากผลต่างของจำนวนเม็ด
                  ถ้ามียาปนกัน จะแยกไม่ได้ว่าเม็ดที่หายไปเป็นยาตัวใด
                  กรุณานำยาอื่นออกแล้วสแกนใหม่
                </div>
              )}

              <div className="flex items-center gap-2.5 rounded-2xl bg-slate-50 px-3.5 py-3 text-[13px] text-slate-500">
                <Package size={16} className="shrink-0 text-slate-400" />
                ตัวเลขนี้จะใช้เป็นยอดตั้งต้น ระบบจะนับใหม่ทุกครั้งที่เปิดกล่อง
              </div>
            </Card>

            <div className="flex flex-col gap-2.5">
              <PrimaryButton onClick={confirm} disabled={saving}>
                {saving ? 'กำลังบันทึก...' : 'ยืนยันและไปตั้งเวลาทานยา'}
              </PrimaryButton>
              <GhostButton onClick={load}>
                <span className="inline-flex items-center gap-2">
                  <RefreshCw size={16} />
                  สแกนใหม่อีกครั้ง
                </span>
              </GhostButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
