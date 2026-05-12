"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/admin-actions";
import {
  parseAndValidateCookies,
  saveCookies,
} from "@/lib/naver-blog/cookies-vault";

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

export type UploadCookiesResult =
  | { ok: true; cookiesCount: number; expiresMin: string | null }
  | { ok: false; error: string };

export async function uploadCookiesAction(
  formData: FormData,
): Promise<UploadCookiesResult> {
  try {
    const actorId = await requireAdminUserId();

    const rawJson = formData.get("cookies_json");
    if (typeof rawJson !== "string" || rawJson.length === 0) {
      return { ok: false, error: "cookies JSON 을 입력해주세요." };
    }
    const notesRaw = formData.get("notes");
    const notes = typeof notesRaw === "string" && notesRaw.length > 0 ? notesRaw : null;

    const cookies = parseAndValidateCookies(rawJson);
    const result = await saveCookies(cookies, actorId, notes);

    try {
      await logAdminAction({
        actorId,
        action: "naver_cookies_uploaded",
        details: {
          row_id: result.id,
          cookies_count: cookies.length,
          expires_min: result.expiresMin,
        },
      });
    } catch {
      // audit 실패는 응답 영향 X
    }

    revalidatePath("/admin/naver-blog/cookies");

    return {
      ok: true,
      cookiesCount: cookies.length,
      expiresMin: result.expiresMin,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
