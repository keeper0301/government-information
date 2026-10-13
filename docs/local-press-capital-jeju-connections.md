# 수도권·제주 보도자료 연결 검증

검증일: 2026-10-06. 공식 게시판을 읽는 요청만 실행했으며 이 작업에서는 운영 데이터베이스에 쓰지 않았습니다. 설치·커밋·업로드도 하지 않았습니다. 공용 등록과 정기 실행 연결은 통합 담당자가 처리합니다.

## 지역별 연결

| 지역 | 등록 식별자 | 실행 함수 | 표시 기관 | 공식 목록 주소 | 실제 본문 확인 |
|---|---|---|---|---|---|
| 서울 중랑구 | jungnang | scrapeJungnangAndInsert | 중랑구청 | https://www.jungnang.go.kr/portal/bbs/list/B0000151.do?menuNo=200474 | 167861: 946자, 167860: 834자, 167845: 1386자 |
| 서울 강북구 | gangbuk | scrapeGangbukAndInsert | 강북구청 | https://www.gangbuk.go.kr/portal/bbs/B0000142/list.do?menuNo=200625 | 185408: 925자, 설치된 크롬의 실제 보안 확인 통과 |
| 경기 의정부시 | uijeongbu | scrapeUijeongbuAndInsert | 의정부시청 | https://www.ui4u.go.kr/portal/bbs/list.do?mId=0301020000&ptIdx=1709 | 368733: 553자, 368732: 1009자, 368731: 608자 |
| 제주 제주시 | jejusi | scrapeJejusiAndInsert | 제주시청 | https://www.jejusi.go.kr/news/communite/report.do | 5b375f2fc030455c9e99c37b86901401: 공식 한글 첨부 902자, 다음 두 글 1013·863자 |
| 제주 서귀포시 | seogwipo | scrapeSeogwipoAndInsert | 서귀포시청 | https://www.seogwipo.go.kr/news/seogwiponews/sijungnews.htm | 155452885: 910자, 155450278: 531자, 155450041: 583자 |
| 인천 제물포구 | jemulpo_incheon | scrapeJemulpoIncheonAndInsert | 제물포구청 | https://www.jemulpo.go.kr/main/bbs/bbsMsgList.do?bcd=press | 14233: 545자, 14232: 999자, 14231: 524자 |
| 인천 검단구 | geomdan_incheon | scrapeGeomdanIncheonAndInsert | 검단구청 | https://www.geomdan.go.kr/main/community/news/report.jsp | 211: 825자, 210: 621자, 209: 775자 |
| 인천 영종구 | yeongjong_incheon | scrapeYeongjongIncheonAndInsert | 영종구청 | https://www.yeongjong.go.kr/main/pst/list.do?pst_id=mn_news_yj | 334117: 1039자, 334103: 1008자, 334102: 871자 |

## 구현과 통합 주의사항

- 중랑구는 언론 기사 모음 게시판이 아닌 자체 보도자료 게시판 B0000151을 사용합니다.
- 의정부는 변경된 `boardView` 상세 이동 문장에서 글 식별자를 읽습니다.
- 강북구는 `gangbuk-browser.ts`의 독립 브라우저 경로로 보안 스크립트와 쿠키를 정상 처리합니다. 내려받은 보안 프로그램을 임의 실행하지 않습니다. 윈도우는 설치된 크롬, 서버는 기존 서버용 크롬을 사용합니다.
- 기존 브라우저 등록에 중랑구·강북구·의정부가 있으므로 공용 등록 통합 시 중복 실행을 정리해야 합니다. 강북의 새 실행 함수 자체가 브라우저를 호출합니다.
- 제주시는 웹페이지의 제목·사진·첨부 목록으로 본문 길이를 부풀리지 않습니다. 한글 첨부 전문을 먼저 해석하고, 첨부가 없으면 `.memo`의 실제 문장만 사용합니다.
- 서귀포시는 요청 환경에 따라 목록 행이 `li` 또는 `.blog-board-list > .list`로 바뀝니다. 공용 요청 함수로 두 번째 구조를 실제 확인해 모두 지원합니다.
- 제물포·검단의 현재 본문은 `.con-box .detail`에 정적으로 있습니다. 한글 편집기 안의 실제 문장도 보존하며, 정적 전문이 없을 때만 기존 첨부 해석기를 사용합니다.
- 영종구는 공지사항 `mn_ntc`와 보도자료 `mn_news_yj`를 구분합니다. 본문은 `.board_content .editor_content`만 읽습니다.
- 날짜는 각 게시물 행에서 읽으며, 본문은 250자 미만이면 제외하고 최대 20,000자로 제한합니다.

## 추가 기존 수집기 확인

- 광주 남구 `namgu_gwangju`의 기존 주소는 공지사항이었습니다. 공식 보도자료 메뉴 `https://www.namgu.gwangju.kr/menu.es?mid=a10605050000`가 연결하는 새올 게시판으로 교체했습니다. 실행 함수와 출처 식별자는 유지했습니다.
- 새올 목록은 `https://eminwon.namgu.gwangju.kr/emwp/gov/mogaha/ntis/web/ofr/action/OfrAction.do`에 `jndinm=OfrBcAdvNewsEJB`, `method=selectListOfrNews`, `methodnm=selectListOfrNewsHomepage`, `subCheck=Y` 등의 공식 매개변수를 전달합니다. 상세 조회는 `method=selectOfrNews`, `methodnm=selectOfrNewsMgt`, `news_epct_no`를 사용합니다. 일반 읽기 요청으로 목록과 전문을 확보했습니다.
- 광주 남구 최신 글 6679·6678·6677의 본문은 각각 986·907·959자입니다.
- 울산 중구 `junggu_ulsan` 최신 다섯 글은 실제 사진 설명이 63~80자라 250자 기준에 따라 제외되는 것이 정상입니다. 6~9번째 글 726498·726497·726496·726495는 기존 코드로 각각 647·778·942·2780자를 확보했습니다. 기준을 낮추거나 짧은 문장을 늘리지 않았으며 코드 수정도 하지 않았습니다.
- 부산 사하구 `saha`는 기존 공식 첨부 해석기로 글 154601·154507·154384의 PDF 본문을 각각 1039·703·571자 확보했습니다. 기존 코드 변경 없이 재확인했습니다.

## 검사

- 공식 구조를 짧은 합성 문장으로 재현한 목록·본문 검사와 인천 새 본문 위치, 제주시 압축 한글 첨부, 서귀포 두 목록 구조, 광주 남구 올바른 게시판 검사를 추가했습니다.
- 검사 자료에는 실제 보도자료 전문을 복제하지 않았습니다.
- 관련 검사 21개와 변경된 구현·검사 파일의 문법 검사를 통과했습니다.
- 실제 확인은 공용 요청 함수로 목록과 상세를 읽고, 강북구만 실제 크롬으로 목록과 상세를 읽었습니다. 이후 통합 담당자의 운영 저장 검증 결과는 별도 기록을 따릅니다.

