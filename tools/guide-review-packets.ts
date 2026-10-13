import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { EDITORIAL_GUIDES } from "@/lib/editorial-guides";
import { GUIDE_EVIDENCE, getGuideEvidence } from "@/lib/guide-evidence";
import { getGuidePublication, getGuideReviewSnapshot } from "@/lib/guide-publication";

// 검토 자료만 생성합니다. 승인 기록을 만들거나 외부에 발행하지 않습니다.
const destination = resolve("docs/adsense-recovery/review");
async function createReviewPackets() {
await mkdir(destination, { recursive: true });
const inventory = ["# 가이드 검수 목록", "", "| 제목 | 출처 대조 | 사람 승인 | 검토 자료 |", "|---|---|---|---|"];
for (const guide of EDITORIAL_GUIDES) {
  const evidence = getGuideEvidence(guide);
  const bodySha = createHash("sha256").update(JSON.stringify({ slug: guide.slug, title: guide.title, posts: guide.posts })).digest("hex");
  if (GUIDE_EVIDENCE[guide.slug]) console.log(`${guide.slug}: ${bodySha}`);
  const publication = getGuidePublication(guide);
  inventory.push(`| ${guide.title} | ${evidence ? "기록 있음" : "미확인"} | ${publication.published ? "승인 있음" : "미승인"} | ${evidence ? `[본문](review/${guide.slug}.md)` : "재작성 대기"} |`);
  if (!evidence) continue;
  const snapshot = getGuideReviewSnapshot(guide, evidence);
  const status = publication.published ? `상태: 내용 승인 완료 · 검수자 ${publication.reviewer} · 승인일 ${publication.reviewedAt} · 운영 배포 별도` : "상태: 출처 대조 기록 있음 · 운영자 검수 대기 · 공개 승인 없음";
  const lines = [`# ${guide.title} — 편집 검토 자료`, "", status, "",
    `질문: ${evidence.question}`, "", `직답: ${evidence.answer}`, "", "## 출처와 확인 범위", ""];
  for (const source of evidence.sources) lines.push(`- [${source.agency} — ${source.title}](${source.url})`, `  - 확인일: ${source.checkedAt}. 범위: ${source.scope}`);
  lines.push("", "## 조건 대조표", "", "| 항목 | 확인한 내용 | 키피오의 준비 질문 |", "|---|---|---|");
  for (const row of evidence.conditions) lines.push(`| ${row.item} | ${row.fact} | ${row.interpretation} |`);
  for (const [index, post] of guide.posts.entries()) lines.push("", `## ${evidence.headings[index]}`, "", post);
  lines.push("", "## 승인 전 확인", "", "- [ ] 공식 출처의 설명 범위와 글의 내용이 일치합니다.", "- [ ] 키피오의 준비 방법이 공고 복사에 없는 실용적 도움을 줍니다.", "- [ ] 날짜·조건을 추측하거나 신청 가능성을 보장하지 않습니다.", "- [ ] 이 내용 버전을 검수했고 공개 여부를 결정합니다.", "", `검수 대상 버전: ${snapshot}`, "",
    publication.published ? "운영자의 내용 승인을 별도 기록했습니다. 이 자료 생성은 운영 사이트 배포가 아닙니다." : "운영자가 글별로 승인하면 승인자·승인일·이 버전 값을 별도 기록합니다. 이 자료 생성은 승인이나 발행이 아닙니다.");
  await writeFile(resolve(destination, `${guide.slug}.md`), lines.join("\n") + "\n", "utf8");
}
await writeFile(resolve(destination, "../inventory.md"), inventory.join("\n") + "\n", "utf8");
console.log("검토 자료와 목록을 만들었습니다. 승인 기록과 공개 사이트는 변경하지 않았습니다.");
}
createReviewPackets().catch(error => { console.error("검토 자료 생성 실패:", error); process.exitCode = 1; });
