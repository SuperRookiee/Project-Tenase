import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

/**
 * Project Tenase는 전적으로 클라이언트에서만 동작하는 교육용 시각화다.
 *
 * 백엔드는 의도적으로 없다. API 라우트도, 서버 액션도, 실행 중 네트워크 요청도
 * 없다. `poweredByHeader`를 끄고 엄격한 Content-Security-Policy를 적용해, 빌드된
 * 애플리케이션이 원격 자원을 몰래 가져오거나 시뮬레이션 상태를 밖으로 내보낼 수
 * 없게 한다.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  // Next.js는 인라인 부트스트랩 스크립트를 주입한다. 'unsafe-eval'은 개발 모드의
  // React refresh 런타임에만 필요하며, 프로덕션 빌드에서는 빠진다.
  process.env.NODE_ENV === 'development'
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // 원격 자원도, 원격 측정도, 분석 엔드포인트도 없다.
  process.env.NODE_ENV === 'development'
    ? "connect-src 'self' ws: wss:"
    : "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // 워크스페이스 루트를 고정한다. 이것이 없으면 Turbopack이 상위로 올라가며 탐색하다
  // 상위 디렉터리의 무관한 lockfile을 프로젝트 루트로 고를 수 있다.
  turbopack: {
    root: fileURLToPath(new URL('.', import.meta.url)),
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
    ];
  },
};

export default nextConfig;
