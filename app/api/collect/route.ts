import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const DATA_GO_KR_KEY = process.env.DATA_GO_KR_API_KEY || "";

// Welfare API - 복지로 중앙복지정보
const WELFARE_API =
  "https://apis.data.go.kr/B554287/NationalWelfareInformationsV001/NationalWelfarelistV001";

// Loan API - 소상공인 지원사업
const SMALLBIZ_API =
  "https://apis.data.go.kr/1421000/mssBizService_v2/getbizList_v2";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

async function collectWelfare(supabase: SupabaseAdmin) {
  if (!DATA_GO_KR_KEY) return { collected: 0, error: "API key not set" };

  try {
    const url = new URL(WELFARE_API);
    url.searchParams.set("serviceKey", DATA_GO_KR_KEY);
    url.searchParams.set("pageNo", "1");
    url.searchParams.set("numOfRows", "50");
    url.searchParams.set("type", "json");

    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) return { collected: 0, error: `HTTP ${res.status}` };

    const json = await res.json();
    const items = json?.response?.body?.items?.item || [];

    let count = 0;
    for (const item of items) {
      const title = item.servNm || item.wlfareInfoNm || "";
      if (!title) continue;

      const { error } = await supabase.from("welfare_programs").upsert(
        {
          title,
          category: mapWelfareCategory(item.ctpvNm || item.servDgst || ""),
          target: item.trgterIndvdlNm || null,
          description: item.servDgst || item.wlfareInfoOutlCn || null,
          eligibility: item.slctCritCn || null,
          benefits: item.alwServCn || null,
          apply_method: item.aplyMtdCn || null,
          apply_url: item.servDtlLink || null,
          source: "복지로",
          source_url: item.servDtlLink || null,
          region: item.ctpvNm || "전국",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "title" }
      );
      if (!error) count++;
    }
    return { collected: count };
  } catch (e) {
    return { collected: 0, error: String(e) };
  }
}

async function collectLoans(supabase: SupabaseAdmin) {
  if (!DATA_GO_KR_KEY) return { collected: 0, error: "API key not set" };

  try {
    const url = new URL(SMALLBIZ_API);
    url.searchParams.set("serviceKey", DATA_GO_KR_KEY);
    url.searchParams.set("pageNo", "1");
    url.searchParams.set("numOfRows", "50");
    url.searchParams.set("type", "json");

    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) return { collected: 0, error: `HTTP ${res.status}` };

    const json = await res.json();
    const items = json?.response?.body?.items?.item || [];

    let count = 0;
    for (const item of items) {
      const title = item.pblancNm || item.bizPbancNm || "";
      if (!title) continue;

      const { error } = await supabase.from("loan_programs").upsert(
        {
          title,
          category: mapLoanCategory(item.pblancNm || ""),
          target: item.jrsdInsttNm || "소상공인",
          description: item.pblancCn || item.bsnsSumryCn || null,
          eligibility: item.trgtNm || null,
          loan_amount: item.sportCn || null,
          apply_method: item.aplyMtdCn || null,
          apply_url: item.detailPageUrl || null,
          apply_start: item.pblancBgngYmd || null,
          apply_end: item.pblancEndYmd || null,
          source: "소상공인진흥공단",
          source_url: item.detailPageUrl || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "title" }
      );
      if (!error) count++;
    }
    return { collected: count };
  } catch (e) {
    return { collected: 0, error: String(e) };
  }
}

function mapWelfareCategory(text: string): string {
  if (text.includes("주거") || text.includes("임대") || text.includes("월세"))
    return "주거";
  if (text.includes("취업") || text.includes("고용") || text.includes("일자리"))
    return "취업";
  if (text.includes("양육") || text.includes("보육") || text.includes("출산"))
    return "양육";
  if (text.includes("의료") || text.includes("건강") || text.includes("장애"))
    return "의료";
  if (text.includes("교육") || text.includes("학자금")) return "교육";
  return "소득";
}

function mapLoanCategory(text: string): string {
  if (text.includes("보증")) return "보증";
  if (text.includes("지원금") || text.includes("보조")) return "지원금";
  return "대출";
}

export async function POST(request: NextRequest) {
  // Simple auth check
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const [welfare, loans] = await Promise.all([
    collectWelfare(supabase),
    collectLoans(supabase),
  ]);

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    welfare,
    loans,
  });
}

// Also allow GET for easy testing
export async function GET(request: NextRequest) {
  return POST(request);
}
