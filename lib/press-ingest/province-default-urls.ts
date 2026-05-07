// ============================================================
// 광역 도청 17개 공식 url 매핑 — apply_url fallback 4 layer
// ============================================================
// LLM 이 apply_url 못 뽑고 본문에 정부 도메인 url 도 없을 때 마지막 안전 fallback.
// 사용자가 광역 도청 메인 페이지 진입 → 거기서 검색·문의 가능.
//
// key: news_posts.ministry 의 startsWith 매칭 prefix
// value: 도청 공식 메인 페이지 https url (모두 .go.kr 화이트리스트 일치)
//
// 시군 (예: '전라남도 순천시') 도 '전라남도' prefix 로 매칭됨.
// 강원도/강원특별자치도, 전라북도/전북특별자치도 변형은 둘 다 동일 url.
// ============================================================

export const PROVINCE_DEFAULT_URLS: Record<string, string> = {
  서울특별시: "https://www.seoul.go.kr",
  부산광역시: "https://www.busan.go.kr",
  대구광역시: "https://www.daegu.go.kr",
  인천광역시: "https://www.incheon.go.kr",
  광주광역시: "https://www.gwangju.go.kr",
  대전광역시: "https://www.daejeon.go.kr",
  울산광역시: "https://www.ulsan.go.kr",
  세종특별자치시: "https://www.sejong.go.kr",
  경기도: "https://www.gg.go.kr",
  강원도: "https://www.gangwon.go.kr",
  강원특별자치도: "https://www.gangwon.go.kr",
  충청북도: "https://www.chungbuk.go.kr",
  충청남도: "https://www.chungnam.go.kr",
  전라북도: "https://www.jeonbuk.go.kr",
  전북특별자치도: "https://www.jeonbuk.go.kr",
  전라남도: "https://www.jeonnam.go.kr",
  경상북도: "https://www.gb.go.kr",
  경상남도: "https://www.gyeongnam.go.kr",
  제주특별자치도: "https://www.jeju.go.kr",
};
