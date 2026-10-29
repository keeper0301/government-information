import { expandRegionTagsForAlertMatch } from "@/lib/alerts/matching";

const AGE_GROUP_TO_TAG: Record<string, string> = {
  "10대": "학생",
  "20대": "청년",
  "30대": "청년",
  "40대": "중장년",
  "50대": "중장년",
  "60대 이상": "노년",
};

export function buildDetailMatchFilters(input: {
  region: string | null;
  ageGroup: string | null;
}): { regionTags: string[] | null; ageTags: string[] | null } | null {
  const ageTag = input.ageGroup ? AGE_GROUP_TO_TAG[input.ageGroup] : undefined;
  const ageTags = ageTag ? [ageTag, "전연령"] : null;
  const region = input.region?.trim() || null;
  const regionTags = region && region !== "전국"
    ? Array.from(new Set([...expandRegionTagsForAlertMatch([region]), "전국"]))
    : null;
  if (!regionTags && !ageTags) return null;
  return { regionTags, ageTags };
}
