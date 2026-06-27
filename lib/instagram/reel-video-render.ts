// ============================================================
// Instagram Reels MP4 renderer
// ============================================================
// sharp 로 1080x1920 PNG 슬라이드를 만들고 ffmpeg-static 으로 H.264/AAC 없는
// 짧은 mp4 로 합친다. 결과 파일은 Meta Graph API video_url 로 쓰기 전
// Supabase public storage 에 올린다.
// ============================================================

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import sharp from "sharp";
import ffmpegPath from "ffmpeg-static";
import { buildReelVideoPlan, type ReelVideoPostInput, type ReelVideoSlide } from "./reel-video-plan";

export type RenderReelVideoResult = {
  filePath: string;
  durationSeconds: number;
  cleanup: () => Promise<void>;
};

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;

function escapeXml(input: string): string {
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

function textLinesSvg(lines: string[], x: number, y: number, fontSize: number, lineHeight: number, weight = 700): string {
  return lines
    .map((line, idx) => `<text x="${x}" y="${y + idx * lineHeight}" font-size="${fontSize}" font-weight="${weight}" fill="#f8fafc">${escapeXml(line)}</text>`)
    .join("\n");
}

function slideSvg(slide: ReelVideoSlide, index: number): string {
  const colors = [
    ["#0f172a", "#2563eb"],
    ["#111827", "#16a34a"],
    ["#18181b", "#ea580c"],
    ["#111827", "#9333ea"],
    ["#020617", "#0ea5e9"],
  ][index % 5];
  const titleLines = wrapText(slide.title, 15, 3);
  const bodyLines = slide.body.split("\n").flatMap((part) => wrapText(part, 19, 3)).slice(0, 5);
  return `
<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${colors[0]}"/>
      <stop offset="100%" stop-color="${colors[1]}"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="24" flood-color="#000000" flood-opacity="0.35"/>
    </filter>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <circle cx="920" cy="210" r="260" fill="#ffffff" opacity="0.08"/>
  <circle cx="120" cy="1680" r="340" fill="#ffffff" opacity="0.07"/>
  <rect x="70" y="170" width="940" height="1580" rx="56" fill="#0f172a" opacity="0.38" filter="url(#shadow)"/>
  <text x="110" y="275" font-size="38" font-weight="800" fill="#bfdbfe">${escapeXml(slide.eyebrow)}</text>
  ${textLinesSvg(titleLines, 110, 500, 88, 112, 900)}
  <rect x="110" y="870" width="140" height="10" rx="5" fill="#facc15"/>
  ${textLinesSvg(bodyLines, 110, 1040, 54, 78, 700)}
  <text x="110" y="1605" font-size="36" font-weight="700" fill="#dbeafe">저장하고 신청 전 다시 확인</text>
  <text x="110" y="1665" font-size="32" font-weight="700" fill="#e2e8f0">keepioo.com</text>
</svg>`;
}

async function renderSlidePng(slide: ReelVideoSlide, index: number, dir: string): Promise<string> {
  const path = join(dir, `slide-${String(index + 1).padStart(2, "0")}.png`);
  await sharp(Buffer.from(slideSvg(slide, index))).png().toFile(path);
  return path;
}

function runFfmpeg(args: string[]): Promise<void> {
  const binary = ffmpegPath;
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

export async function renderReelVideo(post: ReelVideoPostInput): Promise<RenderReelVideoResult> {
  const plan = buildReelVideoPlan(post);
  const dir = await mkdtemp(join(tmpdir(), "keepioo-reel-"));
  const listPath = join(dir, "frames.txt");
  const outputPath = join(dir, `${post.slug}.mp4`);
  try {
    const frames: string[] = [];
    for (let i = 0; i < plan.slides.length; i += 1) {
      frames.push(await renderSlidePng(plan.slides[i], i, dir));
    }
    const perSlide = plan.durationSeconds / frames.length;
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
      "-vf",
      `fps=${FPS},format=yuv420p,scale=${WIDTH}:${HEIGHT}`,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-movflags",
      "+faststart",
      "-r",
      String(FPS),
      outputPath,
    ]);
    return {
      filePath: outputPath,
      durationSeconds: plan.durationSeconds,
      cleanup: () => rm(dir, { recursive: true, force: true }),
    };
  } catch (err) {
    await rm(dir, { recursive: true, force: true });
    throw err;
  }
}
