import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { welfareToDisplay, loanToDisplay, type DisplayProgram } from "@/lib/programs";

const KEYWORD_MAP: Record<string, { table: "welfare_programs" | "loan_programs"; field: string; value: string }[]> = {
  "청년": [{ table: "welfare_programs", field: "target", value: "%청년%" }, { table: "loan_programs", field: "target", value: "%청년%" }],
  "주거": [{ table: "welfare_programs", field: "category", value: "주거" }],
  "월세": [{ table: "welfare_programs", field: "category", value: "주거" }],
  "취업": [{ table: "welfare_programs", field: "category", value: "취업" }],
  "양육": [{ table: "welfare_programs", field: "category", value: "양육" }],
  "의료": [{ table: "welfare_programs", field: "category", value: "의료" }],
  "대출": [{ table: "loan_programs", field: "category", value: "%대출%" }],
  "소상공인": [{ table: "loan_programs", field: "target", value: "%소상공인%" }],
  "창업": [{ table: "loan_programs", field: "target", value: "%창업%" }],
  "지원금": [{ table: "loan_programs", field: "category", value: "지원금" }],
  "보증": [{ table: "loan_programs", field: "category", value: "보증" }],
  "노인": [{ table: "welfare_programs", field: "target", value: "%노인%" }],
  "기초연금": [{ table: "welfare_programs", field: "title", value: "%기초연금%" }],
};

export async function POST(request: NextRequest) {
  const { message } = await request.json();
  if (!message || typeof message !== "string") {
    return NextResponse.json({ reply: "메시지를 입력해주세요.", programs: [] });
  }

  const supabase = await createClient();
  const programs: DisplayProgram[] = [];
  const matchedKeywords: string[] = [];

  // Find matching keywords
  for (const [keyword, queries] of Object.entries(KEYWORD_MAP)) {
    if (message.includes(keyword)) {
      matchedKeywords.push(keyword);
      for (const q of queries) {
        if (q.value.includes("%")) {
          const { data } = await supabase
            .from(q.table)
            .select("*")
            .ilike(q.field, q.value)
            .limit(3);
          if (data) {
            const converted = q.table === "welfare_programs"
              ? data.map(welfareToDisplay)
              : data.map(loanToDisplay);
            programs.push(...converted);
          }
        } else {
          const { data } = await supabase
            .from(q.table)
            .select("*")
            .eq(q.field, q.value)
            .limit(3);
          if (data) {
            const converted = q.table === "welfare_programs"
              ? data.map(welfareToDisplay)
              : data.map(loanToDisplay);
            programs.push(...converted);
          }
        }
      }
    }
  }

  // Deduplicate by id
  const unique = Array.from(new Map(programs.map((p) => [p.id, p])).values());

  // Generate reply
  let reply: string;
  if (unique.length > 0) {
    reply = `"${matchedKeywords.join(", ")}" 관련 프로그램 ${unique.length}건을 찾았습니다.`;
  } else if (message.length < 2) {
    reply = "검색어를 좀 더 구체적으로 입력해주세요. 예: '청년 주거', '소상공인 대출', '의료 지원'";
  } else {
    // Fallback: full-text search
    const searchTerm = `%${message}%`;
    const [{ data: w }, { data: l }] = await Promise.all([
      supabase.from("welfare_programs").select("*").or(`title.ilike.${searchTerm},description.ilike.${searchTerm}`).limit(3),
      supabase.from("loan_programs").select("*").or(`title.ilike.${searchTerm},description.ilike.${searchTerm}`).limit(3),
    ]);
    const fallback = [
      ...(w || []).map(welfareToDisplay),
      ...(l || []).map(loanToDisplay),
    ];
    if (fallback.length > 0) {
      reply = `"${message}" 관련 프로그램 ${fallback.length}건을 찾았습니다.`;
      unique.push(...fallback);
    } else {
      reply = "관련 프로그램을 찾지 못했습니다. 다른 키워드로 검색해보세요.\n\n추천 키워드: 청년, 주거, 대출, 소상공인, 의료, 양육";
    }
  }

  return NextResponse.json({ reply, programs: unique.slice(0, 5) });
}
