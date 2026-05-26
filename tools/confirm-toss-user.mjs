// 일회용: 토스 검수 계정 email 강제 confirm (.env.local 의 TOSS_REVIEW_ADMIN_USER_ID 대상)
// supabase email 발송 안 됨 → service_role 으로 admin API 직접 호출
import "dotenv/config";
import fs from "node:fs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SK) {
  // .env.local 직접 읽기 fallback
  const env = fs.readFileSync(".env.local", "utf8");
  const get = (k) => env.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1];
  process.env.NEXT_PUBLIC_SUPABASE_URL = get("NEXT_PUBLIC_SUPABASE_URL");
  process.env.SUPABASE_SERVICE_ROLE_KEY = get("SUPABASE_SERVICE_ROLE_KEY");
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// USER_ID 도 .env.local 에서 로딩 (admin UUID 노출 방지)
const env = fs.readFileSync(".env.local", "utf8");
const USER_ID = env.match(/^TOSS_REVIEW_ADMIN_USER_ID=(.+)$/m)?.[1]?.trim();

if (!URL || !KEY || !USER_ID) {
  console.error(
    "❌ .env.local 에 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / TOSS_REVIEW_ADMIN_USER_ID 누락",
  );
  process.exit(1);
}

const r = await fetch(`${URL}/auth/v1/admin/users/${USER_ID}`, {
  method: "PUT",
  headers: {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ email_confirm: true }),
});
const d = await r.json();
console.log({
  status: r.status,
  email: d.email,
  email_confirmed_at: d.email_confirmed_at,
  msg: d.msg || d.message,
});
