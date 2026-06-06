// ============================================================
// /api/publish-blog — 블로그 글 자동 발행 (cron)
// ============================================================
// 매일 1번 GitHub Actions 에서 호출 (Vercel cron 이 아님).
// Vercel Hobby 의 60초 maxDuration 한도 + ±59분 랜덤 윈도우 이슈 회피 목적.
// GitHub Actions 는 분 단위 정확도 + step 분리로 timeout 우회 가능.
//
// 인증:
//   Authorization: Bearer ${CRON_SECRET} 헤더 검증.
//   외부 노출 금지 — 동일 시크릿 가진 호출만 통과.
//
// 동작 (GET ?count=N):
//   1) 베이스 날짜 + 0, +1, +2 ... 일치 N개 카테고리 선택 (최대 3)
//   2) Promise.allSettled 로 병렬 발행 (한 개 실패해도 나머지 진행)
//   3) 각 카테고리별 정책 1개 골라서 Gemini → DB 저장
//   4) 실패한 카테고리만 모아서 운영자 알림
//
// 수동 테스트 (POST):
//   POST { dryRun: true, category: "청년" } — DB 저장 안 하고 결과만
//   POST { category: "청년" } — 특정 카테고리로 1글 발행
//   POST {} — 오늘 요일 카테고리로 1글 발행
//
// 2026-04-24 복구: 커밋 76ff8ab 에서 폐기됐다가 옵션 C (품질 가드 추가) 로 복원.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { publishOnePost, getTodayCategory } from "@/lib/blog-publish";
import { notifyCronFailure } from "@/lib/email";
import { logAdminAction, type AdminActionType } from "@/lib/admin-actions";
import { sendOpsAlertMultichannel } from "@/lib/notifications/ops-alert-multichannel";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  authorizePrivateCronRequest,
  isPrivateCronRequestAuthorized,
} from "@/lib/cron-auth";

// AI 호출이 30초 이상 걸릴 수 있어 Vercel 함수 timeout 늘림.
// 2026-06-06: 한 글 최악 경로 = Gemini timeout(45s) + OpenAI fallback(35s) + 품질검수 LLM(12s)
// ≈ 92s. 폴백 발동 시 90s 초과로 함수가 잘려 "글은 DB 저장됐는데 cron 은 실패로 오집계"
// 되는 어긋남을 막기 위해 110s 로 상향(Pro 플랜, 코드리뷰 P1).
export const maxDuration = 110;

// G1 (5/17) — Gemini quota 사고 24h cooldown + 텔레그램 알림.
// admin_actions.gemini_quota_alert 가 24h 내 있으면 skip (알림 폭주 차단).
async function sendGeminiQuotaAlertIfNew(
  failures: Array<{ category: string; error?: string }>,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { count } = await admin
      .from("admin_actions")
      .select("id", { count: "exact", head: true })
      .eq("action", "gemini_quota_alert")
      .gte("created_at", since);
    if ((count ?? 0) > 0) return; // 24h cooldown 통과

    const failureSummary = failures
      .map((f) => `[${f.category}] ${f.error?.slice(0, 80) ?? ""}`)
      .join("\n");
    await sendOpsAlertMultichannel({
      subject: "[keepioo] Gemini 월 한도 도달 — blog 발행 멈춤",
      message: [
        `🚨 Gemini API 429 (spending cap / RESOURCE_EXHAUSTED) 감지.`,
        `blog 발행 ${failures.length}건 모두 실패.`,
        ``,
        `[조치] https://aistudio.google.com/spend 에서 월 지출 한도 인상.`,
        `또는 다른 모델 (OpenAI) 임시 fallback 검토.`,
        ``,
        `[실패 사유 ${failures.length}건]`,
        failureSummary.slice(0, 500),
      ].join("\n"),
      link: "https://aistudio.google.com/spend",
    });
    await logAdminAction({
      actorId: null,
      action: "gemini_quota_alert" as AdminActionType,
      details: { failures: failures.length, summary: failureSummary.slice(0, 300) },
    });
  } catch (e) {
    console.error("[publish-blog] gemini quota alert 실패:", e);
  }
}

// 2026-05-18 사고 학습 — OpenAI gpt-4o-mini jsonMode 가 본문 591~859자 짧게 반환.
// quota detection regex 매칭 안 됨 → 24h 사각. short content N건+ 누적 시 별도 알림.
// 24h cooldown — blog_short_content_alert audit 매칭 (gemini_quota_alert 동일 패턴).
async function sendShortContentAlertIfNew(
  failures: Array<{ category: string; error?: string }>,
  shortContentCount: number,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { count } = await admin
      .from("admin_actions")
      .select("id", { count: "exact", head: true })
      .eq("action", "blog_short_content_alert")
      .gte("created_at", since);
    if ((count ?? 0) > 0) return;

    const sample = failures
      .filter((f) => /본문이 너무 짧음/.test(f.error ?? ""))
      .slice(0, 3)
      .map((f) => `[${f.category}] ${f.error?.slice(0, 60) ?? ""}`)
      .join("\n");
    await sendOpsAlertMultichannel({
      subject: "[keepioo] 블로그 본문 짧음 사고 의심",
      message: [
        `LLM 이 본문 짧게 반환 ${shortContentCount}건 누적 (가드 차단).`,
        ``,
        `[의심 원인]`,
        `1. LLM 모델 변경 후 prompt 조정 부족 (5/18 OpenAI 마이그 사고 패턴)`,
        `2. Gemini 한도 ↓ 등 부분 응답`,
        `3. prompt 변경으로 본문 토큰 분산`,
        ``,
        `[조치] lib/ai.ts 의 maxTokens·model·jsonMode 확인 + admin_actions.blog_publish_run details 검토`,
        ``,
        `[샘플]`,
        sample,
      ].join("\n"),
      link: "https://www.keepioo.com/admin/autonomous",
    });
    await logAdminAction({
      actorId: null,
      action: "blog_short_content_alert" as AdminActionType,
      details: { short_content_count: shortContentCount, sample: sample.slice(0, 300) },
    });
  } catch (e) {
    console.error("[publish-blog] short content alert 실패:", e);
  }
}

// 2026-06-05 — Gemini 실패 시 OpenAI(gpt-4o) 비상 백업(lib/ai.ts)이 발동하면 조기경보.
// blog 는 정상 발행돼 사장님이 모를 수 있고, gpt-4o 비용은 usage 추적 밖이라 장기 지속 시
// 5/17 "조용히 돈 나감" 패턴 재현 우려. 24h cooldown(blog_openai_fallback_alert audit 매칭).
async function sendOpenAIFallbackAlertIfNew(categories: string[]): Promise<void> {
  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { count } = await admin
      .from("admin_actions")
      .select("id", { count: "exact", head: true })
      .eq("action", "blog_openai_fallback_alert")
      .gte("created_at", since);
    if ((count ?? 0) > 0) return; // 24h cooldown 통과

    await sendOpsAlertMultichannel({
      subject: "[keepioo] Gemini 막힘 — OpenAI 백업으로 blog 발행 중",
      message: [
        `⚠️ Gemini 블로그 생성 실패 → OpenAI(gpt-4o) 비상 백업으로 발행됨.`,
        `대상 카테고리: ${categories.join(", ")}`,
        ``,
        `blog 는 정상 발행되지만 Gemini 가 막힌 상태이며 gpt-4o 단가가 더 높습니다.`,
        `[조치] AI Studio 에서 Gemini 선불 잔액/자동충전·quota 점검.`,
        `(Gemini 복구되면 자동으로 Gemini 발행으로 돌아갑니다.)`,
      ].join("\n"),
      link: "https://aistudio.google.com/usage",
    });
    await logAdminAction({
      actorId: null,
      action: "blog_openai_fallback_alert" as AdminActionType,
      details: { categories: categories.slice(0, 7) },
    });
  } catch (e) {
    console.error("[publish-blog] openai fallback alert 실패:", e);
  }
}

async function logPublishBlogRun(details: Record<string, unknown>) {
  try {
    await logAdminAction({
      actorId: null,
      action: "blog_publish_run" as AdminActionType,
      details,
    });
  } catch (e) {
    console.warn("[publish-blog] audit 실패:", (e as Error).message);
  }
}

export async function POST(request: NextRequest) {
  // 1) 인증
  const denied = authorizePrivateCronRequest(request);
  if (denied) return denied;

  // 2) body 파싱
  let opts: { category?: string; dryRun?: boolean } = {};
  try {
    opts = await request.json().catch(() => ({}));
  } catch {
    // body 없음 OK
  }

  try {
    const result = await publishOnePost(opts);
    if (!opts.dryRun) {
      await logPublishBlogRun({
        mode: "post",
        category: opts.category || result.generated.category,
        count: 1,
        success: 1,
        failed: 0,
        externalPublishHeld: result.externalPublishHeld,
        qualityScore: result.qualityReview?.score ?? null,
        slug: result.slug,
        sourceProgramId: result.sourceProgramId,
        sourceProgramType: result.sourceProgramType,
        // 어느 LLM 으로 생성됐는지 — "openai" 면 Gemini 실패로 비상 백업 발동.
        provider: result.generated._provider ?? "gemini",
      });
    }

    return NextResponse.json({
      message: result.dryRun ? "Dry run 성공 (DB 저장 안 함)" : "글 발행 완료",
      slug: result.slug,
      title: result.generated.title,
      category: result.generated.category,
      tags: result.generated.tags,
      readingTime: result.reading,
      sourceProgramId: result.sourceProgramId,
      sourceProgramType: result.sourceProgramType,
      qualityReview: result.qualityReview,
      externalPublishHeld: result.externalPublishHeld,
      url: result.dryRun ? null : `/blog/${result.slug}`,
      // dryRun 일 때만 본문·FAQ·meta 도 응답에 포함 (검토용)
      ...(result.dryRun && {
        meta_description: result.generated.meta_description,
        content: result.generated.content,
        faqs: result.generated.faqs,
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    const category = opts.category || getTodayCategory();
    // dryRun 실패는 무음 (수동 테스트), 진짜 발행 실패만 운영자에게 알림
    if (!opts.dryRun) {
      await logPublishBlogRun({
        mode: "post",
        category,
        count: 1,
        success: 0,
        failed: 1,
        error: message.slice(0, 300),
      });
      await notifyCronFailure("publish-blog (POST)", message, `카테고리: ${category}`);
    }
    return NextResponse.json(
      { error: "발행 실패", detail: message, category },
      { status: 500 },
    );
  }
}

// GET 은 GitHub Actions cron 호출용. 인증된 GET 은 자동 발행 (오늘 카테고리).
// 인증 없으면 디버깅용 상태 응답.
export async function GET(request: NextRequest) {
  const authed = isPrivateCronRequestAuthorized(request);

  if (!authed) {
    return NextResponse.json({
      message: "인증된 GET 또는 POST 로 호출하세요. 인증: Authorization: Bearer ${CRON_SECRET}",
      todayCategory: getTodayCategory(),
    });
  }

  // ?count=N (1~3) — 여러 글 한 번에 발행 (베이스 날짜 + 0, +1, +2 카테고리)
  // ?offset=N — 베이스 날짜를 오늘 +N 일로 조정 (GitHub Actions 에서 count=1 × 여러 step 으로 분리 호출 시 사용)
  //
  // Hobby 60초 maxDuration 한도 때문에 실제 운영은 count=1 + offset 0/1 조합으로
  // 별도 호출하는 게 안정적 (Gemini 호출 타임아웃 시 504 회피)
  const countParam = parseInt(request.nextUrl.searchParams.get("count") || "1", 10);
  const count = Math.min(Math.max(countParam, 1), 3);
  const offsetParam = parseInt(request.nextUrl.searchParams.get("offset") || "0", 10);
  const offset = Math.max(Math.min(offsetParam, 6), 0);

  // 카테고리 목록 결정 (베이스 = 오늘 + offset 일, 그로부터 +0, +1, +2)
  const categories: string[] = [];
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + offset);
  for (let i = 0; i < count; i++) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + i);
    categories.push(getTodayCategory(d));
  }

  // 병렬 발행 — 한 개 실패해도 나머지는 진행 (allSettled)
  const settled = await Promise.allSettled(
    categories.map((cat) => publishOnePost({ category: cat })),
  );

  // 결과 정리
  const results = settled.map((s, i) => {
    if (s.status === "fulfilled") {
      return {
        category: categories[i],
        ok: true,
        slug: s.value.slug,
        title: s.value.generated.title,
        url: `/blog/${s.value.slug}`,
        qualityReview: s.value.qualityReview,
        externalPublishHeld: s.value.externalPublishHeld,
        // Gemini 비용 추적 (5/17, autonomous hub 카드)
        usage: s.value.generated._usage ?? null,
        // 어느 LLM 으로 생성됐는지 — "openai" 면 Gemini 실패로 비상 백업 발동 (2026-06-05)
        provider: s.value.generated._provider ?? "gemini",
      };
    }
    return {
      category: categories[i],
      ok: false,
      error: s.reason instanceof Error ? s.reason.message : String(s.reason),
      provider: null as "gemini" | "openai" | null,
    };
  });

  // 실패한 카테고리만 모아서 알림 (성공 1+ 면 200, 모두 실패면 500)
  const failures = results.filter((r) => !r.ok);
  await logPublishBlogRun({
    mode: "cron",
    count,
    offset,
    categories,
    success: results.filter((r) => r.ok).length,
    failed: failures.length,
    externalPublishHeld: results.filter(
      (r) => r.ok && r.externalPublishHeld,
    ).length,
    results: results.map((r) => ({
      category: r.category,
      ok: r.ok,
      slug: r.ok ? r.slug : null,
      externalPublishHeld: r.ok ? r.externalPublishHeld : null,
      error: r.ok ? null : String(r.error).slice(0, 160),
      // Gemini token 누적 (autonomous hub Gemini 지출 카드)
      usage: r.ok ? r.usage : null,
      // 생성 LLM ("openai" = Gemini 실패로 비상 백업 발동, 2026-06-05)
      provider: r.provider ?? null,
    })),
  });
  if (failures.length > 0) {
    const detail = failures.map((f) => `[${f.category}] ${f.error}`).join("\n");
    await notifyCronFailure("publish-blog (cron)", detail, `count=${count}`);

    // G1 (5/17 사고 후속) — Gemini quota 사고 자동 감지 + 텔레그램 명확 안내.
    // 5/14 사고 시 email 알림은 사장님 inbox 확인 안 해 2.5일 멈춤. 텔레그램 즉시.
    // 24h cooldown — gemini_quota_alert audit 매칭으로 중복 알림 차단.
    const quotaHit = failures.some((f) =>
      /spending cap|RESOURCE_EXHAUSTED|Too Many Requests|429/i.test(f.error ?? ""),
    );
    if (quotaHit) {
      await sendGeminiQuotaAlertIfNew(failures);
    }

    // 2026-05-18 사고 학습 — OpenAI gpt-4o-mini jsonMode 가 본문 591~859자 반환
    // 26회 연속 사각 (quota regex 매칭 X → SMS·텔레그램 무음 24h).
    // "본문이 너무 짧음" 가드 사고가 N건+ 누적 시 별도 알림 (24h cooldown).
    // 미래 LLM 마이그 (gpt-4o / claude / 기타) 시 동일 사각 차단.
    const shortContentCount = failures.filter((f) =>
      /본문이 너무 짧음/.test(f.error ?? ""),
    ).length;
    if (shortContentCount >= 3) {
      await sendShortContentAlertIfNew(failures, shortContentCount);
    }
  }

  // OpenAI 비상 백업 발동 감지 — Gemini 가 막혀 gpt-4o 로 성공 발행된 케이스 조기경보
  // (blog 는 정상이라 사장님이 모를 수 있음 + gpt-4o 비용 가시화). 24h cooldown.
  const fallbackCats = results
    .filter((r) => r.ok && r.provider === "openai")
    .map((r) => r.category);
  if (fallbackCats.length > 0) {
    await sendOpenAIFallbackAlertIfNew(fallbackCats);
  }

  const status = results.every((r) => !r.ok) ? 500 : 200;
  return NextResponse.json(
    {
      message: status === 200 ? "발행 완료" : "모든 카테고리 발행 실패",
      count,
      success: results.filter((r) => r.ok).length,
      failed: failures.length,
      results,
    },
    { status },
  );
}
