// ============================================================
// /api/cron/bokjiro-recovery-check — bokjiro Detail API 회복 모니터링
// ============================================================
// 5/18 사고: 2026-04-26 시작된 data.go.kr NationalWelfaredetailedV001 endpoint
// 3주째 다운. BOKJIRO_DETAIL_DISABLED=true 로 fetcher kill-switch.
//
// 이 cron: 매일 KST 03:30 (UTC 18:30) sample servId 1건 호출 → 응답 정상이면
// 사장님께 텔레그램 + SMS alert 보내서 사장님이 BOKJIRO_DETAIL_DISABLED 해제 결정.
//
// 자동 해제 X — 외부 endpoint 가 일시 회복 후 다시 다운 가능 + 사장님 검수 게이트 보존.
// ============================================================

import { NextResponse } from "next/server";
import { fetchWithTimeout } from "@/lib/collectors";
import { sendOpsAlertMultichannel } from "@/lib/notifications/ops-alert-multichannel";
import { authorizeCronRequest } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const API =
  "https://apis.data.go.kr/B554287/NationalWelfareInformationsV001/NationalWelfaredetailedV001";
// 실존 bokjiro servId — Detail API 정상 응답 시 <wantedDtl> 루트 포함.
const SAMPLE_SERV_ID = "WLF00005184";

interface CheckResult {
  recovered: boolean;
  reason?: string;
  sample_len?: number;
}

async function check(): Promise<CheckResult> {
  const key = process.env.DATA_GO_KR_API_KEY;
  if (!key) return { recovered: false, reason: "no_api_key" };

  const url = `${API}?serviceKey=${encodeURIComponent(key)}&servId=${SAMPLE_SERV_ID}`;
  try {
    const res = await fetchWithTimeout(url, { timeoutMs: 10000 });
    if (!res.ok) return { recovered: false, reason: `http_${res.status}` };
    const xml = await res.text();
    if (xml.includes("NO DATA FOUND")) {
      return { recovered: false, reason: "no_data_found" };
    }
    if (xml.length < 200 || !xml.includes("<wantedDtl>")) {
      return { recovered: false, reason: "empty_or_invalid_response" };
    }
    return { recovered: true, sample_len: xml.length };
  } catch (e) {
    return {
      recovered: false,
      reason: `network: ${(e as Error).message.slice(0, 100)}`,
    };
  }
}

async function run() {
  const isDisabled = process.env.BOKJIRO_DETAIL_DISABLED === "true";
  const result = await check();

  // 회복 + 현재 disable 중 = 사장님께 alert
  let notified = false;
  if (result.recovered && isDisabled) {
    await sendOpsAlertMultichannel({
      subject: "[BOKJIRO 회복] data.go.kr Detail API 정상 응답 확인",
      message:
        `5/18 사고 시작 후 첫 정상 응답 (응답 ${result.sample_len}자). ` +
        `Vercel BOKJIRO_DETAIL_DISABLED=false 변경 또는 env var 제거 후 enrich cron 재개 권장. ` +
        `/admin/enrich-detail 의 [영구 skip 해제] 일괄 reset 도 같이 진행하면 165건 backfill 가능.`,
    });
    notified = true;
  }

  return NextResponse.json({
    ...result,
    isDisabled,
    notified,
    checked_at: new Date().toISOString(),
  });
}

export async function GET(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  return run();
}

export async function POST(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  return run();
}
