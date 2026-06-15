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
    // 라이브 사이트를 직접 로드. apex(keepioo.com)는 www 로 리다이렉트되는데, Capacitor 는
    // server.url 과 다른 호스트로 이동하면 외부 브라우저(Chrome)로 열어버린다. 그래서 최종
    // 주소인 www 를 직접 지정하고, 두 호스트 모두 앱 내 WebView 에서 열도록 허용한다.
    url: "https://www.keepioo.com",
    cleartext: false,
    allowNavigation: ["keepioo.com", "www.keepioo.com"],
  },
  plugins: {
    // 앱 시작 시 keepioo 로고 시작화면을 잠깐 보여주고, keepioo.com 이 뜨면 사라짐.
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#FFFFFF",
      androidScaleType: "CENTER_INSIDE",
      showSpinner: false,
      splashFullScreen: false,
      splashImmersive: false,
    },
  },
};

export default config;
