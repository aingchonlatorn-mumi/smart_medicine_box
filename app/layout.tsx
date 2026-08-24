import type { Metadata, Viewport } from 'next';
import { Prompt } from 'next/font/google';
import './globals.css';

const prompt = Prompt({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-prompt',
});

export const metadata: Metadata = {
  title: 'Smart Pillbox - กล่องยาอัจฉริยะ',
  description: 'ระบบติดตามการทานยาผ่าน LINE LIFF',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th" className={prompt.variable}>
      {/* ลบ flex items-center justify-center ออก และใช้ w-full min-h-screen แทน */}
      <body className="font-sans antialiased bg-slate-100 w-full min-h-screen">
        {children}
      </body>
    </html>
  );
}
