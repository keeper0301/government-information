// ============================================================
// /api/business-profile — Basic 유료 기능: 내 가게 정보 저장
// ============================================================
// business_profiles 는 자영업자 자격 자동 진단의 핵심 입력값이다.
// 가격표/사업계획상 Basic 이상 유료 기능이므로 클라이언트 RLS 직접 upsert가 아니라
// 서버에서 로그인 + 구독 티어를 확인한 뒤 service role 로 저장한다.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireTier } from '@/lib/subscription';
import {
  isJsonBodyTooLargeError,
  readJsonWithLimit,
} from '@/lib/http/json';

const MAX_BUSINESS_PROFILE_BODY_BYTES = 8 * 1024;

const BUSINESS_INDUSTRIES = new Set(['food', 'retail', 'manufacturing', 'service', 'it', 'other']);
const REVENUE_SCALES = new Set(['under_50m', '50m_500m', '500m_1b', '1b_10b', 'over_10b']);
const EMPLOYEE_COUNTS = new Set(['none', '1_4', '5_9', '10_49', '50_99', 'over_100']);
const BUSINESS_TYPES = new Set(['sole_proprietor', 'corporation']);

function enumOrNull(value: unknown, allowed: Set<string>): string | null {
  return typeof value === 'string' && allowed.has(value) ? value : null;
}

function textOrNull(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function dateOrNull(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

async function requireBusinessProfileAccess() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: '로그인이 필요합니다.', status: 401 as const };
  }

  const tier = await requireTier(user.id, 'basic');
  if (!tier) {
    return {
      error: '내 가게 자격 자동 진단은 베이직 이상 플랜에서 이용 가능해요.',
      status: 403 as const,
      needsUpgrade: true,
    };
  }

  return { user, tier };
}

export async function PUT(request: NextRequest) {
  const auth = await requireBusinessProfileAccess();
  if ('error' in auth) return NextResponse.json(auth, { status: auth.status });

  let body: Record<string, unknown>;
  try {
    body = await readJsonWithLimit(request, MAX_BUSINESS_PROFILE_BODY_BYTES);
  } catch (err) {
    return NextResponse.json(
      { error: isJsonBodyTooLargeError(err) ? '요청 본문이 너무 큽니다.' : '잘못된 요청입니다.' },
      { status: isJsonBodyTooLargeError(err) ? 413 : 400 },
    );
  }

  // 클라이언트가 user_id 를 보내더라도 신뢰하지 않는다. 저장 주체는 세션 user.id 고정.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('business_profiles')
    .upsert({
      user_id: auth.user.id,
      industry: enumOrNull(body.industry, BUSINESS_INDUSTRIES),
      revenue_scale: enumOrNull(body.revenue_scale, REVENUE_SCALES),
      employee_count: enumOrNull(body.employee_count, EMPLOYEE_COUNTS),
      business_type: enumOrNull(body.business_type, BUSINESS_TYPES),
      established_date: dateOrNull(body.established_date),
      region: textOrNull(body.region, 30),
      district: textOrNull(body.district, 30),
    }, { onConflict: 'user_id', ignoreDuplicates: false })
    .select('user_id, industry, revenue_scale, employee_count, business_type, established_date, region, district')
    .single();

  if (error) return NextResponse.json({ error: '내 가게 정보 저장에 실패했습니다.' }, { status: 500 });
  return NextResponse.json({ profile: data, tier: auth.tier });
}
