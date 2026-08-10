import { access, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";
import { renderReelVideo } from "@/lib/instagram/reel-video-render";

let fixtureDir: string;
let narrationFixture: Buffer;
const originalFetch = globalThis.fetch;

async function pixelAt(path: string, x: number, y: number): Promise<[number, number, number]> {
  const image = sharp(path).removeAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const offset = (y * info.width + x) * info.channels;
  return [data[offset], data[offset + 1], data[offset + 2]];
}

beforeAll(async () => {
  fixtureDir = await mkdtemp(join(tmpdir(), "keepioo-reel-test-"));
  const mp3Path = join(fixtureDir, "narration.mp3");
  const result = spawnSync(ffmpegPath as string, [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=880:duration=1.2",
    "-q:a",
    "9",
    "-acodec",
    "libmp3lame",
    mp3Path,
  ], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`fixture ffmpeg failed: ${result.stderr}`);
  narrationFixture = await readFile(mp3Path);
});

beforeEach(() => {
  delete process.env.OPENAI_API_KEY;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://translate.google.com/translate_tts")) {
      return new Response(new Uint8Array(narrationFixture), {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      });
    }
    return originalFetch(input, init);
  }));
});

afterAll(async () => {
  vi.unstubAllGlobals();
  if (fixtureDir) await rm(fixtureDir, { recursive: true, force: true });
});

describe("renderReelVideo", () => {
  it("renders a vertical mp4 file with an audio track without using slug as path", async () => {
    const rendered = await renderReelVideo({
      slug: "../unsafe/nested-slug",
      title: "청년 월세 지원 신청 안내",
      category: "청년",
      meta_description: "소득 조건을 충족한 청년에게 월세를 지원합니다.",
      content: "신청 기간과 제출 서류를 확인하세요. 대상과 금액은 지역별로 다를 수 있습니다.",
    });
    try {
      await access(rendered.filePath);
      const info = await stat(rendered.filePath);
      expect(info.size).toBeGreaterThan(10_000);
      expect(rendered.durationSeconds).toBeGreaterThanOrEqual(15);
      expect(basename(rendered.filePath)).toBe("reel.mp4");
      const probe = spawnSync(ffmpegPath as string, ["-i", rendered.filePath], { encoding: "utf8" });
      const stderr = probe.stderr ?? "";
      expect(stderr).toContain("Video:");
      expect(stderr).toContain("Audio:");
      const framePath = join(fixtureDir, "first-frame.png");
      const frame = spawnSync(ffmpegPath as string, [
        "-y",
        "-ss",
        "1",
        "-i",
        rendered.filePath,
        "-frames:v",
        "1",
        framePath,
      ], { encoding: "utf8" });
      expect(frame.status, frame.stderr).toBe(0);
      const [barR, barG, barB] = await pixelAt(framePath, 5, 100);
      expect(barB).toBeGreaterThan(barR);
      expect(barB).toBeGreaterThan(barG);
      const [bgR, bgG, bgB] = await pixelAt(framePath, 270, 100);
      expect(bgR).toBeGreaterThan(235);
      expect(bgG).toBeGreaterThan(235);
      expect(bgB).toBeGreaterThan(235);
    } finally {
      await rendered.cleanup();
    }
  }, 60_000);
});
