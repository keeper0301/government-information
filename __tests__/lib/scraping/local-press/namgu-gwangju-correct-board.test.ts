import { expect, it } from "vitest";
import * as collector from "@/lib/scraping/local-press/namgu_gwangju";
it("광주 남구 공지사항 대신 공식 보도자료 행과 본문을 읽는다", async () => {
  const html = `<div class="dbody"><ul><li class="col01"><a onclick="searchDetail('6679')">1</a></li><li class="title"><a onclick="searchDetail('6679')">지역 축제 안내</a></li><li class="col04">2026-10-02</li></ul><ul><li class="title"><a onclick="searchDetail('6678')">다음 지역 안내</a></li><li class="col04">2026-10-01</li></ul></div>`;
  expect(collector.parseListPage(html)[0]).toMatchObject({ seq: "6679", title: "지역 축제 안내", publishedDate: "2026-10-02" });
  const content = "주민 참여 행사와 신청 방법을 알려 주는 보도자료 문장입니다. ".repeat(15).trim();
  expect(await collector.parseDetailBody(`<div class="tb_contents">${content}<script>실행잡음</script></div><div class="add_file">첨부잡음</div>`)).toBe(content);
});
