import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const srcAlias = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  test: {
    projects: [
      {
        // 순수 시뮬레이션 · 스토어 · 저장소 정책 테스트. DOM이 필요 없다.
        resolve: { alias: { '@': srcAlias } },
        test: {
          name: 'simulation',
          environment: 'node',
          globals: true,
          include: ['src/tests/**/*.test.ts'],
        },
      },
      {
        // UI에서 WebGL이 아닌 부분에 대한 컴포넌트 테스트.
        plugins: [react()],
        resolve: { alias: { '@': srcAlias } },
        test: {
          name: 'ui',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./src/tests/setup/dom.setup.ts'],
          include: ['src/tests/**/*.dom.test.tsx'],
        },
      },
    ],
  },
});
