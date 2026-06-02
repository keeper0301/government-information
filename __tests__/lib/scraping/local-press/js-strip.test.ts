// ============================================================
// anyang·songpa·yeonsu·wonju 본문 <script> 제거 회귀 테스트 (2026-06-03)
// ============================================================
// 4곳 본문 컨테이너 안 <script>(fn_update 등) 블록이 제거되지 않아 JS 코드가
// 본문에 섞이던 버그 fix. 각 collector 의 컨테이너 class·종결 마커가 달라 개별 fixture.

import { describe, it, expect } from "vitest";
import { parseDetailBody as anyang } from "@/lib/scraping/local-press/anyang";
import { parseDetailBody as songpa } from "@/lib/scraping/local-press/songpa";
import { parseDetailBody as yeonsu } from "@/lib/scraping/local-press/yeonsu";
import { parseDetailBody as wonju } from "@/lib/scraping/local-press/wonju";

const BODY =
  "관내 소상공인과 시민이 함께 참여하는 행사를 개최한다고 밝혔다. 이번 행사는 지역 경제 " +
  "활성화와 시민 편의 증진을 위해 마련됐으며 다양한 체험 프로그램과 전시 부스가 운영된다. " +
  "시는 이번 행사를 통해 우수한 제품을 널리 알리고 지역 상권에 활력을 불어넣겠다는 계획이다. " +
  "행사 기간 동안 현장 상담 창구도 함께 운영되어 누구나 손쉽게 정보를 얻을 수 있다. 자세한 " +
  "사항은 시청 누리집에서 확인할 수 있으며 시 관계자는 많은 시민의 관심과 참여를 당부했다. " +
  "시는 또한 온라인 신청 시스템을 도입해 시민들이 시간과 장소에 구애받지 않고 편리하게 " +
  "참여할 수 있도록 했으며 향후 더 많은 시민이 혜택을 누릴 수 있도록 사업을 단계적으로 " +
  "확대해 나갈 방침이라고 덧붙였다. 관계자는 실질적인 도움이 되는 정책을 지속 발굴하겠다고 말했다.";

const SCRIPT = `<script>function fn_update(url){ if(confirm("수정하시겠습니까?")){ location.href=url; } }</script>`;

const cases: Array<[string, (h: string) => string | null, string]> = [
  ["anyang", anyang, `<div class="view_cont"><p>${BODY}</p>${SCRIPT}</div><div class="btn"></div>`],
  ["songpa", songpa, `<div class="p-table__content"><p>${BODY}</p>${SCRIPT}</div><div class="p-table__bottom"></div>`],
  ["yeonsu", yeonsu, `<div class="board_view"><p>${BODY}</p>${SCRIPT}</div><div class="file"></div>`],
  ["wonju", wonju, `<div class="bbs_wrap"><p>${BODY}</p>${SCRIPT}</div></div>`],
];

describe("본문 <script> 제거 (JS 코드 혼입 방어)", () => {
  for (const [name, fn, html] of cases) {
    it(`${name}: 본문 추출 + script(fn_update) 미혼입`, () => {
      const body = fn(html);
      expect(body).toContain("소상공인");
      expect(body).toContain("당부했다");
      expect(body).not.toContain("function");
      expect(body).not.toContain("fn_update");
      expect(body).not.toContain("confirm");
    });
  }
});
