import { isAdminUser } from "@/lib/admin-auth";
import { createClient } from "@/lib/supabase/server";

export async function getSignedInUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

export async function requireAdminUser() {
  const user = await getSignedInUser();

  if (!user || !isAdminUser(user.email)) return null;
  return user;
}
