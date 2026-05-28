// ============================================================
// SI 전자정부 표준 게시판(selectBbsNttView) 본문 파서 (2026-05-29)
// ============================================================
// 군포·김포·양주·구리·충주 등 `selectBbsNttList.do?bbsNo=N&key=M` CMS 공용.
// 본문 셀은 스킨별 2종: <td class="p-table__content"> / <td class="bbs_content">
//   (class 앞에 colspan 등 속성이 먼저 오므로 <td[^>]*\sclass= 로 매칭)
//
// 끝 경계는 정규식 마커 대신 **<td> 깊이 추적**으로 본문 셀의 진짜 닫는 </td> 를 찾는다.
// 보도자료 본문에는 표(중첩 table)가 흔해, </td></tr> 류 정규식 마커를 쓰면 중첩 표의
// 닫힘에서 본문이 잘리는 사고가 난다 (code review). 깊이 추적은 중첩 표를 정확히 통과.
// 첨부 목록은 본문 셀 밖의 별도 <tr> 행이라 셀 경계로 자연 제외된다.
// 본문 안 <script>(갤러리 슬라이더 등)·이미지 갤러리 "사진 확대보기" 라벨은 cleaning 에서 제거.
// ============================================================

import { decodeBasicEntities } from "./_factory";

const CELL_OPEN_REGEX =
  /<td[^>]*\sclass="(?:p-table__content|bbs_content)[^"]*"[^>]*>/i;

// 본문 셀 open ~ 매칭되는 </td> 까지 (중첩 <td> 깊이 추적). 없으면 null.
function extractCellContent(html: string): string | null {
  const open = CELL_OPEN_REGEX.exec(html);
  if (!open) return null;
  const start = open.index + open[0].length;
  const tagRe = /<(\/?)td\b[^>]*>/gi;
  tagRe.lastIndex = start;
  let depth = 1;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    if (m[1] === "/") {
      depth -= 1;
      if (depth === 0) return html.slice(start, m.index);
    } else {
      depth += 1;
    }
  }
  return null; // 닫는 </td> 없음 (응답 잘림 등) → junk 방지 위해 null
}

export function parseSiNttBody(html: string): string | null {
  const raw = extractCellContent(html);
  if (raw === null) return null;
  const text = decodeBasicEntities(
    raw
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ") // 본문 내 인라인 스크립트 제거
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/<[^>]*$/, ""),
  )
    .replace(/사진\s*확대보기/g, " ") // 이미지 갤러리 UI 라벨 제거
    .replace(/\s+/g, " ")
    .trim();
  if (!/[가-힣]/.test(text) || text.length < 50) return null;
  return text.slice(0, 5000);
}
