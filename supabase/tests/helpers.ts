import { createClient, type SupabaseClient, type WebSocketLikeConstructor } from "@supabase/supabase-js";
import ws from "ws";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

// `ws`'s WebSocket has an overloaded constructor (a `null`-only signature for
// server mode); realtime-js's WebSocketLikeConstructor only models the client
// signature, so a direct assignment doesn't structurally match.
const wsTransport = ws as unknown as WebSocketLikeConstructor;

export function serviceClient(): SupabaseClient {
  return createClient(URL, SERVICE, {
    auth: { persistSession: false },
    realtime: { transport: wsTransport },
  });
}

/** Create a confirmed auth user via the Admin API and return a client authed AS that user. */
export async function userClient(email: string): Promise<{ client: SupabaseClient; userId: string }> {
  const admin = serviceClient();
  const { data, error } = await admin.auth.admin.createUser({
    email, password: "test-password-123", email_confirm: true,
  });
  if (error) throw error;
  const userId = data.user!.id;
  const client = createClient(URL, ANON, {
    auth: { persistSession: false },
    realtime: { transport: wsTransport },
  });
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password: "test-password-123" });
  if (signInErr) throw signInErr;
  return { client, userId };
}

export async function cleanupUser(userId: string): Promise<void> {
  await serviceClient().auth.admin.deleteUser(userId);
}
