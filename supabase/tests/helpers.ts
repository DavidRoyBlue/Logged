import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export function serviceClient(): SupabaseClient {
  return createClient(URL, SERVICE, { auth: { persistSession: false } });
}

/** Create a confirmed auth user via the Admin API and return a client authed AS that user. */
export async function userClient(email: string): Promise<{ client: SupabaseClient; userId: string }> {
  const admin = serviceClient();
  const { data, error } = await admin.auth.admin.createUser({
    email, password: "test-password-123", email_confirm: true,
  });
  if (error) throw error;
  const userId = data.user!.id;
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password: "test-password-123" });
  if (signInErr) throw signInErr;
  return { client, userId };
}

export async function cleanupUser(userId: string): Promise<void> {
  await serviceClient().auth.admin.deleteUser(userId);
}
