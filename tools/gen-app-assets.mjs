// keepioo 앱 아이콘·스플래시 원본 생성 (Capacitor 자산용)
// app/icon.svg 의 'oo' 도넛 마크를 고해상도로 렌더 → resources/icon.png, splash.png
// 이후 `npx capacitor-assets generate` 가 이 원본에서 모든 해상도를 자동 생성한다.
import sharp from "sharp";
import { mkdirSync } from "node:fs";

// @capacitor/assets 는 assets/ 폴더 + logo.png·splash.png·splash-dark.png 를 찾는다.
mkdirSync("assets", { recursive: true });

// 'oo' 도넛 마크 — 원본 app/icon.svg(64 단위) 좌표를 임의 size 로 스케일.
// ring=바깥 원 색, hole=가운데 구멍 색.
function ooMark(size, ring, hole) {
  const k = size / 64;
  const cy = 32 * k, rO = 9.5 * k, rI = 4.25 * k, c1 = 21 * k, c2 = 43 * k;
  return (
    `<circle cx="${c1}" cy="${cy}" r="${rO}" fill="${ring}"/>` +
    `<circle cx="${c1}" cy="${cy}" r="${rI}" fill="${hole}"/>` +
    `<circle cx="${c2}" cy="${cy}" r="${rO}" fill="${ring}"/>` +
    `<circle cx="${c2}" cy="${cy}" r="${rI}" fill="${hole}"/>`
  );
}

// 1) 앱 아이콘 원본 logo.png 1024 — 파란(#3182F6) 풀블리드 + 흰 'oo' (런처가 둥근 마스킹)
const iconSvg =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">` +
  `<rect width="1024" height="1024" fill="#3182F6"/>${ooMark(1024, "white", "#3182F6")}</svg>`;
await sharp(Buffer.from(iconSvg)).png().toFile("assets/logo.png");

// 2) 스플래시 2732 — 배경 + 중앙 'oo' 마크(약 740px 폭). light=흰배경/파란oo, dark=남색배경/흰oo
const markPx = 1152;
async function makeSplash(file, bg, ring, hole) {
  const markSvg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${markPx} ${markPx}">` +
    `${ooMark(markPx, ring, hole)}</svg>`;
  const markBuf = await sharp(Buffer.from(markSvg)).png().toBuffer();
  await sharp({ create: { width: 2732, height: 2732, channels: 4, background: bg } })
    .composite([{ input: markBuf, gravity: "center" }])
    .png()
    .toFile(file);
}
await makeSplash("assets/splash.png", "#FFFFFF", "#3182F6", "white");
await makeSplash("assets/splash-dark.png", "#191F28", "#3182F6", "#191F28");

console.log("✅ assets/logo.png, splash.png, splash-dark.png 생성 완료");
