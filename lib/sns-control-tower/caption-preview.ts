import { createAdminClient } from "@/lib/supabase/admin";
import { buildThreadsText } from "@/lib/sns/dispatch";
import { loadSnsLeadPolicySnapshot, type SnsLeadVariant } from "./lead-policy";

export type SnsCaptionPreview = {
  slug: string;
  title: string;
  publishedAt: string | null;
  text: string;
  length: number;
  leadVariant: string;
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
