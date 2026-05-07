"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import {
  markNaverPublished,
  markNaverSkipped,
} from "@/lib/naver-blog/queue";

async function requireAdminUserId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminUser(user.email)) {
    throw new Error("권한 없음");
  }
  return user.id;
}

function getRequiredString(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${key} 누락`);
  }
  return value;
}

function getOptionalString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string" || value.length === 0) return null;
  return value;
}

/**
 * 사장님이 네이버 블로그에 게시 완료한 후 호출. URL 은 선택 (사장님 추적용).
 */
export async function markNaverPublishedAction(formData: FormData) {
  const actorId = await requireAdminUserId();
  const queueId = getRequiredString(formData, "queue_id");
  const naverUrl = getOptionalString(formData, "naver_url");
  await markNaverPublished(queueId, actorId, naverUrl);
  revalidatePath("/admin/naver-blog");
}

/**
 * 사장님이 이번 글은 발행 안 하기로 결정한 경우 호출.
 */
export async function markNaverSkippedAction(formData: FormData) {
  const actorId = await requireAdminUserId();
  const queueId = getRequiredString(formData, "queue_id");
  const reason = getOptionalString(formData, "reason");
  await markNaverSkipped(queueId, actorId, reason);
  revalidatePath("/admin/naver-blog");
}
