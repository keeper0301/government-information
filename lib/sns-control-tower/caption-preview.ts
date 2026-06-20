import { createAdminClient } from "@/lib/supabase/admin";
import { buildThreadsText } from "@/lib/sns/dispatch";
import { LEAD_VARIANTS, loadSnsLeadPolicySnapshot, type SnsLeadVariant } from "./lead-policy";

const CHALLENGER_LEADS: SnsLeadVariant[] = ["lead_3", "lead_4", "lead_5"];

export type SnsLeadCandidatePreview = {
  leadVariant: SnsLeadVariant;
  firstLine: string;
  text: string;
  length: number;
};

export type SnsCaptionPreview = {
  slug: string;
  title: string;
  publishedAt: string | null;
  text: string;
  length: number;
  leadVariant: string;
  challengerPreviews: SnsLeadCandidatePreview[];
};

type BlogPreviewRow = {
  slug: string;
  title: string;
  meta_description: string | null;
  published_at: string | null;
};

function extractLeadVariant(text: string): string {
  const match = text.match(/utm_content=(lead_\d+)/);
  return match?.[1] ?? "—";
}

function firstLine(text: string): string {
  return text.split("\n").find((line) => line.trim().length > 0)?.trim() ?? "";
}

function forceLeadPreview(row: BlogPreviewRow, leadVariant: SnsLeadVariant): SnsLeadCandidatePreview {
  const text = buildThreadsText(
    {
      title: row.title,
      slug: row.slug,
      description: row.meta_description,
    },
    { disabledLeadVariants: LEAD_VARIANTS.filter((lead) => lead !== leadVariant), includeChallengerLeads: true },
  );
  return {
    leadVariant,
    firstLine: firstLine(text),
    text,
    length: text.length,
  };
}

export function buildSnsCaptionPreview(
  row: BlogPreviewRow,
  opts: { disabledLeadVariants?: SnsLeadVariant[] } = {},
): SnsCaptionPreview {
  const text = buildThreadsText({
    title: row.title,
    slug: row.slug,
    description: row.meta_description,
  }, opts);
  return {
    slug: row.slug,
    title: row.title,
    publishedAt: row.published_at,
    text,
    length: text.length,
    leadVariant: extractLeadVariant(text),
    challengerPreviews: CHALLENGER_LEADS.map((lead) => forceLeadPreview(row, lead)),
  };
}

export async function loadLatestSnsCaptionPreviews(limit = 3): Promise<SnsCaptionPreview[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("blog_posts")
    .select("slug, title, meta_description, published_at")
    .not("slug", "is", null)
    .not("title", "is", null)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw new Error(`blog_posts preview select failed: ${error.message}`);
  const leadPolicy = await loadSnsLeadPolicySnapshot(admin);
  return ((data ?? []) as BlogPreviewRow[]).map((row) =>
    buildSnsCaptionPreview(row, { disabledLeadVariants: leadPolicy.disabledLeadVariants }),
  );
}
