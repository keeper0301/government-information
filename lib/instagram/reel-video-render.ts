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

function frameChrome(index: number, category: string, accent: string, children: ReactNode): ReactElement {
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
      div({ position: "absolute", left: 0, top: 0, width: 12, height: "100%", background: accent }),
      div({ position: "absolute", left: 88, top: 120, background: accent, color: "#fff", borderRadius: 999, padding: "18px 34px", fontSize: 30, fontWeight: 700, lineHeight: 1 }, category),
      children,
      div({ position: "absolute", left: 88, bottom: 108, fontSize: 28, fontWeight: 700, color: brandColor }, "@ keepioo · 정책알리미"),
    ],
  );
}

function renderFrameElement(slide: ReelVideoSlide, index: number, category: string, accent: string, hookLabel: string): ReactElement {
  const brandColor = categoryColorOnWhite(accent);
  const bodyLines = slide.body.split("\n").filter(Boolean);
  if (index === 0) {
    return frameChrome(index, category, accent,
      div({ display: "flex", flexDirection: "column", position: "absolute", left: 88, right: 88, top: 360 }, [
        div({ display: "flex", border: `3px solid ${accent}`, background: "#f8fbff", color: brandColor, borderRadius: 999, padding: "22px 30px", fontSize: 32, fontWeight: 700, lineHeight: 1.18, marginBottom: 36 }, hookLabel),
        div({ display: "flex", flexDirection: "column", fontSize: 76, fontWeight: 700, lineHeight: 1.08, letterSpacing: "-0.03em", color: "#191F28", marginBottom: 36 }, titleTokens(slide.title)),
        div({ display: "flex", flexDirection: "column", background: "#ffffff", border: `4px solid ${accent}`, borderRadius: 34, padding: "34px 38px", gap: 12, maxWidth: 860 }, [
          div({ display: "flex", color: brandColor, fontSize: 30, fontWeight: 700, lineHeight: 1.2 }, bodyLines[0] ?? "핵심"),
          div({ display: "flex", color: "#111827", fontSize: 44, fontWeight: 700, lineHeight: 1.22 }, bodyLines[1] ?? "지원 내용을 먼저 확인"),
        ]),
      ]),
    );
  }

  const label = bodyLines[0] ?? "핵심";
  const factLines = bodyLines.slice(1);
  const factBlocks = (factLines.length > 0 ? factLines : ["공고 기준으로 확인"]).slice(0, 2);
  return frameChrome(index, category, accent,
    div({ display: "flex", flexDirection: "column", position: "absolute", left: 88, right: 88, top: 345 }, [
      div({ display: "flex", flexDirection: "row", alignItems: "center", width: "100%", marginBottom: 38 }, [
        div({ display: "flex", color: brandColor, fontSize: 64, fontWeight: 700, lineHeight: 1, flex: "0 0 auto", marginRight: 20 }, `${index}.`),
        div({ display: "flex", flexWrap: "wrap", flex: 1, minWidth: 0, fontSize: 64, fontWeight: 700, lineHeight: 1.08, letterSpacing: "-0.03em", color: "#191F28" }, titleTokens(slide.title)),
      ]),
      div({ display: "flex", color: brandColor, fontSize: 34, fontWeight: 700, lineHeight: 1.1, marginBottom: 18 }, label),
      div({ display: "flex", flexDirection: "column", gap: 22, maxWidth: 900 },
        factBlocks.map((fact, i) => div({ display: "flex", flexDirection: "row", alignItems: "flex-start", background: "#ffffff", border: `3px solid ${i === 0 ? accent : "#e5e7eb"}`, borderRadius: 34, padding: "32px 34px", gap: 18 }, [
          div({ display: "flex", width: 18, height: 18, borderRadius: 999, background: accent, marginTop: 18, flex: "0 0 auto" }),
          div({ display: "flex", color: "#111827", fontSize: i === 0 ? 46 : 38, fontWeight: i === 0 ? 700 : 500, lineHeight: 1.22, letterSpacing: "-0.015em", flex: 1 }, fact),
        ])),
      ),
      div({ display: "flex", color: "#6b7280", fontSize: 26, fontWeight: 500, lineHeight: 1.35, marginTop: 34 }, "자격·마감은 공고 기준으로 다시 확인"),
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
