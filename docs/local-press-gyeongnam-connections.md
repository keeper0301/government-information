# 경남 누락 16개 지역 연결 검증

2026년 10월 6일 공식 사이트를 실제로 읽었습니다. 모든 지역 목록이 확인되었고, 지역별 최신 상세 2~3건 본문이 250자 이상으로 추출되었습니다. 저장소 등록·실제 저장 작업은 통합 단계에서 수행합니다.

| 등록키 | 지역 | 기관 | 목록 주소 | 실행 함수 |
|---|---|---|---|---|
| jinju | 진주시 | 진주시청 | https://www.jinju.go.kr/00138.web | scrapeJinjuAndInsert |
| tongyeong | 통영시 | 통영시청 | https://www.tongyeong.go.kr/00859.web | scrapeTongyeongAndInsert |
| sacheon | 사천시 | 사천시청 | https://www.sacheon.go.kr/news/00009/04236.web | scrapeSacheonAndInsert |
| miryang | 밀양시 | 밀양시청 | https://www.miryang.go.kr/web/index.do?mnNo=20100000000 | scrapeMiryangAndInsert |
| geoje | 거제시 | 거제시청 | https://www.geoje.go.kr/board/list.geoje?boardId=BBS_0000028&menuCd=DOM_000008902003004000 | scrapeGeojeAndInsert |
| yangsan | 양산시 | 양산시청 | https://www.yangsan.go.kr/portal/contents.do?mid=0105010000 | scrapeYangsanAndInsert |
| uiryeong | 의령군 | 의령군청 | https://www.uiryeong.go.kr/board/list.uiryeong?boardId=BBS_0000080&menuCd=DOM_000000203005001000&contentsSid=189 | scrapeUiryeongAndInsert |
| haman | 함안군 | 함안군청 | https://www.haman.go.kr/00958.web | scrapeHamanAndInsert |
| changnyeong | 창녕군 | 창녕군청 | https://www.cng.go.kr/01541/01552.web | scrapeChangnyeongAndInsert |
| goseong_gn | 경남 고성군 | 경남 고성군청 | https://www.goseong.go.kr/index.goseong?menuCd=DOM_000000102002008000 | scrapeGoseongGnAndInsert |
| namhae | 남해군 | 남해군청 | https://www.namhae.go.kr/news/pgnews/List.do?pCate1=1000&pageCd=SM0102010000&siteGubun=socialm | scrapeNamhaeAndInsert |
| hadong | 하동군 | 하동군청 | https://www.hadong.go.kr/media/00013/03607.web | scrapeHadongAndInsert |
| sancheong | 산청군 | 산청군청 | https://www.sancheong.go.kr/news/selectBbsNttList.do?key=1825&bbsNo=115 | scrapeSancheongAndInsert |
| hamyang | 함양군 | 함양군청 | https://www.hygn.go.kr/01997/02007.web | scrapeHamyangAndInsert |
| geochang | 거창군 | 거창군청 | https://www.geochang.go.kr/00445/00452.web | scrapeGeochangAndInsert |
| hapcheon | 합천군 | 합천군청 | https://www.hc.go.kr/04953.web | scrapeHapcheonAndInsert |

검사: `__tests__/lib/scraping/local-press/gyeongnam-connections.test.ts` 50개 통과. 실제 페이지 기사 부분을 보존한 검사자료로 날짜 혼입·공지 제외·중복·본문 영역 누락·제목 줄임표 등을 확인했습니다.

- 양산: 화면의 버튼은 POST 방식이지만 동일 공식 상세 주소의 GET 조회도 본문을 제공하여 공통 수집기를 사용했습니다.
- 함안: 비표준 응답 헤더 때문에 일반 조회가 실패하지만 기존 공통 수집기의 헤더 재시도로 정상 본문을 읽었습니다.
- 의령: 2015년 공지 「뉴스미란다 원칙」은 기사 목록에서 제외합니다. 해당 공지 본문이 짧다는 사실은 수집 장애가 아닙니다.
- 남해: 화면에서 잘린 제목 대신 같은 게시글의 전체 제목을 읽습니다.
- 고성: 강원 고성군과 혼동하지 않게 기관을 「경남 고성군청」으로 구분합니다.
- 세부 실제 응답 결과: `docs/local-press-gyeongnam-live.json`. 이 최초 실측 결과에는 제외하기 전 의령 공지 1건도 기록되어 있습니다.

## 추가로 발견한 기존 연결 오류 복구

- 광주 북구를 포함한 새올 공통 목록: 행 번호가 제목칸으로 오인되지 않도록 제목 링크가 있는 칸에서 제목과 다음 칸의 부서를 읽습니다. 원본이 빈 기사와 차단 응답을 구분합니다.
- 보령: 새로 바뀐 `view.do?mgtno=` 목록 주소를 지원합니다. 최신 2개 공식 본문 558자와 778자를 확인했습니다.
- 부산: 사진 카드 길이에 영향을 받지 않고 제목과 각 카드의 날짜를 읽습니다. 최신 2개 공식 첨부 본문 1479자와 973자를 확인했습니다. 첨부 PDF의 실제 읽기는 일반 실행 환경에서 확인했습니다.
- 충북: 중첩된 본문 영역을 끝까지 읽습니다. 최신 2개 공식 본문 1278자와 1192자를 확인했습니다.
- 강원: 새 HWPX 첨부를 지원합니다. 최신 2개 공식 본문 1075자와 1131자를 확인했습니다. 이미 설치된 문서 읽기 도구를 사용했습니다.
- 철원: 첫 화면에서 언론보도 메뉴를 열면 목록 10개가 표시되며 2026-10-01 최신 글 294558의 공식 HWPX 전문은 541자입니다. 직접 요청 실패를 해결하려고 설치된 크롬이 공식 첫 화면을 거쳐 목록·상세·첨부를 읽는 수집 경로로 연결했습니다. 실제 자동 실행에서 최신 1건·541자 원문·오류 0건·메모리 모의 저장 1건을 확인했습니다. 실제 데이터베이스 쓰기는 하지 않았습니다. 상세 증거는 `docs/local-press-cheorwon-browser-live.json`에 있습니다. 검증 주소: `https://www.cwg.go.kr/www/downloadBbsFile.do?atchmnflNo=177601&bbsNo=32&nttNo=294558`.
- 삼척: 다른 최신 글에서 정상 본문이 확인되어 수정하지 않았습니다.

실제 공식 응답 검증과 별도로 제목·날짜·중첩 본문·빈 본문·첨부 문서에 대한 회귀 검사를 추가했습니다. 데이터베이스 저장은 실행하지 않았습니다.


## 철원 연결 반복 검증

동일 자동 경로를 반복 실행할 때 정상 원문 541자 확보와 첫 화면 연결 시간 초과가 모두 재현되었습니다. 정상 실행의 원문 읽기·저장 준비는 검증됐지만 공식 사이트 연결 자체는 간헐적으로 끊깁니다. 각 연결은 12초 이내로 두 번까지 시도하고 브라우저 읽기 전체를 80초 이내로 제한해 도시당 90초 수집 예산을 지킵니다. 상세 반복 결과는 `docs/local-press-cheorwon-repeat-probe.json`에 있습니다. 최종 실제 저장 및 운영 연결은 별도 검증 결과를 기준으로 판단해야 합니다.
