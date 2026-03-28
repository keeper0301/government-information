import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const DATA_GO_KR_KEY = process.env.DATA_GO_KR_API_KEY || "";

// API Endpoints
const BOKJIRO_CENTRAL_API =
  "https://apis.data.go.kr/B554287/NationalWelfareInformationsV001/NationalWelfarelistV001";
const LOCAL_WELFARE_API =
  "https://apis.data.go.kr/B554287/LocalGovernmentWelfareInformations/LcgvWelfarelist";
const SMALLBIZ_API =
  "https://apis.data.go.kr/1421000/mssBizService_v2/getbizList_v2";
const YOUTH_API =
  "https://www.youthcenter.go.kr/proxy/search/portalPolicySearch";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

function mapWelfareCategory(text: string): string {
  if (!text) return "소득";
  if (text.includes("주거") || text.includes("임대") || text.includes("월세") || text.includes("주택")) return "주거";
  if (text.includes("취업") || text.includes("고용") || text.includes("일자리")) return "취업";
  if (text.includes("양육") || text.includes("보육") || text.includes("출산") || text.includes("임신")) return "양육";
  if (text.includes("의료") || text.includes("건강") || text.includes("장애") || text.includes("재활")) return "의료";
  if (text.includes("교육") || text.includes("학자금") || text.includes("장학")) return "교육";
  if (text.includes("문화") || text.includes("여가")) return "문화";
  return "소득";
}

function mapLoanCategory(text: string): string {
  if (text.includes("보증")) return "보증";
  if (text.includes("지원금") || text.includes("보조")) return "지원금";
  return "대출";
}

function parseXmlTag(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? match[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim() : null;
}

// ━━━ 1. 복지로 중앙 (카테고리별 전체 수집) ━━━
async function collectBokjiroCentral(supabase: SupabaseAdmin) {
  if (!DATA_GO_KR_KEY) return { collected: 0, error: "API key not set" };

  const codes = ["001", "002", "003", "004", "005", "006", "007", "008", "009", "010"];
  let total = 0;
  const seen = new Set<string>();

  for (const code of codes) {
    for (let page = 1; page <= 4; page++) {
      try {
        const params = new URLSearchParams({
          serviceKey: DATA_GO_KR_KEY,
          callTp: "L",
          pageNo: String(page),
          numOfRows: "100",
          srchKeyCode: code,
        });
        const res = await fetch(`${BOKJIRO_CENTRAL_API}?${params}`, { cache: "no-store" });
        if (!res.ok) break;

        const xml = await res.text();
        const totalMatch = xml.match(/<totalCount>(\d+)<\/totalCount>/);
        const apiTotal = totalMatch ? parseInt(totalMatch[1]) : 0;

        const regex = /<servList>([\s\S]*?)<\/servList>/g;
        let m;
        while ((m = regex.exec(xml)) !== null) {
          const b = m[1];
          const title = parseXmlTag(b, "servNm");
          if (!title || seen.has(title)) continue;
          seen.add(title);

          const { error } = await supabase.from("welfare_programs").upsert(
            {
              title,
              category: mapWelfareCategory(parseXmlTag(b, "intrsThemaArray") || parseXmlTag(b, "servDgst") || ""),
              target: parseXmlTag(b, "trgterIndvdlArray"),
              description: parseXmlTag(b, "servDgst"),
              benefits: parseXmlTag(b, "srvPvsnNm"),
              apply_url: parseXmlTag(b, "servDtlLink"),
              source: parseXmlTag(b, "jurMnofNm") || "복지로",
              source_url: parseXmlTag(b, "servDtlLink"),
              region: "전국",
              updated_at: new Date().toISOString(),
            },
            { onConflict: "title" }
          );
          if (!error) total++;
        }

        if (page * 100 >= apiTotal) break;
      } catch {
        break;
      }
    }
  }
  return { collected: total };
}

// ━━━ 2. 지자체 복지 (전체 페이지 수집) ━━━
async function collectLocalWelfare(supabase: SupabaseAdmin) {
  if (!DATA_GO_KR_KEY) return { collected: 0, error: "API key not set" };

  let total = 0;
  const PER_PAGE = 500;
  let totalPages = 10;
  const seen = new Set<string>();

  for (let page = 1; page <= totalPages; page++) {
    try {
      const params = new URLSearchParams({
        serviceKey: DATA_GO_KR_KEY,
        pageNo: String(page),
        numOfRows: String(PER_PAGE),
      });
      const res = await fetch(`${LOCAL_WELFARE_API}?${params}`, { cache: "no-store" });
      if (!res.ok) break;

      const xml = await res.text();

      if (page === 1) {
        const totalMatch = xml.match(/<totalCount>(\d+)<\/totalCount>/);
        if (totalMatch) {
          totalPages = Math.ceil(parseInt(totalMatch[1]) / PER_PAGE);
        }
      }

      const regex = /<servList>([\s\S]*?)<\/servList>/g;
      let m;
      while ((m = regex.exec(xml)) !== null) {
        const b = m[1];
        const title = parseXmlTag(b, "servNm");
        const sgg = parseXmlTag(b, "sggNm") || "";
        const ctpv = parseXmlTag(b, "ctpvNm") || "";
        const fullTitle = sgg ? `${title} (${ctpv} ${sgg})` : title;

        if (!title || !fullTitle || seen.has(fullTitle)) continue;
        seen.add(fullTitle);

        const { error } = await supabase.from("welfare_programs").upsert(
          {
            title: fullTitle.substring(0, 200),
            category: mapWelfareCategory(parseXmlTag(b, "intrsThemaNmArray") || parseXmlTag(b, "servDgst") || ""),
            target: parseXmlTag(b, "trgterIndvdlNmArray"),
            description: parseXmlTag(b, "servDgst"),
            benefits: parseXmlTag(b, "srvPvsnNm"),
            apply_method: parseXmlTag(b, "aplyMtdNm"),
            apply_url: parseXmlTag(b, "servDtlLink"),
            source: ctpv || "지자체",
            source_url: parseXmlTag(b, "servDtlLink"),
            region: ctpv || "전국",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "title" }
        );
        if (!error) total++;
      }
    } catch {
      break;
    }
  }
  return { collected: total };
}

// ━━━ 3. 온통청년 (최신 정책 수집) ━━━
async function collectYouth(supabase: SupabaseAdmin) {
  // 온통청년 API는 외부 호출 시 페이지네이션이 제한적 (최신 10건만 반환)
  // 하지만 최신 정책을 주기적으로 가져오면 누적 수집 가능
  let total = 0;

  try {
    const res = await fetch(YOUTH_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageIndex: 1, pageSize: 10 }),
      cache: "no-store",
    });
    if (!res.ok) return { collected: 0, error: `HTTP ${res.status}` };

    const data = await res.json();
    const items = data?.searchResult?.youthpolicy || [];

    for (const item of items) {
      const title = item.PLCY_NM;
      if (!title) continue;

      const fmtDate = (d: string) => {
        if (!d || d.length < 8) return null;
        return `${d.substring(0, 4)}-${d.substring(4, 6)}-${d.substring(6, 8)}`;
      };

      const region = (item.STDG_NM || "").split(",")[0] || "전국";

      const { error } = await supabase.from("welfare_programs").upsert(
        {
          title: title.substring(0, 200),
          category: mapWelfareCategory(item.USER_CLSF_NM || item.PLCY_EXPLN_CN || title),
          target: "청년",
          description: (item.PLCY_EXPLN_CN || "").substring(0, 1000) || null,
          benefits: (item.PLCY_SPRT_CN || "").substring(0, 500) || null,
          apply_method: (item.PLCY_APLY_MTHD_CN || "").substring(0, 200) || null,
          apply_url: item.APLY_URL_ADDR ||
            (item.DOCID ? `https://www.youthcenter.go.kr/youthPolicy/ythPlcyTotalSearch/ythPlcyDetail/${item.DOCID}` : null),
          apply_start: fmtDate(item.BIZ_PRD_BGNG_YMD || ""),
          apply_end: fmtDate(item.BIZ_PRD_END_YMD || ""),
          source: item.SPRVSN_INST_CD_NM || "온통청년",
          source_url: item.DOCID
            ? `https://www.youthcenter.go.kr/youthPolicy/ythPlcyTotalSearch/ythPlcyDetail/${item.DOCID}`
            : null,
          region: region === "중앙부처" ? "전국" : region,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "title" }
      );
      if (!error) total++;
    }
  } catch (e) {
    return { collected: 0, error: String(e) };
  }
  return { collected: total };
}

// ━━━ 4. 소상공인 대출 ━━━
async function collectLoans(supabase: SupabaseAdmin) {
  if (!DATA_GO_KR_KEY) return { collected: 0, error: "API key not set" };

  try {
    const params = new URLSearchParams({
      serviceKey: DATA_GO_KR_KEY,
      pageNo: "1",
      numOfRows: "100",
    });
    const res = await fetch(`${SMALLBIZ_API}?${params}`, { cache: "no-store" });
    if (!res.ok) return { collected: 0, error: `HTTP ${res.status}` };

    const xml = await res.text();
    if (xml.includes("Unauthorized") || xml.includes("SERVICE_KEY")) {
      return { collected: 0, error: "API key unauthorized" };
    }

    const regex = /<item>([\s\S]*?)<\/item>/g;
    let m;
    let count = 0;

    while ((m = regex.exec(xml)) !== null) {
      const b = m[1];
      const title = parseXmlTag(b, "pblancNm") || parseXmlTag(b, "bizPbancNm");
      if (!title) continue;

      const { error } = await supabase.from("loan_programs").upsert(
        {
          title,
          category: mapLoanCategory(title),
          target: parseXmlTag(b, "jrsdInsttNm") || "소상공인",
          description: parseXmlTag(b, "bsnsSumryCn") || parseXmlTag(b, "pblancCn"),
          eligibility: parseXmlTag(b, "trgtNm"),
          loan_amount: parseXmlTag(b, "sportCn"),
          apply_url: parseXmlTag(b, "detailPageUrl"),
          apply_start: parseXmlTag(b, "pblancBgngYmd"),
          apply_end: parseXmlTag(b, "pblancEndYmd"),
          source: "중소벤처기업부",
          source_url: parseXmlTag(b, "detailPageUrl"),
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

// ━━━ API Handler ━━━
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

  // 4개 소스 병렬 수집
  const [bokjiro, localWelfare, youth, loans] = await Promise.all([
    collectBokjiroCentral(supabase),
    collectLocalWelfare(supabase),
    collectYouth(supabase),
    collectLoans(supabase),
  ]);

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    bokjiro_central: bokjiro,
    local_welfare: localWelfare,
    youth: youth,
    loans: loans,
    total: (bokjiro.collected || 0) + (localWelfare.collected || 0) + (youth.collected || 0) + (loans.collected || 0),
  });
}

// Vercel Cron sends GET with CRON_SECRET in header
export async function GET(request: NextRequest) {
  // Vercel Cron uses CRON_SECRET automatically
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const [bokjiro, localWelfare, youth, loans] = await Promise.all([
    collectBokjiroCentral(supabase),
    collectLocalWelfare(supabase),
    collectYouth(supabase),
    collectLoans(supabase),
  ]);

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    bokjiro_central: bokjiro,
    local_welfare: localWelfare,
    youth: youth,
    loans: loans,
    total: (bokjiro.collected || 0) + (localWelfare.collected || 0) + (youth.collected || 0) + (loans.collected || 0),
  });
}
