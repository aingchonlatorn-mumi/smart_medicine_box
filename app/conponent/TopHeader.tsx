'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, User, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import React from 'react';

export default function TopHeader() {
  const router = useRouter();
  const [userName, setUserName] = useState<string>('มะลิ ทิ้งใจ');

  useEffect(() => {
    async function loadUserData() {
      const storedUserId = localStorage.getItem('user_id');
      const storedName = localStorage.getItem('user_name');
      if (storedName) setUserName(storedName);

      if (storedUserId) {
        try {
          const { data } = await supabase
            .from('users')
            .select('name')
            .eq('user_id', storedUserId)
            .maybeSingle();

          if (data?.name) {
            setUserName(data.name);
            localStorage.setItem('user_name', data.name);
          }
        } catch (err) {
          console.log('User fetch bypass:', err);
        }
      }
    }
    loadUserData();
  }, []);

  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-100 px-5 py-3.5 shadow-sm">
      <div className="max-w-md mx-auto">
        <button
          onClick={() => router.push('/profile')}
          className="w-full flex items-center justify-between p-1 rounded-2xl hover:bg-slate-50 active:scale-[0.99] transition cursor-pointer text-left"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-pink-100 border border-pink-200 flex items-center justify-center shrink-0 text-pink-500 font-bold overflow-hidden">
              <User size={24} />
            </div>
            <div className="flex flex-col">
              <span className="font-['Kanit'] text-xs text-slate-400 font-normal leading-tight">
                สวัสดี
              </span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <h1 className="font-['Kanit'] font-bold text-lg text-slate-900 leading-tight">
                  คุณ {userName}
                </h1>
                <CheckCircle2 size={18} className="text-indigo-600 fill-indigo-600 stroke-white shrink-0" />
              </div>
            </div>
          </div>
          <ChevronRight size={22} className="text-slate-400 shrink-0" />
        </button>
      </div>
    </header>
  );
}