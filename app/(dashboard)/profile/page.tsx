'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Calendar, Loader2, LogOut, MessageCircle, Pencil, Phone, Shield, User as UserIcon } from 'lucide-react';
import { apiFetch, clearSession, getSession, saveSession } from '@/lib/session';
import { ageFrom, formatPhone, thaiDate } from '@/lib/time';
import type { MeResponse } from '@/lib/types';
import { Card, ErrorNote, Loading, PrimaryButton } from '@/app/components/ui';
import { useApiResource } from '@/app/components/useApiResource';

export default function ProfilePage() {
  const router = useRouter();
  const { data, error, loading, reload, setError } = useApiResource<MeResponse>('/api/me');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [draft, setDraft] = useState<{ name: string; phone: string; birthDate: string } | null>(null);
  const form = draft ?? {
    name: data?.user.name || '',
    phone: data?.user.phone || '',
    birthDate: data?.user.birth_date?.slice(0, 10) || '',
  };
  const patchForm = (patch: Partial<typeof form>) => setDraft({ ...form, ...patch });

  const save = async () => {
    setSaving(true);
    try {
      const me = await apiFetch<MeResponse>('/api/me', {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          birth_date: form.birthDate || null,
        }),
      });
      const session = getSession();
      if (session) saveSession({ ...session, name: me.user.name });
      setDraft(null);
      setEditing(false);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const logout = () => {
    if (!confirm('ต้องการออกจากระบบใช่หรือไม่?')) return;
    clearSession();
    router.replace('/');
  };

  if (error && !data) return <div className="pt-6"><ErrorNote message={error} onRetry={reload} /></div>;
  if (loading || !data) return <Loading />;

  const { user, box } = data;
  const age = ageFrom(user.birth_date);
  const lineLinked = user.line_user_id?.startsWith('U');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-bold text-slate-900">โปรไฟล์</h1>
        <button
          type="button"
          onClick={() => (editing ? save() : setEditing(true))}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-full bg-indigo-50 px-3.5 py-2.5 text-[13.5px] font-semibold text-indigo-600"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Pencil size={16} />}
          {editing ? 'บันทึก' : 'แก้ไข'}
        </button>
      </div>

      {error && <ErrorNote message={error} />}

      {/* การ์ดผู้ใช้ */}
      <div className="relative overflow-hidden rounded-[30px] bg-indigo-600 p-[26px] text-center text-white flex flex-col items-center gap-3">
        <div className="absolute -right-8 -bottom-8 w-32 h-32 rounded-full bg-white/10" />
        <div className="w-[84px] h-[84px] rounded-full bg-white/20 border-2 border-white/40 flex items-center justify-center">
          <UserIcon size={42} strokeWidth={1.8} />
        </div>
        <div className="text-[23px] font-bold">คุณ {user.name.replace(/^คุณ\s*/, '')}</div>
        <div className="flex items-center gap-1.5 rounded-full border border-emerald-300/35 bg-emerald-500/20 px-3.5 py-1.5 text-[13px] font-medium text-emerald-100">
          <Shield size={14} />
          {lineLinked ? 'ยืนยันตัวตนเรียบร้อย' : 'ยังไม่ได้ผูกบัญชี LINE'}
        </div>
      </div>

      {/* ข้อมูลส่วนตัว */}
      <Card className="!p-5 flex flex-col gap-[17px]">
        <div className="text-[15px] font-semibold">ข้อมูลส่วนตัว</div>

        {editing ? (
          <div className="flex flex-col gap-3">
            <LabeledInput
              label="ชื่อ-นามสกุล"
              value={form.name}
              onChange={(value) => patchForm({ name: value })}
            />
            <LabeledInput
              label="เบอร์โทรศัพท์"
              value={form.phone}
              onChange={(value) => patchForm({ phone: value.replace(/\D/g, '').slice(0, 10) })}
              inputMode="numeric"
            />
            <LabeledInput
              label="วันเกิด"
              value={form.birthDate}
              onChange={(value) => patchForm({ birthDate: value })}
              type="date"
            />
          </div>
        ) : (
          <>
            <InfoRow icon={<Phone size={20} />} label="เบอร์โทรศัพท์" value={formatPhone(user.phone)} />
            <InfoRow
              icon={<Calendar size={20} />}
              label="วันเกิด"
              value={user.birth_date ? `${thaiDate(user.birth_date, 'full')}${age !== null ? ` (${age} ปี)` : ''}` : '-'}
            />
            <InfoRow
              icon={<MessageCircle size={20} />}
              label="บัญชี LINE ที่เชื่อมไว้"
              value={lineLinked ? `${user.line_user_id.slice(0, 8)}...` : 'ยังไม่ได้เชื่อม'}
              tint={lineLinked ? 'bg-emerald-50 text-emerald-700' : undefined}
            />
          </>
        )}
      </Card>

      {/* กล่องยาที่ผูกอยู่ */}
      <Card className="!p-5 flex flex-col gap-3.5">
        <div className="text-[15px] font-semibold">กล่องยาที่ผูกอยู่</div>
        {box ? (
          <div className="rounded-[20px] border border-slate-100 bg-slate-50 p-[15px] flex items-center gap-3.5">
            <div className="w-[46px] h-[46px] rounded-[15px] bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <Box size={23} />
            </div>
            <div className="flex-1">
              <div className="text-[18px] font-bold tracking-wide">{box.box_serial}</div>
              <div className="text-[13px] text-slate-500">
                ผูกเมื่อ {thaiDate(box.created_at?.slice(0, 10))}
              </div>
            </div>
            <span className="rounded-xl border border-emerald-100 bg-emerald-50 px-[11px] py-[7px] text-[12.5px] font-semibold text-emerald-700">
              {box.status}
            </span>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-[14px] text-slate-500">
            ยังไม่ได้ผูกกล่องยา
          </div>
        )}
      </Card>

      <div className="mt-2 flex flex-col gap-3 pb-2">
        <PrimaryButton
          onClick={logout}
          className="!bg-white !text-rose-600 border border-rose-200 !shadow-none"
        >
          <LogOut size={22} /> ออกจากระบบ
        </PrimaryButton>
        <p className="text-center text-[12.5px] leading-relaxed text-slate-400">
          ล้างข้อมูลการเข้าสู่ระบบในเครื่องนี้ แล้วกลับไปหน้าแรก
        </p>
      </div>
    </div>
  );
}

function InfoRow({
  icon, label, value, tint = 'bg-slate-100 text-slate-600',
}: {
  icon: React.ReactNode; label: string; value: string; tint?: string;
}) {
  return (
    <div className="flex items-center gap-3.5">
      <div className={`w-[42px] h-[42px] rounded-[14px] flex items-center justify-center shrink-0 ${tint}`}>
        {icon}
      </div>
      <div>
        <div className="text-[12.5px] text-slate-400">{label}</div>
        <div className="text-[17px] font-semibold">{value}</div>
      </div>
    </div>
  );
}

function LabeledInput({
  label, value, onChange, type = 'text', inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  inputMode?: 'numeric';
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-slate-500">{label}</span>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-14 rounded-[18px] border border-slate-200 bg-white px-4 text-[17px] font-medium outline-none focus:border-indigo-500"
      />
    </label>
  );
}
