// ============================================================
// Instagram Reels MP4 renderer
// ============================================================
// sharp 로 세로 PNG 슬라이드를 만들고 ffmpeg-static 으로 H.264/AAC
// 내레이션 포함 mp4 로 합친다. 결과 파일은 Meta Graph API video_url 로 쓰기 전
// Supabase public storage 에 올린다.
// ============================================================

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { createElement, type CSSProperties, type ReactElement, type ReactNode } from "react";
import satori from "satori";
import sharp from "sharp";
import ffmpegPath from "ffmpeg-static";
import { buildReelVideoPlan, type ReelVideoPostInput, type ReelVideoSlide } from "./reel-video-plan";
import { categoryColorOnWhite, getCategoryColor } from "./card-colors";
import { resolveInstagramCardHook } from "./card-hook";
import { tokenizeSemantic } from "./card-text";

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

const h = createElement;

let fontDataPromise: Promise<{ bold: Buffer; medium: Buffer }> | null = null;
function loadFrameFonts(): Promise<{ bold: Buffer; medium: Buffer }> {
  if (!fontDataPromise) {
    fontDataPromise = Promise.all([
      readFile(PRETENDARD_BOLD_TTF),
      readFile(PRETENDARD_MEDIUM_TTF),
    ]).then(([bold, medium]) => ({ bold, medium }));
  }
  return fontDataPromise;
}

function coverChecklist(category: string): string[] {
  if (/주거|월세|전세|임대/.test(category)) return ["대상 조건", "지원 금액", "신청 마감"];
  if (/육아|가족|아동|출산|보육/.test(category)) return ["대상 연령", "이용 방법", "기간·주의사항"];
  if (/창업|소상공|사업|자영/.test(category)) return ["대상 업종", "지원 내용", "신청처"];
  return ["대상 조건", "지원 내용", "신청 방법"];
}

function labelFromEyebrow(eyebrow: string, category: string): string {
  return eyebrow.replace(`${category} · keepioo`, "").trim() || eyebrow;
}

function div(style: CSSProperties, children?: ReactNode): ReactElement {
  return h("div", { style: { display: "flex", ...style } }, children);
}

function titleTokens(title: string): ReactElement {
  return div(
    { display: "flex", flexWrap: "wrap", width: "100%", alignItems: "baseline" },
    tokenizeSemantic(title).map((token, i, arr) =>
      div(
        {
          display: "flex",
          marginRight: i === arr.length - 1 ? 0 : "0.32em",
          marginBottom: "0.34em",
        },
        token,
      ),
    ),
  );
}

function infoBulletsForSlide(slide: ReelVideoSlide, index: number): string[] {
  const explicit = slide.body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => line.length > 44 ? line.split(/(?<=요\.|다\.|세요\.)\s+/).map((part) => part.trim()).filter(Boolean) : [line])
    .slice(0, 3);
  const fallbacks = index === 1
    ? ["대상 조건 먼저 확인", "지역·연령 기준 확인", "상세 글에서 예외 확인"]
    : index === 2
      ? ["신청 전 마감 확인", "필요 서류 확인", "신청처 링크 확인"]
      : ["지원 내용 확인", "주의사항 확인", "저장해두고 다시 확인"];
  return [...explicit, ...fallbacks].slice(0, 3);
}

function frameChrome(index: number, category: string, accent: string, children: ReactNode): ReactElement {
  const fillPct = (index + 1) * 20;
  const brandColor = categoryColorOnWhite(accent);
  return div(
    {
      display: "flex",
      flexDirection: "column",
      width: DESIGN_WIDTH,
      height: DESIGN_HEIGHT,
      background: "#fff",
      color: "#191F28",
      fontFamily: "Pretendard",
      position: "relative",
      padding: "150px 96px 96px 96px",
    },
    [
      div({ position: "absolute", left: 0, top: 0, width: 22, height: "100%", background: accent }),
      div({ position: "absolute", left: 96, top: 150, background: accent, color: "#fff", borderRadius: 999, padding: "20px 42px", fontSize: 40, fontWeight: 700, lineHeight: 1 }, category),
      div({ position: "absolute", right: 96, top: 156, background: "#2b2b31", color: "#fff", borderRadius: 999, padding: "18px 34px", fontSize: 34, fontWeight: 700, lineHeight: 1 }, `${index + 1}/5`),
      children,
      div({ position: "absolute", left: 96, bottom: 150, fontSize: 34, fontWeight: 500, color: brandColor }, "@ keepioo · 정책알리미"),
      div({ position: "absolute", left: 96, right: 96, bottom: 96, height: 14, borderRadius: 99, background: "#e7eaef" },
        div({ height: "100%", width: `${fillPct}%`, borderRadius: 99, background: accent }),
      ),
    ],
  );
}

function renderFrameElement(slide: ReelVideoSlide, index: number, category: string, accent: string, hookLabel: string): ReactElement {
  const brandColor = categoryColorOnWhite(accent);
  if (index === 0) {
    return frameChrome(index, category, accent,
      div({ display: "flex", flexDirection: "column", position: "absolute", left: 96, right: 96, top: 300, bottom: 245 }, [
        div({ display: "flex", alignSelf: "flex-start", background: "#FFF7ED", color: brandColor, border: `4px solid ${brandColor}`, borderRadius: 28, padding: "20px 28px", fontSize: 32, fontWeight: 500, lineHeight: 1.35, marginBottom: 54 }, hookLabel),
        div({ display: "flex", flexWrap: "wrap", width: "100%", fontSize: 64, fontWeight: 700, lineHeight: 1.24, letterSpacing: "-0.01em", color: "#191F28", marginBottom: 28 }, titleTokens(slide.title)),
        slide.kicker ? div({ display: "flex", color: "#6b7280", fontSize: 26, fontWeight: 500, lineHeight: 1.42, marginBottom: 62, maxWidth: 820 }, slide.kicker) : null,
        div({ display: "flex", flexDirection: "column", background: "#f4f6f9", borderRadius: 28, padding: "36px 44px", gap: 28, marginTop: 86 }, [
          div({ display: "flex", color: brandColor, fontSize: 34, fontWeight: 500 }, "이 카드에서 확인할 것"),
          ...coverChecklist(category).map((item, i) => div({ display: "flex", alignItems: "center", gap: 20, fontSize: 42, fontWeight: 500, color: "#333d4b", lineHeight: 1.35 }, [
            div({ display: "flex", alignItems: "center", justifyContent: "center", width: 46, height: 46, borderRadius: 999, background: brandColor, color: "#fff", fontSize: 24, fontWeight: 700, flexShrink: 0 }, String(i + 1)),
            div({ display: "flex" }, item),
          ])),
        ]),
      ]),
    );
  }

  const bodyLines = infoBulletsForSlide(slide, index);
  return frameChrome(index, category, accent,
    div({ display: "flex", flexDirection: "column", position: "absolute", left: 96, right: 96, top: 430, bottom: 245 }, [
      div({ display: "flex", color: brandColor, fontSize: 34, fontWeight: 500, marginBottom: 42 }, labelFromEyebrow(slide.eyebrow, category)),
      div({ display: "flex", flexWrap: "wrap", width: "100%", fontSize: 56, fontWeight: 700, lineHeight: 1.3, color: "#191F28", marginBottom: 58 }, titleTokens(slide.title)),
      div({ display: "flex", flexDirection: "column", background: "#f4f6f9", borderRadius: 28, padding: "42px 46px", gap: 32 }, [
        div({ display: "flex", color: brandColor, fontSize: 34, fontWeight: 500 }, "핵심 내용"),
        ...bodyLines.map((line) => div({ display: "flex", alignItems: "flex-start", gap: 20, fontSize: 38, fontWeight: 500, color: "#333d4b", lineHeight: 1.42 }, [
          div({ display: "flex", width: 14, height: 14, borderRadius: 99, background: brandColor, marginTop: 18, flexShrink: 0 }),
          div({ display: "flex", flexWrap: "wrap" }, line),
        ])),
      ]),
    ]),
  );
}

async function renderSlidePng(slide: ReelVideoSlide, index: number, dir: string, category: string, accent: string, hookLabel: string): Promise<string> {
  const path = join(dir, `slide-${String(index + 1).padStart(2, "0")}.png`);
  const { bold, medium } = await loadFrameFonts();
  const svg = await satori(renderFrameElement(slide, index, category, accent, hookLabel), {
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
    fonts: [
      { name: "Pretendard", data: bold, style: "normal", weight: 700 },
      { name: "Pretendard", data: medium, style: "normal", weight: 500 },
    ],
  });
  const fullSize = Buffer.from(svg);
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
