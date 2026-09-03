'use client';

import { useRef } from 'react';

/** ช่องกรอกซีเรียลกล่อง B-_ _ _ (3 หลัก) — ตัวใหญ่ กดง่ายสำหรับผู้สูงอายุ */
export default function SerialInput({
  digits,
  onChange,
  onComplete,
  autoFocus = false,
}: {
  digits: string[];
  onChange: (digits: string[]) => void;
  onComplete?: (serial: string) => void;
  autoFocus?: boolean;
}) {
  const refs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  const handleChange = (index: number, raw: string) => {
    const value = raw.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = value;
    onChange(next);

    if (value && index < 2) refs[index + 1].current?.focus();
    if (value && index === 2 && next.every(Boolean)) onComplete?.(next.join(''));
  };

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      refs[index - 1].current?.focus();
    }
  };

  return (
    <div className="flex items-center justify-center gap-2.5">
      <span className="text-[30px] font-extrabold text-slate-900">B -</span>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={refs[index]}
          value={digit}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onFocus={(e) => e.target.select()}
          inputMode="numeric"
          maxLength={1}
          autoFocus={autoFocus && index === 0}
          aria-label={`หลักที่ ${index + 1}`}
          className={`w-[54px] h-16 rounded-[18px] bg-white text-center text-[26px] font-extrabold
            outline-none transition ${
              digit
                ? 'border-2 border-indigo-600 ring-4 ring-indigo-50 text-slate-900'
                : 'border-2 border-slate-200 text-slate-300'
            }`}
        />
      ))}
    </div>
  );
}
