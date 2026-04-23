// ============================================================
// 디버그 전용 — collect 단계별 추적 (streaming response)
// ============================================================
// 일반 /api/collect 는 stuck 시 응답 0 bytes 라 어디서 멈췄는지 알 수 없음.
// 이 endpoint 는 ReadableStream 으로 단계별 chunk 를 즉시 보내므로
// 함수가 도중에 stuck 되더라도 클라이언트는 그 직전까지의 trace 를 받음.
//
// 사용:
//   curl -N -H "Authorization: Bearer $CRON_SECRET" \
//     "https://www.keepioo.com/api/debug/collect-stream?source=local-welfare"
// ============================================================

import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return new Response("CRON_SECRET 미설정", { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return new Response("unauthorized", { status: 401 });
  }
  const source = request.nextUrl.searchParams.get("source") || "local-welfare";

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const t0 = Date.now();
      const send = (s: string) => {
        const ts = new Date().toISOString().slice(11, 23);
        const elapsed = `+${Date.now() - t0}ms`;
        controller.enqueue(enc.encode(`[${ts} ${elapsed}] ${s}\n`));
      };

      try {
        send(`route 진입 source=${source}`);

        // 1) Supabase admin client 생성
        const supabase = createAdminClient();
        send(`createAdminClient OK`);

        // 2) collector module dynamic import
        send(`getAllCollectors module import 시작`);
        const collectorsModule = await import("@/lib/collectors");
        send(`module import 완료`);

        // 3) registry 평가 (각 collector 도 dynamic import)
        const collectors = await collectorsModule.getAllCollectors();
        send(`getAllCollectors() 완료 count=${collectors.length}`);

        // 4) source 찾기
        const collector = collectors.find((c) => c.sourceCode === source);
        if (!collector) {
          send(`ERROR: source=${source} 못 찾음`);
          controller.close();
          return;
        }
        send(`찾음: ${collector.label} enabled=${collector.enabled()}`);

        // 5) source_fetch_log SELECT
        send(`source_fetch_log SELECT 시작`);
        const { data: logRow, error: selectErr } = await supabase
          .from("source_fetch_log")
          .select("last_fetched_at")
          .eq("source_code", source)
          .maybeSingle();
        if (selectErr) {
          send(`SELECT 에러: ${selectErr.message}`);
        } else {
          send(`SELECT OK lastFetchedAt=${logRow?.last_fetched_at || "null"}`);
        }

        // 6) fetch generator 호출 — 첫 페이지 요청만 + 첫 yield 만 받기
        send(`fetch generator 호출`);
        const lastFetchedAt = logRow?.last_fetched_at
          ? new Date(logRow.last_fetched_at)
          : null;
        const gen = collector.fetch({ lastFetchedAt });

        send(`generator.next() 호출 (첫 item 대기)`);
        const firstNext = await gen.next();
        if (firstNext.done) {
          send(`generator 즉시 종료 (item 0건)`);
        } else {
          send(`첫 item OK title="${firstNext.value.title.slice(0, 40)}..."`);
        }

        // 7) 두번째 item 받기
        send(`generator.next() 두번째 호출`);
        const secondNext = await gen.next();
        send(
          secondNext.done
            ? `generator 종료 (item 1건만)`
            : `두번째 item OK`,
        );

        // 8) 모든 나머지 item drain (DB upsert 없이)
        send(`나머지 item drain 시작`);
        let count = 2;
        for await (const _item of {
          [Symbol.asyncIterator]() {
            return gen;
          },
        } as AsyncIterable<unknown>) {
          count++;
          if (count % 100 === 0) {
            send(`item ${count} 도착`);
          }
        }
        send(`drain 완료 totalItems=${count}`);

        controller.close();
      } catch (err) {
        send(`THROWN: ${err instanceof Error ? err.message : String(err)}`);
        if (err instanceof Error && err.stack) {
          send(`STACK: ${err.stack.split("\n").slice(0, 3).join(" | ")}`);
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
