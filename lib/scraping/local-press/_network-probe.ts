import { describeScrapeError } from "./_error-details";

// 연결 장애가 확인된 두 공식 사이트만 점검합니다. 외부 주소 입력은 받지 않습니다.
export async function probeBlockedPressSites() {
  const paths = [
    "www.jungnang.go.kr/portal/bbs/list/B0000151.do?menuNo=200474",
    "www.miryang.go.kr/web/bbs/selectBoardList.do?bbsId=BBSMSTR_000000000356&mnNo=20100000000",
  ];
  const results = [];
  for (const path of paths) {
    for (const protocol of ["https", "http"]) {
      const url = `${protocol}://${path}`, start = Date.now();
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
        const body = await response.text();
        results.push({ url, finalUrl: response.url, status: response.status, size: body.length, elapsedMs: Date.now() - start });
      } catch (error) {
        results.push({ url, error: describeScrapeError(error), elapsedMs: Date.now() - start });
      }
    }
  }
  return results;
}
