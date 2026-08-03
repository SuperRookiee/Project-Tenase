// eslint-config-next 16은 네이티브 flat config를 제공하므로, 예전 FlatCompat 심으로
// 감싸지 않고 곧바로 펼쳐 쓴다.
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

const eslintConfig = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'next-env.d.ts',
      '.idea/**',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    rules: {
      // 시뮬레이션 엔진은 빈번한 루프에서 타입이 붙은 수준 레코드를 직접 변경한다.
      // 이 저장소는 타입 보증을 린트 단계에서 중복 강제하지 않고 `tsc --noEmit`에
      // 맡긴다.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
];

export default eslintConfig;
