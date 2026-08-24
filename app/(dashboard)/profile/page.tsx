'use client';

import { useEffect, useState } from 'react';
import { User, Phone, Calendar, Box, ShieldCheck, Loader2, Edit3, MessageCircle } from 'lucide-react';
import { supabase, CURRENT_USER_ID } from '@/lib/supabase';

interface UserProfile {
  user_id: string;
  name: string;
  phone: string | null;
  birth_date: string | null;
  line_user_id: string | null;
  created_at: string;
  boxes?: {
    box_serial: string;
    status: string;
  }[];
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUserProfile();
  }, []);

  const fetchUserProfile = async () => {
    setLoading(true);
    try {
      // ดึงข้อมูล User พร้อมข้อมูล Smart Pillbox
      const { data, error } = await supabase
        .from('users')
        .select(`
          user_id,
          name,
          phone,
          birth_date,
          line_user_id,
          created_at,
          boxes (
            box_serial,
            status
          )
        `)
        .eq('user_id', CURRENT_USER_ID)
        .single();

      if (error) {
        // Fallback กรณีหาตาม CURRENT_USER_ID ไม่เจอ ให้ดึงแถวแรกขึ้นมาโชว์
        const { data: firstUser } = await supabase
          .from('users')
          .select(`
            user_id,
            name,
            phone,
            birth_date,
            line_user_id,
            created_at,
            boxes (
              box_serial,
              status
            )
          `)
          .limit(1)
          .single();

        setProfile(firstUser as unknown as UserProfile);
      } else {
        setProfile(data as unknown as UserProfile);
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-2 text-slate-400 font-['Kanit']">
        <Loader2 size={32} className="animate-spin text-indigo-600" />
        <span className="text-xs">กำลังโหลดข้อมูลโปรไฟล์...</span>
      </div>
    );
  }

  const boxInfo = profile?.boxes?.[0];

  return (
    <div className="w-full max-w-md mx-auto flex flex-col gap-6 font-['Kanit'] px-1 pb-10">
      
      {/* Header Title */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">
          Personal Profile
        </h1>
        <button className="flex items-center gap-1 text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full hover:bg-indigo-100 transition-colors">
          <Edit3 size={14} /> แก้ไขข้อมูล
        </button>
      </div>

      {/* Profile Card */}
      <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-[32px] p-6 text-white shadow-lg relative overflow-hidden flex flex-col items-center text-center gap-3">
        <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-white/10 rounded-full blur-xl pointer-events-none" />
        
        <div className="w-20 h-20 rounded-full bg-white/20 border-2 border-white/40 flex items-center justify-center text-white shadow-inner">
          <User size={40} />
        </div>

        <div className="flex flex-col items-center gap-0.5">
          <h2 className="text-xl font-bold">{profile?.name || 'คุณ มะลิ ทิ้งใจ'}</h2>
          <span className="inline-flex items-center gap-1 text-[11px] bg-emerald-400/20 text-emerald-200 border border-emerald-400/30 px-2.5 py-0.5 rounded-full font-medium">
            <ShieldCheck size={12} /> ยืนยันตัวตนเรียบร้อย
          </span>
        </div>
      </div>

      {/* Info List */}
      <div className="bg-white border border-slate-100 rounded-[28px] p-5 shadow-sm flex flex-col gap-4">
        <h3 className="font-bold text-sm text-slate-900">ข้อมูลส่วนตัว</h3>
        
        <div className="flex items-center gap-3.5 text-sm">
          <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
            <Phone size={18} />
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] text-slate-400 font-normal">เบอร์โทรศัพท์</span>
            <span className="font-semibold text-slate-800">{profile?.phone || '081-234-5678'}</span>
          </div>
        </div>

        <div className="flex items-center gap-3.5 text-sm">
          <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
            <Calendar size={18} />
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] text-slate-400 font-normal">วันเกิด</span>
            <span className="font-semibold text-slate-800">
              {profile?.birth_date
                ? new Date(profile.birth_date).toLocaleDateString('th-TH', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })
                : '15 สิงหาคม 2510'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3.5 text-sm">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <MessageCircle size={18} />
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] text-slate-400 font-normal">LINE User ID</span>
            <span className="font-semibold text-slate-800 break-all">{profile?.line_user_id || 'U1234567890abcdef'}</span>
          </div>
        </div>
      </div>

      {/* Connected Device Box */}
      <div className="bg-white border border-slate-100 rounded-[28px] p-5 shadow-sm flex flex-col gap-3">
        <h3 className="font-bold text-sm text-slate-900">กล่องยาที่เชื่อมต่อ</h3>
        
        <div className="flex items-center justify-between p-3.5 bg-slate-50/80 rounded-2xl border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
              <Box size={20} />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-xs text-slate-800">
                {boxInfo?.box_serial || 'BOX-8829-01'}
              </span>
              <span className="text-[11px] text-slate-400">Smart Medication Box</span>
            </div>
          </div>

          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 capitalize">
            {boxInfo?.status || 'Active'}
          </span>
        </div>
      </div>

    </div>
  );
}