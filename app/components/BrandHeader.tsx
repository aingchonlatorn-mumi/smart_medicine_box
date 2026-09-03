'use client';

import React from 'react';
import Link from 'next/link';
import { Box } from 'lucide-react';

interface BrandHeaderProps {
  action?: {
    label: string;
    href: string;
  };
}

/** แถบชื่อแอปด้านบนของหน้าก่อนเข้าสู่ระบบ */
export default function BrandHeader({ action }: BrandHeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
      <div className="flex items-center gap-2.5">
        <div className="w-[38px] h-[38px] rounded-xl bg-indigo-600 flex items-center justify-center">
          <Box size={21} className="text-white" strokeWidth={2} />
        </div>
        <span className="text-[19px] font-bold text-indigo-600">PillBox Web</span>
      </div>
      {action && (
        <Link
          href={action.href}
          className="rounded-full border border-indigo-200 bg-indigo-50/40 px-[15px] py-2.5 text-[13.5px] font-semibold text-indigo-600"
        >
          {action.label}
        </Link>
      )}
    </header>
  );
}