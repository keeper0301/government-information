// ============================================================
// /api/admin/upload-image — 블로그 본문 이미지 업로드
// ============================================================
// admin (사장님) 만 호출. multipart/form-data 로 파일 받아 Supabase
// Storage 의 blog-images 버킷에 저장하고 public URL 반환.
//
// 클라이언트 (RichEditor 의 이미지 버튼) 가 호출 → 받은 URL 을 TipTap
// editor.setImage 로 본문에 삽입.
//
// 보안:
//   - admin 인증 (isAdminUser) 필수
//   - file size 5MB 제한 (스토리지 버킷 자체에도 limit, 응답 빠르게 차단)
//   - mime type 화이트리스트 (jpeg/png/webp/gif)
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin-auth";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export async function POST(request: NextRequest) {
  // 1) admin 인증
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminUser(user.email)) {
    return NextResponse.json({ error: "관리자만 업로드 가능합니다" }, { status: 403 });
  }

  // 2) multipart 파싱
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "파일이 없습니다" }, { status: 400 });
  }

  // 3) 검증
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `파일 크기 5MB 초과 (현재 ${Math.round(file.size / 1024)}KB)` },
      { status: 400 },
    );
  }
  if (!ALLOWED_MIMES.has(file.type)) {
    return NextResponse.json(
      { error: "JPEG/PNG/WebP/GIF 만 업로드 가능합니다" },
      { status: 400 },
    );
  }

  // 4) 파일명 — 타임스탬프 + 랜덤 8자 + 원본 확장자.
  // 한글·공백 포함 원본명을 그대로 쓰면 URL 인코딩 골치 → 안전한 새 이름.
  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 10);
  const path = `${new Date().toISOString().slice(0, 7)}/${ts}-${rand}.${ext}`;
  // 예: "2026-04/1745846400000-a1b2c3d4.png" (월별 폴더 → storage 탐색 편의)

  // 5) 업로드 (service_role)
  const adminClient = createAdminClient();
  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await adminClient.storage
    .from("blog-images")
    .upload(path, arrayBuffer, {
      contentType: file.type,
      cacheControl: "31536000", // 1년 (immutable, 파일명에 ts 포함이라 캐시 안전)
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: `업로드 실패: ${uploadError.message}` },
      { status: 500 },
    );
  }

  // 6) public URL 반환
  const { data: urlData } = adminClient.storage.from("blog-images").getPublicUrl(path);
  return NextResponse.json({ url: urlData.publicUrl, path });
}
