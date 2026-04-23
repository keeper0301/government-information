import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyCronFailure } from "@/lib/email";

async function runEnrichAndRespond(jobLabel: string) {
  try {
    const supabase = createAdminClient();
    const result = await enrichBatch(supabase);

    // 50% 이상 실패 시 알림 (외부 API quota 초과·서비스 다운 등 감지)
    // P3-B dedupe 덕분에 같은 원인이면 24h 메일 1통만.
    if (
      result.total_candidates &&
      result.total_candidates > 0 &&
      (result.failed ?? 0) / result.total_candidates >= 0.5
    ) {
      await notifyCronFailure(
        `${jobLabel} - 보강 실패율 ${result.failed}/${result.total_candidates}`,
        `외부 API (data.go.kr NationalWelfareDetail) 응답 이상. quota 초과·서비스 다운 가능성.`,
      );
    }

    return NextResponse.json({ timestamp: new Date().toISOString(), ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    await notifyCronFailure(jobLabel, message);
    return NextResponse.json({ error: "보강 실패", detail: message }, { status: 500 });
  }
}

const DATA_GO_KR_KEY = process.env.DATA_GO_KR_API_KEY || "";
const DETAIL_API =
  "https://apis.data.go.kr/B554287/NationalWelfareInformationsV001/NationalWelfareDetailV001";

function parseXmlTag(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match
    ? match[1]
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/<[^>]*>/g, "")
        .trim()
    : null;
}

async function enrichOne(
  supabase: ReturnType<typeof createAdminClient>,
  row: { id: string; serv_id: string },
) {
  try {
    const params = new URLSearchParams({
      serviceKey: DATA_GO_KR_KEY,
      servId: row.serv_id,
    });
    const res = await fetch(`${DETAIL_API}?${params}`, { cache: "no-store" });
    if (!res.ok) return false;

    const xml = await res.text();

    const eligibility = parseXmlTag(xml, "tgtrDtlCn");
    const selectionCriteria = parseXmlTag(xml, "slctCritCn");
    const detailedContent = parseXmlTag(xml, "aplyDtlCn");
    const applyMethod = parseXmlTag(xml, "aplWayContent");
    const contactInfo = parseXmlTag(xml, "inqplCtadrList");
    const requiredDocs = parseXmlTag(xml, "sbmsnDocCn");

    const update: Record<string, string | null> = {
      last_enriched_at: new Date().toISOString(),
    };
    if (eligibility) update.eligibility = eligibility.substring(0, 2000);
    if (selectionCriteria) update.selection_criteria = selectionCriteria.substring(0, 2000);
    if (detailedContent) update.detailed_content = detailedContent.substring(0, 5000);
    if (applyMethod) update.apply_method = applyMethod.substring(0, 1000);
    if (contactInfo) update.contact_info = contactInfo.substring(0, 1000);
    if (requiredDocs) update.required_documents = requiredDocs.substring(0, 2000);

    const { error } = await supabase
      .from("welfare_programs")
      .update(update)
      .eq("id", row.id);

    return !error;
  } catch {
    return false;
  }
}

async function enrichBatch(supabase: ReturnType<typeof createAdminClient>) {
  if (!DATA_GO_KR_KEY) return { enriched: 0, error: "API key not set" };

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: rows } = await supabase
    .from("welfare_programs")
    .select("id, serv_id")
    .not("serv_id", "is", null)
    .or(`last_enriched_at.is.null,last_enriched_at.lt.${sevenDaysAgo}`)
    .limit(50);

  if (!rows || rows.length === 0) return { enriched: 0, failed: 0, total_candidates: 0 };

  let enriched = 0;
  let failed = 0;
  // 5개씩 병렬 처리
  for (let i = 0; i < rows.length; i += 5) {
    const batch = rows.slice(i, i + 5);
    const results = await Promise.all(
      batch.map((r) => enrichOne(supabase, r as { id: string; serv_id: string })),
    );
    enriched += results.filter(Boolean).length;
    failed += results.filter((ok) => !ok).length;
  }

  return { enriched, failed, total_candidates: rows.length };
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runEnrichAndRespond("enrich (POST)");
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runEnrichAndRespond("enrich (cron)");
}
