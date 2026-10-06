import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireAdminUser } from '@/lib/admin-auth-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { approveGuide, createGuideDraft, programSnapshot, type EvidenceGuide, type EvidenceSection } from '@/lib/policy/evidence-guide';
import { generatePolicyGuide } from '@/lib/policy/ai-guide';
import { readPrivateReview, savePrivateReview } from '@/lib/policy/guidance-storage';

export const maxDuration = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function target(type: unknown, id: unknown) {
  if (!['welfare', 'loan'].includes(String(type)) || typeof id !== 'string' || !UUID.test(id)) return null;
  return { table: type === 'welfare' ? 'welfare_programs' : 'loan_programs', id };
}
export async function GET(req: Request) {
  if (!await requireAdminUser()) return NextResponse.json({ error: '관리자 로그인이 필요합니다.' }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const selected = target(params.get('type'), params.get('id'));
  if (!selected) return NextResponse.json({ error: '정책 종류와 주소를 확인하세요.' }, { status: 400 });
  const admin = createAdminClient();
  const { data, error } = await admin.from(selected.table).select('*').eq('id', selected.id).maybeSingle();
  if (error) return NextResponse.json({ error: '정책 조회 실패' }, { status: 503 });
  if (!data) return NextResponse.json({ error: '정책을 찾을 수 없습니다.' }, { status: 404 });
  try {
    const review = await readPrivateReview(admin, selected.table, selected.id);
    return NextResponse.json({ program: { ...data, policy_guidance: review?.guidance ?? data.policy_guidance }, snapshot: programSnapshot(data) });
  } catch { return NextResponse.json({ error: '비공개 검수 저장소 준비 상태를 확인하세요.' }, { status: 503 }); }
}
export async function POST(req: Request) {
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ error: '관리자 로그인이 필요합니다.' }, { status: 401 });
  const body = await req.json().catch(() => null);
  const selected = target(body?.type, body?.id);
  if (!selected) return NextResponse.json({ error: '정책 종류와 주소를 확인하세요.' }, { status: 400 });
  const admin = createAdminClient();
  const { data: row, error } = await admin.from(selected.table).select('*').eq('id', selected.id).maybeSingle();
  if (error) return NextResponse.json({ error: '저장소 준비와 정책 조회 상태를 확인하세요.' }, { status: 503 });
  if (!row) return NextResponse.json({ error: '정책을 찾을 수 없습니다.' }, { status: 404 });
  if (body.snapshot !== programSnapshot(row)) return NextResponse.json({ error: '정책이 바뀌었습니다. 다시 불러오세요.' }, { status: 409 });
  try {
    const review = await readPrivateReview(admin, selected.table, selected.id);
    const old = (review?.guidance ?? row.policy_guidance) as EvidenceGuide;
    let guidance: EvidenceGuide;
    if (body.action === 'approve') {
      if (body.sourceChecked !== true || body.contentSnapshot !== old?.contentSnapshot) {
        return NextResponse.json({ error: '원문 대조와 최신 초안 확인이 필요합니다.' }, { status: 409 });
      }
      const originalDraft = createGuideDraft(row, old.source, old.sections);
      if (old.contentSnapshot !== originalDraft.contentSnapshot) throw new Error('저장된 초안이 변경되었습니다.');
      // 공개 전 원문과 사업·지역·연도·조건을 사람이 대조했음을 명시적으로 확인한다.
      const draft = createGuideDraft(row, { ...old.source, checkedAt: new Date().toISOString() }, old.sections);
      if (old.programSnapshot !== programSnapshot(row)) throw new Error('초안을 다시 작성해야 합니다.');
      guidance = approveGuide(row, draft, user.id);
    } else if (body.action === 'draft' || body.action === 'generate') {
      if (old?.status === 'approved') return NextResponse.json({ error: '검수 완료 설명을 먼저 회수하세요.' }, { status: 409 });
      if (typeof body.sourceBody !== 'string' || body.sourceBody.length > 20000 || !body.sourceBody.trim()) {
        return NextResponse.json({ error: '확인할 원문을 20,000자 이내로 입력하세요.' }, { status: 400 });
      }
      let sections = body.sections as EvidenceSection[];
      if (body.action === 'generate') {
        const generated = await generatePolicyGuide({ title: row.title, summary: null,
          category: row.category, target: row.target, sourceUrl: row.source_url, sourceBody: body.sourceBody });
        if (!generated.llmOk) return NextResponse.json({ error: '설명 초안 생성 실패' }, { status: 502 });
        sections = generated.sections ?? [];
      }
      guidance = createGuideDraft(row, { url: row.source_url, title: row.title,
        body: body.sourceBody, checkedAt: null }, sections);
    } else if (body.action === 'revoke') {
      if (!old) return NextResponse.json({ error: '회수할 설명이 없습니다.' }, { status: 400 });
      guidance = { ...old, status: 'draft', reviewerId: undefined, reviewedAt: undefined };
    } else return NextResponse.json({ error: '지원하지 않는 작업입니다.' }, { status: 400 });
    // 읽은 이후 수집 자료나 다른 검수 결과가 바뀌었다면 저장을 중단한다.
    const saved = await savePrivateReview(admin, selected.table, row, review, guidance);
    if (!saved) return NextResponse.json({ error: '자료가 변경되었습니다. 다시 불러오세요.' }, { status: 409 });
    revalidatePath(`/${body.type}/${row.id}`);
    return NextResponse.json({ ok: true, guidance });
  } catch {
    return NextResponse.json({ error: '원문 근거와 설명을 확인하세요. 미확인 내용을 승인할 수 없습니다.' }, { status: 400 });
  }
}
