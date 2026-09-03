'use client';

// ชิ้นส่วน UI ที่ใช้ซ้ำทุกหน้า — โทนเดียวกับไฟล์ดีไซน์
// indigo #4f46e5 · พื้นหลัง #f8fafc · การ์ดขาวขอบมน · ปุ่มสูง 60px สำหรับผู้สูงอายุ

import type { ReactNode } from 'react';
import { Loader2, X } from 'lucide-react';
import type { DoseState } from '@/lib/types';

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white border border-slate-100 rounded-3xl p-[18px] ${className}`}>
      {children}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-[22px] font-bold text-slate-900">{children}</h2>;
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="text-[13px] font-medium text-slate-500">{children}</span>;
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  type = 'button',
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`h-[60px] w-full rounded-[20px] bg-indigo-600 text-white text-[18px] font-bold
        shadow-[0_10px_22px_rgba(79,70,229,.25)] transition
        active:scale-[.98] disabled:opacity-50 disabled:shadow-none
        flex items-center justify-center gap-2.5 ${className}`}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-[60px] rounded-[20px] border border-slate-200 bg-white text-slate-600
        text-[17px] font-semibold transition active:scale-[.98]
        flex items-center justify-center gap-2.5 ${className}`}
    >
      {children}
    </button>
  );
}

export function Chip({
  children,
  active = false,
  onClick,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[13px] px-[15px] py-[9px] text-[13.5px] transition ${
        active
          ? 'bg-indigo-600 text-white font-semibold'
          : 'bg-white border border-slate-200 text-slate-600 font-medium'
      }`}
    >
      {children}
    </button>
  );
}

/* สี/ข้อความของแต่ละสถานะ ใช้ตรงกันทุกหน้า */
export const STATE_STYLE: Record<DoseState, { label: string; badge: string; dot: string; text: string }> = {
  taken: {
    label: 'ตรงเวลา',
    badge: 'text-emerald-700 bg-emerald-50 border-emerald-100',
    dot: 'bg-emerald-500',
    text: 'text-emerald-700',
  },
  late: {
    label: 'ทานเลท',
    badge: 'text-amber-700 bg-amber-50 border-amber-200',
    dot: 'bg-amber-500',
    text: 'text-amber-700',
  },
  missed: {
    label: 'ลืมทาน',
    badge: 'text-rose-700 bg-rose-50 border-rose-200',
    dot: 'bg-rose-400',
    text: 'text-rose-700',
  },
  pending: {
    label: 'รออยู่',
    badge: 'text-indigo-600 bg-indigo-50 border-indigo-200',
    dot: 'bg-indigo-600',
    text: 'text-indigo-600',
  },
};

export function StateBadge({ state, label }: { state: DoseState; label?: string }) {
  const style = STATE_STYLE[state];
  return (
    <span className={`rounded-xl border px-[11px] py-[7px] text-[12.5px] font-semibold ${style.badge}`}>
      {label ?? style.label}
    </span>
  );
}

export function Loading({ label = 'กำลังโหลด...' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-400">
      <Loader2 size={30} className="animate-spin text-indigo-500" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-[14px] text-rose-700">
      <div className="font-semibold">เกิดข้อผิดพลาด</div>
      <div className="mt-1 leading-relaxed">{message}</div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-xl bg-rose-600 px-4 py-2 text-white text-[13px] font-semibold"
        >
          ลองอีกครั้ง
        </button>
      )}
    </div>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-[14px] text-slate-500">
      {children}
    </div>
  );
}

/** กล่อง popup กลางจอ — ใช้กับเติมยา / ยืนยันการลบ */
export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <button
        type="button"
        aria-label="ปิด"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-md rounded-t-[28px] sm:rounded-[28px] bg-white p-6 pb-8 shadow-2xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-[19px] font-bold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
