// 실제 공식 사이트에서 확인한 게시글로 지역별 파싱 회귀를 검사합니다.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as jinju from "@/lib/scraping/local-press/jinju";
import * as tongyeong from "@/lib/scraping/local-press/tongyeong";
import * as sacheon from "@/lib/scraping/local-press/sacheon";
import * as miryang from "@/lib/scraping/local-press/miryang";
import * as geoje from "@/lib/scraping/local-press/geoje";
import * as yangsan from "@/lib/scraping/local-press/yangsan";
import * as uiryeong from "@/lib/scraping/local-press/uiryeong";
import * as haman from "@/lib/scraping/local-press/haman";
import * as changnyeong from "@/lib/scraping/local-press/changnyeong";
import * as goseong_gn from "@/lib/scraping/local-press/goseong_gn";
import * as namhae from "@/lib/scraping/local-press/namhae";
import * as hadong from "@/lib/scraping/local-press/hadong";
import * as sancheong from "@/lib/scraping/local-press/sancheong";
import * as hamyang from "@/lib/scraping/local-press/hamyang";
import * as geochang from "@/lib/scraping/local-press/geochang";
import * as hapcheon from "@/lib/scraping/local-press/hapcheon";
const collectors = {jinju,tongyeong,sacheon,miryang,geoje,yangsan,uiryeong,haman,changnyeong,goseong_gn,namhae,hadong,sancheong,hamyang,geochang,hapcheon};
const fixtureDir = join(process.cwd(), "__tests__/fixtures/local-press/gyeongnam");
const read = (name: string) => readFileSync(join(fixtureDir, name), "utf8");

for (const [key, collector] of Object.entries(collectors)) {
 describe(key + " 공식 보도자료", () => {
  it("실제 목록에서 제목·날짜·상세 주소를 읽고 공지를 제외한다", () => {
   const items = collector.parseListPage(read(key + "-list.html"));
   expect(items.length).toBeGreaterThanOrEqual(5);
   expect(new Set(items.map(item => item.seq)).size).toBe(items.length);
   for(const item of items){
    expect(item.title.length).toBeGreaterThanOrEqual(5);
    expect(item.title).not.toContain("새 글");
    expect(item.publishedDate).toMatch(/^2026-\d{2}-\d{2}$/);
    expect(item.sourceUrl).not.toContain("jsessionid");
    expect(new URL(item.sourceUrl).hostname).toBe(new URL(collector.LIST_URL).hostname);
   }
  });
  it("실제 상세 본문을 최소 250자로 읽으며 메뉴·슬라이더를 제외한다", () => {
   const items = collector.parseListPage(read(key + "-list.html"));
   const files = readdirSync(fixtureDir).filter(name => name.startsWith(key + "-") && name.endsWith("-detail.html"));
   let verified = 0;
   for(const file of files){
    const seq = file.slice(key.length + 1).replace("-detail.html", "");
    if(!items.some(item=>item.seq===seq)) continue;
    const body = collector.parseDetailBody(read(file));
    expect(body?.length, file).toBeGreaterThanOrEqual(250);
    expect(body!.length).toBeLessThanOrEqual(20000);
    expect(body).not.toContain("setPic1gallery1");
    expect(body).not.toContain("주 메뉴 바로가기");
    verified++;
   }
   expect(verified).toBeGreaterThanOrEqual(2);
  });
  it("본문 영역이 없는 메뉴 페이지를 본문으로 저장하지 않는다", () => {
   expect(collector.parseDetailBody('<nav>'+ '메뉴와 개인정보처리방침'.repeat(80)+'</nav>')).toBeNull();
  });
 });
}

it("남해의 제목은 줄임표가 없는 별도 원문 제목을 사용한다", () => {
 expect(namhae.parseListPage(read("namhae-list.html"))[1].title).toBe("남해군 어르신들, 2026년 문해의 달 시상식 대거 수상");
});
it("고성군의 두 자리 연도는 올바른 네 자리 연도로 바꾼다", () => {
 expect(goseong_gn.parseListPage(read("goseong_gn-list.html"))[0].publishedDate).toBe("2026-10-02");
});
