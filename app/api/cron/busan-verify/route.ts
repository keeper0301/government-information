// app/api/cron/busan-verify/route.ts
// 자치구 보도자료 수집 검증 — 2026-06-01 수리·신규 효과 확인용.
// 매일 KST 11:30(= 02:30 UTC) 부산 4곳 + 서울 13곳의 24h/7d inserted + 최신 글 + korea.kr
// 본문 250+ 비율을 조회해 텔레그램 발송.
// 부산: 부산진=BBS_0000031, 북구=eminwon, 사상=TLS fallback, 동래(대조). 날짜 2자리.
// 서울: 외부 자율 추가 13 자치구(본문 min 250 통일 적용분).
// proxy(부산진·사상) KST 10시 + 정적(eminwon·서울 09시) + collect-news(korea.kr, 11시) 이후라
// 11:30 확인 (collect-news 보강 후 korea.kr 250+ 비율 반영).
// ⚠️ 1주 모니터링 검증 완료 후 vercel.json crons 에서 제거 권장(상시 noise 방지).

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCronRequest } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// diag: ⚠️(7d 0건) 일 때 텔레그램에 붙는 원인 진단 한 줄(자동 상세 진단).
const VERIFY_CITIES = [
  // 부산 자치구 (6/1 수리)
  { code: "local-press-busanjin", name: "부산진구", region: "부산", diag: "BBS_0000031 보도자료 게시판 selector·날짜 2자리 확인" },
  { code: "local-press-bsbukgu", name: "부산 북구", region: "부산", diag: "eminwon OfrAction.do POST 응답·searchDetail 파싱 확인" },
  { code: "local-press-sasang", name: "사상구", region: "부산", diag: "icn1 TLS fallback 동작·proxy(GitHub Actions) 가동 확인" },
  { code: "local-press-dongnae", name: "동래구", region: "부산", diag: "주말이면 발행 없음(정상). 평일 0이면 BBS_0000012 selector" },
  // 서울 자치구 (외부 자율 추가 13)
  { code: "local-press-seongdong", name: "성동구", region: "서울", diag: "첨부 PDF unpdf 수리(0c9ff9e). 0이면 downloadBbsFile.do %PDF 매직·stripSiPdfMeta 확인" },
  { code: "local-press-yeongdeungpo", name: "영등포구", region: "서울", diag: "SI selectBbsNttList list selector·본문 250 확인" },
  { code: "local-press-eunpyeong", name: "은평구", region: "서울", diag: "SI selectBbsNttList list selector·본문 250 확인" },
  { code: "local-press-seodaemun", name: "서대문구", region: "서울", diag: "EUC-KR 인코딩·goView GET·본문 250 확인" },
  { code: "local-press-jongno", name: "종로구", region: "서울", diag: "eGovFrame selectBoardList bbsId=1618·본문 250 확인" },
  { code: "local-press-gangseo", name: "강서구", region: "서울", diag: "eDotXpress /gs040201 view-content·본문 250 확인" },
  { code: "local-press-geumcheon", name: "금천구", region: "서울", diag: "SI bbsNo=8 list selector·본문 250 확인" },
  { code: "local-press-guro", name: "구로구", region: "서울", diag: "SI /www/index.do list selector·본문 250 확인" },
  { code: "local-press-dongdaemun", name: "동대문구", region: "서울", diag: "SI 첨부형이나 첨부 다운로드 에러페이지 → 메커니즘 미해결(다음 세션). thin noindex 정상" },
  { code: "local-press-seocho", name: "서초구", region: "서울", diag: "빈 shell 메인 우회 정적 게시판·본문 250 확인" },
  { code: "local-press-junggu-seoul", name: "중구", region: "서울", diag: "content.do cmsid=14390 list 파라미터 순서 확인" },
  { code: "local-press-seongbuk", name: "성북구", region: "서울", diag: "SI 첨부형이나 첨부 다운로드 에러페이지 → 메커니즘 미해결(다음 세션). thin noindex 정상" },
  { code: "local-press-gangdong", name: "강동구", region: "서울", diag: "newportal meta refresh 우회·본문 250 확인" },
  { code: "local-press-gangwon", name: "강원도", region: "강원", diag: "hwp5 첨부 @ohah(napi) 파싱(283d83b). 0이면 @ohah Vercel 런타임·hwp download·OLE 매직 확인" },
] as const;

async function sendTelegram(
  text: string,
): Promise<{ ok: boolean; status?: number; reason?: string }> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return { ok: false, reason: "no_credentials" };
  const res = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    },
  );
  // status 포함 — 발송 실패(봇 차단·chat_id 오류·5xx) 시 수동 trigger 디버깅용.
  return { ok: res.ok, status: res.status };
}

async function run() {
  const admin = createAdminClient();
  const since24 = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  const results: {
    name: string;
    region: string;
    diag: string;
    cnt24: number;
    cnt7: number;
    latestPublished: string | null;
  }[] = [];

  for (const c of VERIFY_CITIES) {
    const { count: cnt24 } = await admin
      .from("news_posts")
      .select("*", { count: "exact", head: true })
      .eq("source_code", c.code)
      .gte("created_at", since24);
    const { count: cnt7 } = await admin
      .from("news_posts")
      .select("*", { count: "exact", head: true })
      .eq("source_code", c.code)
      .gte("created_at", since7d);
    const { data: latest } = await admin
      .from("news_posts")
      .select("published_at")
      .eq("source_code", c.code)
      .order("created_at", { ascending: false })
      .limit(1);
    results.push({
      name: c.name,
      region: c.region,
      diag: c.diag,
      cnt24: cnt24 ?? 0,
      cnt7: cnt7 ?? 0,
      latestPublished: latest?.[0]?.published_at ?? null,
    });
  }

  // ✅ 24h 수집 · 🟡 24h 0 이나 7d 있음 · ⚠️ 7d 0(수집 실패/장기 무발행 의심)
  const fmt = (r: (typeof results)[number]) => {
    const icon = r.cnt24 > 0 ? "✅" : r.cnt7 > 0 ? "🟡" : "⚠️";
    const pub = r.latestPublished ? r.latestPublished.slice(0, 10) : "-";
    const base = `${icon} ${r.name}: 24h ${r.cnt24} / 7d ${r.cnt7} (최신 ${pub})`;
    // ⚠️(7d 0건)인 도시만 자동 상세 진단 한 줄 첨부.
    return r.cnt7 === 0 ? `${base}\n    └ 진단: ${r.diag}` : base;
  };

  // region 별 섹션 (부산 먼저, 서울 다음). 등록 순서 유지.
  const regions = [...new Set(results.map((r) => r.region))];
  const sections = regions
    .map((rg) => {
      const lines = results.filter((r) => r.region === rg).map(fmt).join("\n");
      return `[${rg}]\n${lines}`;
    })
    .join("\n\n");

  // 2026-06-02 — korea.kr 상세 본문 보강(commit c3c1ba1) 효과 확인.
  // 최근 24h korea.kr 수집 글의 본문 250+ 비율 (RSS 요약 → 전문 보강 성공률).
  // collect-news(KST 11시) 보강 후 조회하도록 이 cron 은 11:30 에 둠.
  const { data: krRows } = await admin
    .from("news_posts")
    .select("body")
    .like("source_code", "korea-kr%")
    .gte("created_at", since24);
  const krTotal = krRows?.length ?? 0;
  const krRich = krRows?.filter((r) => (r.body?.length ?? 0) >= 250).length ?? 0;
  const krLine =
    krTotal > 0
      ? `\n\n📰 korea.kr 본문 보강: 24h ${krTotal}건 중 250+ ${krRich}건 (${Math.round((100 * krRich) / krTotal)}%)`
      : "\n\n📰 korea.kr: 24h 수집 0";

  const text =
    "🏙 자치구 보도자료 수집 확인 (6/1 수리·신규 검증)\n\n" +
    sections +
    "\n\n⚠️=7d 0건(수집 실패·주말 의심) · 🟡=24h만 0" +
    krLine;

  const telegram = await sendTelegram(text);
  return NextResponse.json({ ok: true, results, telegram });
}

export async function GET(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  return run();
}

// POST 도 같은 동작 (수동 trigger 편의)
export async function POST(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  return run();
}
