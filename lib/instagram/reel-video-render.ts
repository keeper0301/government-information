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
const PRETENDARD_TTF = join(process.cwd(), "assets", "Pretendard-Bold.ttf");

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
  const words = normalized.split(" ").filter(Boolean);
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

async function textPng(
  text: string,
  fontSize: number,
  width: number,
  height: number,
  color: string,
  align: "left" | "center" = "left",
): Promise<Buffer> {
  const markup = `<span foreground="${escapeMarkup(color)}" size="${Math.round(fontSize * 1000)}" font_family="Pretendard">${escapeMarkup(text)}</span>`;
  const rendered = await sharp({
    text: {
      text: markup,
      fontfile: PRETENDARD_TTF,
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

async function slideComposites(slide: ReelVideoSlide, category: string, accent: string): Promise<sharp.OverlayOptions[]> {
  const label = labelFromEyebrow(slide.eyebrow, category);
  const titleLines = wrapText(slide.title, 11, 4);
  const bodyLines = slide.body.split("\n").flatMap((part) => wrapText(part, 18, 3)).slice(0, 4);
  const brandColor = categoryColorOnWhite(accent);
  const overlays: sharp.OverlayOptions[] = [
    { input: await textPng("@ keepioo · 정책알리미", 46, 888, 70, brandColor), left: 96, top: 1710 },
  ];
  if (label) {
    overlays.push({ input: await textPng(label, 46, 888, 70, brandColor), left: 96, top: 655 });
  }
  for (let i = 0; i < titleLines.length; i += 1) {
    overlays.push({ input: await textPng(titleLines[i], 76, 888, 100, "#191F28"), left: 96, top: 735 + i * 100 });
  }
  const boxTop = 735 + titleLines.length * 100 + 50;
  const boxHeight = Math.max(108, 76 + bodyLines.length * 62);
  overlays.push({
    input: Buffer.from(`<svg width="888" height="${boxHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="888" height="${boxHeight}" rx="26" fill="#f4f6f9"/></svg>`),
    left: 96,
    top: boxTop,
  });
  for (let i = 0; i < bodyLines.length; i += 1) {
    overlays.push({ input: await textPng(bodyLines[i], 46, 800, 62, "#333d4b"), left: 140, top: boxTop + 38 + i * 62 });
  }
  return overlays;
}

async function renderSlidePng(slide: ReelVideoSlide, index: number, dir: string, category: string, accent: string): Promise<string> {
  const path = join(dir, `slide-${String(index + 1).padStart(2, "0")}.png`);
  const fullSize = await sharp(Buffer.from(baseSlideSvg(index, accent, category)))
    .composite(await slideComposites(slide, category, accent))
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
  const dir = await mkdtemp(join(tmpdir(), "keepioo-reel-"));
  const listPath = join(dir, "frames.txt");
  const narrationPath = join(dir, "narration.mp3");
  // slug 는 DB 값이라 정상적으로는 안전하지만, 파일 경로에는 절대 쓰지 않는다.
  // 악의적/손상된 slug(`../`, `/`)가 temp 디렉터리 밖으로 ffmpeg 출력을 쓰는 일을 막는다.
  const outputPath = join(dir, "reel.mp4");
  try {
    const frames: string[] = [];
    for (let i = 0; i < plan.slides.length; i += 1) {
      frames.push(await renderSlidePng(plan.slides[i], i, dir, category, accent));
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
