import { createHash } from 'node:crypto';
import { isDeepLink, sanitizeApplyUrl } from '@/lib/utils/apply-url';

export type EvidenceSection = { label: string; text: string; quote: string };
export type EvidenceSource = { url: string; title: string; body: string; checkedAt: string | null };
export type EvidenceGuide = {
  version: 1; status: 'draft' | 'approved'; source: EvidenceSource;
  sections: EvidenceSection[]; programSnapshot: string; contentSnapshot: string;
  reviewerId?: string; reviewedAt?: string;
};
export type EvidenceProgram = { title: string; source_url?: string | null;
  policy_guidance?: unknown; [key: string]: unknown };

const FIELDS = ['title', 'source_url', 'description', 'detailed_content', 'target',
  'eligibility', 'benefits', 'apply_url', 'apply_method', 'apply_start', 'apply_end',
  'required_documents', 'contact_info', 'selection_criteria', 'loan_amount',
  'interest_rate', 'repayment_period', 'region', 'district', 'source', 'region_tags'];
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function programSnapshot(row: EvidenceProgram): string {
  return digest(FIELDS.map(key => [key, row[key] ?? null]));
}
function contentSnapshot(guide: Pick<EvidenceGuide, 'source' | 'sections' | 'programSnapshot'>): string {
  return digest([guide.source, guide.sections, guide.programSnapshot]);
}
const plain = (value: string) => value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
export function isExternalSource(raw: string | null | undefined): boolean {
  const safe = sanitizeApplyUrl(raw);
  if (!safe || !isDeepLink(safe)) return false;
  const url = new URL(safe);
  return !url.username && !url.password &&
    ['.go.kr', '.gov.kr', '.or.kr', '.re.kr'].some(suffix => url.hostname.endsWith(suffix));
}
export function createGuideDraft(row: EvidenceProgram, source: EvidenceSource,
  sections: EvidenceSection[]): EvidenceGuide {
  if (!isExternalSource(source.url) || source.url !== row.source_url || !source.title.trim()
    || !source.body.trim() || sections.length === 0 || sections.length > 8) {
    throw new Error('해당 정책의 외부 원문과 설명이 필요합니다.');
  }
  // 인용문 존재는 사실 검수의 보조 장치다. 설명의 정확성은 사람이 따로 대조한다.
  const body = plain(source.body);
  for (const section of sections) {
    if (typeof section.label !== 'string' || typeof section.text !== 'string' ||
      typeof section.quote !== 'string' || !plain(section.label) || !plain(section.text)
      || plain(section.quote).length < 5 || !body.includes(plain(section.quote))) {
      throw new Error('설명을 뒷받침하는 원문 근거가 없습니다.');
    }
  }
  const guide: EvidenceGuide = { version: 1, status: 'draft', source, sections,
    programSnapshot: programSnapshot(row), contentSnapshot: '' };
  guide.contentSnapshot = contentSnapshot(guide);
  return guide;
}
function validDraft(row: EvidenceProgram, guide: EvidenceGuide): boolean {
  try {
    const draft = createGuideDraft(row, guide.source, guide.sections);
    return guide.version === 1 && guide.programSnapshot === draft.programSnapshot
      && guide.contentSnapshot === draft.contentSnapshot;
  } catch { return false; }
}
export function approveGuide(row: EvidenceProgram, guide: EvidenceGuide,
  reviewerId: string, now = new Date()): EvidenceGuide {
  const checked = Date.parse(guide?.source?.checkedAt ?? '');
  if (!validDraft(row, guide) || !reviewerId.trim() || !Number.isFinite(checked)
    || checked > now.getTime()) throw new Error('원문 확인과 최신 초안 검수가 필요합니다.');
  return { ...guide, status: 'approved', reviewerId, reviewedAt: now.toISOString() };
}
export function getPublishedGuide(row: EvidenceProgram, value: unknown = row.policy_guidance): EvidenceGuide | null {
  const guide = value as EvidenceGuide | null;
  if (!guide || guide.status !== 'approved' || !guide.reviewerId || !guide.reviewedAt) return null;
  const reviewed = Date.parse(guide.reviewedAt);
  const checked = Date.parse(guide.source?.checkedAt ?? '');
  return Number.isFinite(reviewed) && Number.isFinite(checked) && checked <= reviewed
    && reviewed <= Date.now() && validDraft(row, guide) ? guide : null;
}

// 공개 저장소에는 승인된 설명·인용문만 둔다. 원문 전체와 실제 검수자 번호는 비공개로 보관한다.
export function publicGuidance(row: EvidenceProgram, value: unknown): unknown {
  const guide = getPublishedGuide(row, value);
  if (!guide) return { version: 1, status: (value as { status?: string })?.status === 'needs_source' ? 'needs_source' : 'draft' };
  const draft = createGuideDraft(row, { ...guide.source, body: guide.sections.map(section => section.quote).join('\n') }, guide.sections);
  return approveGuide(row, draft, '운영자', new Date(guide.reviewedAt!));
}
