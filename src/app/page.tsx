import { AppShell } from '@/components/dashboard/AppShell';

/**
 * 애플리케이션의 유일한 라우트.
 *
 * `AppShell`이 `'use client'` 지시어를 갖고 있으므로 그 아래 모든 것은 브라우저에서
 * 실행된다. 이 프로젝트 어디에도 서버 액션, API 라우트, 데이터 페칭은 없다.
 */
export default function Page() {
  return <AppShell />;
}
