import { describe, expect, it } from "vitest";
import { parseEgovDownFileUrls } from "@/lib/scraping/local-press/_si_attach_helper";

describe("parseEgovDownFileUrls", () => {
  it("fn_egov_downFile 호출을 같은 origin의 FileDown.do 다운로드 URL로 변환하고 중복을 제거한다", () => {
    const html = `
      <a href="#" onclick="fn_egov_downFile('attach-1','file 1'); return false;">다운로드</a>
      <a href="#" onclick='fn_egov_downFile("attach-1","file 1"); return false;'>중복 다운로드</a>
      <a href="#" onclick="fn_egov_downFile('attach-2','file/2'); return false;">다운로드</a>
    `;

    expect(parseEgovDownFileUrls(html, "https://www.osan.go.kr/portal/bbs/view.do")).toEqual([
      "https://www.osan.go.kr/cmm/fms/FileDown.do?atchFileId=attach-1&fileSn=file%201",
      "https://www.osan.go.kr/cmm/fms/FileDown.do?atchFileId=attach-2&fileSn=file%2F2",
    ]);
  });
});
