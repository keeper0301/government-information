# 경북 누락 14개 지역 연결 결과

2026년 10월 6일 공식 사이트의 목록과 최근 글 3개를 실제로 읽었습니다. 데이터베이스 저장은 하지 않았습니다.

- 신규 수집기 14개를 구현했습니다. 모두 최소 250자의 공식 본문을 확보했습니다.
- 메뉴·첨부 목록·실행문은 본문에서 제외하고, 글이 속한 행에서 날짜를 읽습니다.
- 문경·경산·청송은 공식 한글 첨부에서 전문을 추출합니다. 성주는 공개 상세 페이지의 세션을 첨부 요청에 이어 줍니다.
- 청도는 공식 「사진으로 보는 군정」에 본문이 있어 이를 사용합니다.
- 울진 보도게시판은 짧은 제목 목록과 같은 목록의 PDF만 제공합니다. 이에 정책·지원사업 전문을 제공하는 공식 공지로 연결했습니다. 보도자료 전문을 확보했다고 표시하지 않습니다. 최근 3개 중 2개 짧은 안내는 제외되고, PC 보급사업 전문 795자가 확보됐습니다.
- 단위 검사 29개를 통과했습니다. 실사이트 검사는 별도로 선택 실행하도록 분리합니다.

## 통합 등록 정보

| 식별자 | 지역 표시 | 담당기관 | 공식 목록 주소 | 내보내는 함수 | 확인 본문 길이 |
|---|---|---|---|---|---|
| mungyeong | 경북 문경시 | 경북 문경시청 | https://www.gbmg.go.kr/portal/mayorForcus/list.do?mId=0302010000 | scrapeMungyeongAndInsert | 2929, 12898, 4846 |
| gyeongsan | 경북 경산시 | 경북 경산시청 | https://www.gbgs.go.kr/open_content/ko/page.do?mnu_uid=5904 | scrapeGyeongsanAndInsert | 1081, 999, 765 |
| uiseong | 경북 의성군 | 경북 의성군청 | https://www.usc.go.kr/ko/page.do?mnu_uid=190 | scrapeUiseongAndInsert | 777, 710, 683 |
| cheongsong | 경북 청송군 | 경북 청송군청 | https://www.cs.go.kr/news/00002679/00003478.web | scrapeCheongsongAndInsert | 2280, 2861, 1937 |
| yeongyang | 경북 영양군 | 경북 영양군청 | https://www.yyg.go.kr/www/organization/yyg_news/explanation_data | scrapeYeongyangAndInsert | 1032, 922, 1689 |
| yeongdeok | 경북 영덕군 | 경북 영덕군청 | https://www.yd.go.kr/?page_id=8844 | scrapeYeongdeokAndInsert | 785, 359, 762 |
| cheongdo | 경북 청도군 | 경북 청도군청 | https://www.cheongdo.go.kr/portal/contents.do?mid=0301070000 | scrapeCheongdoAndInsert | 2096, 588, 362 |
| goryeong | 경북 고령군 | 경북 고령군청 | https://www.goryeong.go.kr/kor/boardList.do?IDX=157&BRD_ID=1062 | scrapeGoryeongAndInsert | 938, 546, 432 |
| seongju | 경북 성주군 | 경북 성주군청 | https://www.sj.go.kr/page.do?mnu_uid=3546 | scrapeSeongjuAndInsert | 648, 387, 630 |
| chilgok | 경북 칠곡군 | 경북 칠곡군청 | https://www.chilgok.go.kr/portal/contents.do?mId=0202010000 | scrapeChilgokAndInsert | 1251, 1145, 1037 |
| yecheon | 경북 예천군 | 경북 예천군청 | https://www.ycg.kr/open.content/ko/administrative/news/headline/ | scrapeYecheonAndInsert | 835, 613, 660 |
| bonghwa | 경북 봉화군 | 경북 봉화군청 | https://www.bonghwa.go.kr/portal/contents.do?mid=0201090000 | scrapeBonghwaAndInsert | 1012, 704, 686 |
| ulleung | 경북 울릉군 | 경북 울릉군청 | https://www.ulleung.go.kr/ko/page.do?mnu_uid=574 | scrapeUlleungAndInsert | 609, 871, 1016 |
| uljin | 경북 울진군 | 경북 울진군청 | https://www.uljin.go.kr/board/list.uljin?boardId=BBS_NOTICE_UJ&menuCd=DOM_000000103002001000 | scrapeUljinAndInsert | 제외, 제외, 795 |

실제 확인의 제목·날짜·원문 주소는 `local-press-gyeongbuk-live-evidence.json`에 기록했습니다. 모든 수집기의 자료 식별자는 `local-press-{식별자}`입니다. 기존 공용 등록 파일은 수정하지 않았습니다.
