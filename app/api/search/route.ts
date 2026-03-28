import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { welfareToDisplay, loanToDisplay } from "@/lib/programs";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");

  if (!q || q.trim().length < 2) {
    return NextResponse.json(
      { results: [], error: "검색어는 2글자 이상 입력해주세요." },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const sanitized = q.trim().replace(/[%_\\]/g, '\\$&');
  const searchTerm = `%${sanitized}%`;

  const [{ data: welfare }, { data: loans }] = await Promise.all([
    supabase
      .from("welfare_programs")
      .select("*")
      .or(`title.ilike.%${sanitized}%,description.ilike.%${sanitized}%,category.ilike.%${sanitized}%`)
      .order("view_count", { ascending: false })
      .limit(10),
    supabase
      .from("loan_programs")
      .select("*")
      .or(`title.ilike.%${sanitized}%,description.ilike.%${sanitized}%,category.ilike.%${sanitized}%`)
      .order("view_count", { ascending: false })
      .limit(10),
  ]);

  const results = [
    ...(welfare || []).map(welfareToDisplay),
    ...(loans || []).map(loanToDisplay),
  ];

  return NextResponse.json({ results, total: results.length });
}
