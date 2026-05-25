import { isAdminUser } from "@/lib/admin-auth";
import { createClient } from "@/lib/supabase/server";

export async function requireAdminUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminUser(user.email)) return null;
  return user;
}
