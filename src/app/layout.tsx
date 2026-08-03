import type { Metadata, Viewport } from 'next';
import './globals.css';
import 'molstar/build/viewer/molstar.css';

export const metadata: Metadata = {
  title: 'Project Tenase — 추상 네트워크 시각화',
  description:
    '추상 반응 네트워크를 다루는 가상의 비임상 교육용 시각화. 의료 도구가 아니며 검증된 생물학 모델도 아니다.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#05070d',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-surface-0 text-ink-0 antialiased">
        {children}
      </body>
    </html>
  );
}
