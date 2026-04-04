import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

  if (!rows || rows.length === 0) return { enriched: 0 };

  let enriched = 0;
  // 5개씩 병렬 처리
  for (let i = 0; i < rows.length; i += 5) {
    const batch = rows.slice(i, i + 5);
    const results = await Promise.all(
      batch.map((r) => enrichOne(supabase, r as { id: string; serv_id: string })),
    );
    enriched += results.filter(Boolean).length;
  }

  return { enriched, total_candidates: rows.length };
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

  const supabase = createAdminClient();
  const result = await enrichBatch(supabase);

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    ...result,
  });
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

  const supabase = createAdminClient();
  const result = await enrichBatch(supabase);

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    ...result,
  });
}
