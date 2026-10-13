import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [
    {
      name: '서버-점검-도구-실행표시-정리',
      enforce: 'pre',
      transform(code, id) {
        // 실행 표시가 변환된 가져오기 문장 뒤로 밀려 구문 오류가 나는 일을 막습니다.
        // 원본 도구는 그대로 두고 검사에서 가져오는 서버 도구의 표시만 제거합니다.
        if (id.replaceAll('\\', '/').includes('/tools/') && id.endsWith('.mjs') && code.startsWith('#!')) {
          return { code: code.replace(/^#![^\r\n]*/, ''), map: null };
        }
      },
    },
    react(),
  ],
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
    // __tests__/tmp 는 외부 사이트를 실제 호출하는 임시 live probe 용도라
    // 기본 CI 에서는 네트워크/DNS 상태에 따라 흔들리지 않도록 제외한다.
    exclude: ['__tests__/tmp/**'],
  },
});
