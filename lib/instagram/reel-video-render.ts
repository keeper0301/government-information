// ============================================================
// Instagram Reels MP4 renderer
// ============================================================
// sharp 로 세로 PNG 슬라이드를 만들고 ffmpeg-static 으로 H.264/AAC
// 내레이션 포함 mp4 로 합친다. 결과 파일은 Meta Graph API video_url 로 쓰기 전
// Supabase public storage 에 올린다.
// ============================================================

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import sharp from "sharp";
import ffmpegPath from "ffmpeg-static";
import { buildReelVideoPlan, type ReelVideoPostInput, type ReelVideoSlide } from "./reel-video-plan";
import { categoryColorOnWhite, getCategoryColor } from "./card-colors";
import { resolveInstagramCardHook } from "./card-hook";

export type RenderReelVideoResult = {
  filePath: string;
  durationSeconds: number;
  cleanup: () => Promise<void>;
};

// Vercel serverless memory safety: render Reels at 540x960 instead of 1080x1920.
// Instagram accepts 9:16 MP4 and this avoids sharp/ffmpeg OOM on the cron route.
const WIDTH = 540;
const HEIGHT = 960;
const DESIGN_WIDTH = 1080;
const DESIGN_HEIGHT = 1920;
const FPS = 24;
const OPENAI_TTS_MODEL = "tts-1-hd";
const OPENAI_TTS_VOICE = "nova";
const PRETENDARD_BOLD_TTF = join(process.cwd(), "assets", "Pretendard-Bold.ttf");
const PRETENDARD_MEDIUM_TTF = join(process.cwd(), "assets", "Pretendard-Medium.ttf");
const TYPE = {
  title: 38,
  label: 25,
  body: 29,
  foot: 26,
};

function escapeMarkup(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapText(input: string, maxChars: number, maxLines: number): string[] {
  const normalized = input.replace(/\s+/g, " ").trim();
  const words = normalized
    .split(" ")
    .filter(Boolean)
    .flatMap((word) => {
      if (word.length <= maxChars) return [word];
      const chunks: string[] = [];
      for (let i = 0; i < word.length; i += maxChars) chunks.push(word.slice(i, i + maxChars));
      return chunks;
    });
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
    if (lines.length === maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, Math.max(0, maxChars - 1)).trim()}…`;
  }
  return lines.length ? lines : [""];
}

function baseSlideSvg(index: number, accent: string, category: string): string {
  const fillPct = (index + 1) * 20;
  const pillWidth = Math.max(160, Math.min(360, 56 + category.length * 42));
  const pillTextX = 96 + pillWidth / 2;
  return `
<svg width="${DESIGN_WIDTH}" height="${DESIGN_HEIGHT}" viewBox="0 0 ${DESIGN_WIDTH} ${DESIGN_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${DESIGN_WIDTH}" height="${DESIGN_HEIGHT}" fill="#ffffff"/>
  <rect x="0" y="0" width="22" height="${DESIGN_HEIGHT}" fill="${accent}"/>
  <rect x="96" y="150" width="${pillWidth}" height="84" rx="42" fill="${accent}"/>
  <text x="${pillTextX}" y="205" text-anchor="middle" font-size="44" font-weight="700" fill="#ffffff" font-family="Arial, sans-serif">${escapeMarkup(category)}</text>
  <rect x="772" y="156" width="120" height="72" rx="36" fill="#2b2b31"/>
  <text x="832" y="204" text-anchor="middle" font-size="36" font-weight="700" fill="#ffffff" font-family="Arial, sans-serif">${index + 1}/5</text>
  <rect x="96" y="1810" width="888" height="14" rx="7" fill="#e7eaef"/>
  <rect x="96" y="1810" width="${(888 * fillPct) / 100}" height="14" rx="7" fill="${accent}"/>
</svg>`;
}

function titleMaxLines(index: number): number {
  return index === 0 ? 5 : 3;
}

function coverChecklist(category: string): string[] {
  if (/주거|월세|전세|임대/.test(category)) return ["대상 조건", "지원 금액", "신청 마감"];
  if (/육아|가족|아동|출산|보육/.test(category)) return ["대상 연령", "이용 방법", "기간·주의사항"];
  if (/창업|소상공|사업|자영/.test(category)) return ["대상 업종", "지원 내용", "신청처"];
  return ["대상 조건", "지원 내용", "신청 방법"];
}

async function textPng(
  text: string,
  fontSize: number,
  width: number,
  height: number,
  color: string,
  align: "left" | "center" = "left",
  fontfile = PRETENDARD_BOLD_TTF,
): Promise<Buffer> {
  const markup = `<span foreground="${escapeMarkup(color)}" size="${Math.round(fontSize * 1000)}" font_family="Pretendard">${escapeMarkup(text)}</span>`;
  const rendered = await sharp({
    text: {
      text: markup,
      fontfile,
      width,
      height,
      align,
      rgba: true,
    },
  }).png().toBuffer();
  return sharp(rendered)
    .withMetadata({ density: 72 })
    .png()
    .toBuffer();
}

function labelFromEyebrow(eyebrow: string, category: string): string {
  return eyebrow.replace(`${category} · keepioo`, "").trim() || eyebrow;
}

async function slideComposites(
  slide: ReelVideoSlide,
  index: number,
  category: string,
  accent: string,
  hookLabel: string,
): Promise<sharp.OverlayOptions[]> {
  const label = labelFromEyebrow(slide.eyebrow, category);
  const titleLines = wrapText(slide.title, 16, titleMaxLines(index));
  const bodyLines = slide.body.split("\n").flatMap((part) => wrapText(part, 20, 3)).slice(0, 4);
  const brandColor = categoryColorOnWhite(accent);
  const overlays: sharp.OverlayOptions[] = [
    { input: await textPng("@ keepioo · 정책알리미", TYPE.foot, 888, 46, brandColor, "left", PRETENDARD_MEDIUM_TTF), left: 96, top: 1712 },
  ];

  if (index === 0) {
    const hookLines = wrapText(hookLabel, 23, 2);
    const hookBoxHeight = 82 + hookLines.length * 44;
    overlays.push({
      input: Buffer.from(`<svg width="888" height="${hookBoxHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="888" height="${hookBoxHeight}" rx="28" fill="#FFF7ED"/><rect x="2" y="2" width="884" height="${hookBoxHeight - 4}" rx="26" fill="none" stroke="${brandColor}" stroke-width="4"/></svg>`),
      left: 96,
      top: 310,
    });
    for (let i = 0; i < hookLines.length; i += 1) {
      overlays.push({ input: await textPng(hookLines[i], TYPE.label, 824, 42, brandColor, "left", PRETENDARD_MEDIUM_TTF), left: 128, top: 340 + i * 46 });
    }
    const titleTop = 510;
    const titleLineHeight = 70;
    for (let i = 0; i < titleLines.length; i += 1) {
      overlays.push({ input: await textPng(titleLines[i], TYPE.title, 888, 60, "#191F28"), left: 96, top: titleTop + i * titleLineHeight });
    }
    const boxTop = 940;
    const coverBullets = coverChecklist(category);
    const boxHeight = 130 + coverBullets.length * 76;
    overlays.push({
      input: Buffer.from(`<svg width="888" height="${boxHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="888" height="${boxHeight}" rx="26" fill="#f4f6f9"/></svg>`),
      left: 96,
      top: boxTop,
    });
    overlays.push({ input: await textPng("이 카드에서 확인할 것", TYPE.label, 800, 44, brandColor, "left", PRETENDARD_MEDIUM_TTF), left: 140, top: boxTop + 36 });
    for (let i = 0; i < coverBullets.length; i += 1) {
      overlays.push({ input: Buffer.from(`<svg width="42" height="42" xmlns="http://www.w3.org/2000/svg"><rect width="42" height="42" rx="21" fill="${brandColor}"/><text x="21" y="29" text-anchor="middle" font-size="22" font-weight="700" fill="#ffffff" font-family="Arial, sans-serif">${i + 1}</text></svg>`), left: 140, top: boxTop + 102 + i * 76 });
      overlays.push({ input: await textPng(coverBullets[i], TYPE.body, 720, 50, "#333d4b", "left", PRETENDARD_MEDIUM_TTF), left: 204, top: boxTop + 96 + i * 76 });
    }
    return overlays;
  }

  if (label) {
    overlays.push({ input: await textPng(label, TYPE.label, 888, 44, brandColor, "left", PRETENDARD_MEDIUM_TTF), left: 96, top: 500 });
  }
  for (let i = 0; i < titleLines.length; i += 1) {
    overlays.push({ input: await textPng(titleLines[i], TYPE.title, 888, 60, "#191F28"), left: 96, top: 580 + i * 70 });
  }
  const boxTop = 840;
  const infoBullets = bodyLines.length ? bodyLines : ["대상·금액·신청 조건을", "확인하세요"];
  const boxHeight = Math.max(190, 122 + infoBullets.length * 68);
  overlays.push({
    input: Buffer.from(`<svg width="888" height="${boxHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="888" height="${boxHeight}" rx="26" fill="#f4f6f9"/></svg>`),
    left: 96,
    top: boxTop,
  });
  overlays.push({ input: await textPng("핵심 내용", TYPE.label, 800, 42, brandColor, "left", PRETENDARD_MEDIUM_TTF), left: 140, top: boxTop + 36 });
  for (let i = 0; i < infoBullets.length; i += 1) {
    overlays.push({ input: Buffer.from(`<svg width="12" height="12" xmlns="http://www.w3.org/2000/svg"><circle cx="6" cy="6" r="6" fill="${brandColor}"/></svg>`), left: 144, top: boxTop + 104 + i * 68 });
    overlays.push({ input: await textPng(infoBullets[i], TYPE.body, 760, 48, "#333d4b", "left", PRETENDARD_MEDIUM_TTF), left: 176, top: boxTop + 89 + i * 68 });
  }
  return overlays;
}

async function renderSlidePng(slide: ReelVideoSlide, index: number, dir: string, category: string, accent: string, hookLabel: string): Promise<string> {
  const path = join(dir, `slide-${String(index + 1).padStart(2, "0")}.png`);
  const fullSize = await sharp(Buffer.from(baseSlideSvg(index, accent, category)))
    .composite(await slideComposites(slide, index, category, accent, hookLabel))
    .png()
    .toBuffer();
  await sharp(fullSize).resize(WIDTH, HEIGHT).png().toFile(path);
  return path;
}

function resolveFfmpegPath(): string | null {
  const candidates = [
    ffmpegPath,
    join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg"),
    "/var/task/node_modules/ffmpeg-static/ffmpeg",
  ].filter(Boolean) as string[];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function runFfmpeg(args: string[]): Promise<void> {
  const binary = resolveFfmpegPath();
  if (!binary) return Promise.reject(new Error("ffmpeg-static binary unavailable"));
  return new Promise((resolve, reject) => {
    const child = spawn(binary as string, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code: number | null) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg failed (${code}): ${stderr.slice(-1000)}`));
    });
  });
}

function buildNarration(slides: ReelVideoSlide[]): string {
  const [cover, first, second, third] = slides;
  return [
    cover?.title,
    first?.body,
    second?.body,
    third?.body,
    "자세한 내용은 keepioo에서 확인하세요.",
  ]
    .filter(Boolean)
    .map((part) => String(part).replace(/\n+/g, " ").slice(0, 70))
    .join(". ")
    .replace(/\s+/g, " ")
    .trim();
}

async function createNarrationMp3(text: string, outPath: string): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  // 릴스 자동화는 무음 발행 금지. OpenAI TTS 실패 시 Google Translate 한국어 TTS 로 fallback 하고,
  // 둘 다 실패하면 조용히 무음 MP4를 만들지 않고 실패시킨다.
  if (apiKey) {
    try {
      const res = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: OPENAI_TTS_MODEL,
          voice: OPENAI_TTS_VOICE,
          response_format: "mp3",
          speed: 1.05,
          input: text,
        }),
      });
      if (!res.ok) throw new Error(`OpenAI TTS HTTP ${res.status}`);
      await writeFile(outPath, Buffer.from(await res.arrayBuffer()));
      return;
    } catch (err) {
      console.warn(`[instagram-reel-render] OpenAI TTS failed, fallback to Google TTS: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  await writeFile(outPath, await googleTranslateTts(text));
}

function splitTtsChunks(input: string): string[] {
  const chunks: string[] = [];
  let remaining = input;
  while (remaining.length > 0) {
    const chunk = remaining.slice(0, 180);
    const cut = chunk.length === 180 ? Math.max(chunk.lastIndexOf(". "), chunk.lastIndexOf(" ")) : chunk.length;
    const take = cut > 60 ? cut + 1 : chunk.length;
    chunks.push(remaining.slice(0, take).trim());
    remaining = remaining.slice(take).trim();
  }
  return chunks;
}

async function googleTranslateTts(text: string): Promise<Buffer> {
  const chunks = splitTtsChunks(text);
  const audio: Buffer[] = [];
  for (const chunk of chunks) {
    const url = new URL("https://translate.google.com/translate_tts");
    url.searchParams.set("ie", "UTF-8");
    url.searchParams.set("client", "tw-ob");
    url.searchParams.set("tl", "ko");
    url.searchParams.set("q", chunk);
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`Google TTS HTTP ${res.status}`);
    audio.push(Buffer.from(await res.arrayBuffer()));
  }
  return Buffer.concat(audio);
}

function probeAudioDurationSeconds(filePath: string): Promise<number> {
  const binary = resolveFfmpegPath();
  if (!binary) return Promise.reject(new Error("ffmpeg-static binary unavailable"));
  return new Promise((resolve, reject) => {
    const child = spawn(binary as string, ["-i", filePath], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", () => {
      const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (!match) return reject(new Error("Unable to parse narration duration"));
      resolve(Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]));
    });
  });
}

export async function renderReelVideo(post: ReelVideoPostInput): Promise<RenderReelVideoResult> {
  const plan = buildReelVideoPlan(post);
  const category = post.category ?? "정책정보";
  const accent = getCategoryColor(category);
  const hookLabel = resolveInstagramCardHook({
    title: post.title,
    description: post.meta_description,
    category,
  }).label;
  const dir = await mkdtemp(join(tmpdir(), "keepioo-reel-"));
  const listPath = join(dir, "frames.txt");
  const narrationPath = join(dir, "narration.mp3");
  // slug 는 DB 값이라 정상적으로는 안전하지만, 파일 경로에는 절대 쓰지 않는다.
  // 악의적/손상된 slug(`../`, `/`)가 temp 디렉터리 밖으로 ffmpeg 출력을 쓰는 일을 막는다.
  const outputPath = join(dir, "reel.mp4");
  try {
    const frames: string[] = [];
    for (let i = 0; i < plan.slides.length; i += 1) {
      frames.push(await renderSlidePng(plan.slides[i], i, dir, category, accent, hookLabel));
    }
    await createNarrationMp3(buildNarration(plan.slides), narrationPath);
    const narrationDuration = await probeAudioDurationSeconds(narrationPath);
    const durationSeconds = Math.max(plan.durationSeconds, Math.ceil((narrationDuration + 0.8) * 10) / 10);
    const perSlide = durationSeconds / frames.length;
    const list = frames
      .map((frame) => `file '${frame.replace(/'/g, "'\\''")}'\nduration ${perSlide.toFixed(2)}`)
      .join("\n") + `\nfile '${frames[frames.length - 1].replace(/'/g, "'\\''")}'\n`;
    await writeFile(listPath, list, "utf8");
    await runFfmpeg([
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-i",
      narrationPath,
      "-filter_complex",
      `[0:v]fps=${FPS},format=yuv420p,scale=${WIDTH}:${HEIGHT}[v];[1:a]volume=1.12,apad,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=mono[a]`,
      "-map",
      "[v]",
      "-map",
      "[a]",
      "-t",
      String(durationSeconds),
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-threads",
      "1",
      "-preset",
      "ultrafast",
      "-movflags",
      "+faststart",
      "-r",
      String(FPS),
      outputPath,
    ]);
    return {
      filePath: outputPath,
      durationSeconds,
      cleanup: () => rm(dir, { recursive: true, force: true }),
    };
  } catch (err) {
    await rm(dir, { recursive: true, force: true });
    throw err;
  }
}
