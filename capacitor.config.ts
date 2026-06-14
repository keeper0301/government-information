import type { CapacitorConfig } from "@capacitor/cli";

// keepioo 앱(Capacitor) 설정.
// keepioo 는 서버 렌더링(SSR) Next.js 앱이라 앱 안에 통째로 담을 수 없다.
// 그래서 앱은 server.url 의 라이브 사이트(keepioo.com)를 불러와 보여주는
// 네이티브 껍데기로 동작한다. 네이티브 기능(공유·푸시 등)은 2단계에서 추가한다.
const config: CapacitorConfig = {
  // 앱 고유 ID(역도메인). 스토어 등록 후에는 변경 불가에 가까우니 신중히 고정.
  appId: "com.keepioo.app",
  // 네이티브 프로젝트·기기 표시용 이름(스토어 노출명은 스토어에서 따로 지정).
  appName: "keepioo",
  // server.url 을 쓰지만 Capacitor 는 기본 웹 폴더 존재를 요구 → 로딩 셸 폴더.
  webDir: "capacitor-shell",
  server: {
    // 라이브 사이트를 직접 로드. https 만 허용(cleartext=false)로 보안 유지.
    url: "https://keepioo.com",
    cleartext: false,
  },
};

export default config;
