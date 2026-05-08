"use client";

// /search 결과 노출 시 GA4 search_results_shown 이벤트 fire.
// 마운트 + deps 변경 (query/types/sort/total) 마다 fire — 사용자 인터랙션
// 패턴 (검색어 변경·영역 필터·정렬) 모두 측정. 빈 결과 (total=0) 도 fire 해
// 빈 결과율·인기 키워드 분석 가능.

import { useEffect } from "react";
import { trackEvent, EVENTS } from "@/lib/analytics";

type Props = {
  query: string;
  typeFilter: string; // "all" 또는 "welfare,loan" 같은 csv
  sort: string;
  total: number;
  welfareTotal: number;
  loanTotal: number;
  newsTotal: number;
  blogTotal: number;
};

export function SearchTracker({
  query,
  typeFilter,
  sort,
  total,
  welfareTotal,
  loanTotal,
  newsTotal,
  blogTotal,
}: Props) {
  useEffect(() => {
    trackEvent(EVENTS.SEARCH_RESULTS_SHOWN, {
      query,
      type_filter: typeFilter,
      sort,
      total_count: total,
      has_results: total > 0 ? 1 : 0,
      welfare_count: welfareTotal,
      loan_count: loanTotal,
      news_count: newsTotal,
      blog_count: blogTotal,
    });
  }, [query, typeFilter, sort, total, welfareTotal, loanTotal, newsTotal, blogTotal]);

  return null;
}
