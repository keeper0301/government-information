import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // @ 경로 별칭을 프로젝트 루트로 연결
    alias: { '@': path.resolve(__dirname, '.') },
  },
  test: {
    // 브라우저 환경 시뮬레이션 (React 컴포넌트 테스트 가능)
    environment: 'jsdom',
    // 테스트 파일 위치 (루트 __tests__ + lib/ 하위 모듈별 __tests__ 모두 탐색)
    include: [
      '__tests__/**/*.test.ts',
      '__tests__/**/*.test.tsx',
      'lib/**/__tests__/**/*.test.ts',
      'lib/**/__tests__/**/*.test.tsx',
    ],
  },
});
