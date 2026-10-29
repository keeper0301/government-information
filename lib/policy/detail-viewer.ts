"use server";

import { createClient } from "@/lib/supabase/server";
import { loadUserProfile } from "@/lib/personalization/load-profile";
import { LOAN_EXCLUDED_FILTER, WELFARE_EXCLUDED_FILTER } from "@/lib/listing-sources";
import { buildDetailMatchFilters } from "@/lib/policy/detail-match";

type MatchFilters = { regionTags: string[] | null; ageTags: string[] | null };

async function countPrograms(
  table: "welfare_programs" | "loan_programs",
  excluded: string,
  filters: MatchFilters,
): Promise<number | null> {
  const supabase = await createClient();
  let query = supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .not("is_hidden", "is", true)
    .not("source_code", "in", excluded);
  if (filters.regionTags) query = query.overlaps("region_tags", filters.regionTags);
  if (filters.ageTags) query = query.overlaps("age_tags", filters.ageTags);
  const { count, error } = await query;
  if (error) return null;
  return count ?? 0;
}

export async function loadDetailViewer(): Promise<{ loggedIn: boolean; matchCount: number | null }> {
  const profile = await loadUserProfile();
  if (!profile) return { loggedIn: false, matchCount: null };
  const filters = buildDetailMatchFilters({
    region: profile.signals.region,
    ageGroup: profile.signals.ageGroup,
  });
  if (!filters) return { loggedIn: true, matchCount: null };

  const [welfareCount, loanCount] = await Promise.all([
    countPrograms("welfare_programs", WELFARE_EXCLUDED_FILTER, filters),
    countPrograms("loan_programs", LOAN_EXCLUDED_FILTER, filters),
  ]);
  if (welfareCount === null || loanCount === null) return { loggedIn: true, matchCount: null };
  return { loggedIn: true, matchCount: welfareCount + loanCount };
}
