'use client';

import { useState, useEffect } from 'react';
import { CheckCircle2, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function TopHeader() {
  const [userName, setUserName] = useState<string>('Mumi');

  useEffect(() => {
    async function loadUserData() {
      try {
        const { data } = await supabase.from('users').select('name').limit(1).single();
        if (data?.name) {
          setUserName(data.name);
        }
      } catch (err) {
        console.log('User fetch bypass');
      }
    }
    loadUserData();
  }, []);

  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-100 px-5 py-3.5 shadow-sm">
      <div className="max-w-md mx-auto flex items-center gap-3">
        {/* Profile Avatar */}
        <div className="w-11 h-11 rounded-full bg-pink-100 border border-pink-200 flex items-center justify-center shrink-0 text-pink-500 font-bold overflow-hidden">
          <User size={22} />
        </div>

        {/* Greeting & Name */}
        <div className="flex flex-col">
          <span className="font-['Kanit'] text-xs text-slate-500 font-normal leading-tight">
            สวัสดี
          </span>
          <div className="flex items-center gap-1.5">
            <h1 className="font-['Kanit'] font-bold text-lg text-slate-900 leading-tight">
              คุณ {userName}
            </h1>
            {/* Blue Verified Badge */}
            <CheckCircle2 size={18} className="text-indigo-600 fill-indigo-600 stroke-white shrink-0" />
          </div>
        </div>
      </div>
    </header>
  );
}