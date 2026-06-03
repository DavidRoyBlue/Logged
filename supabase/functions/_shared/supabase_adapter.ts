/**
 * supabase_adapter.ts — Wraps the real @supabase/supabase-js client
 * to satisfy the SupabaseLike interface used by the factored handlers.
 *
 * NOTE: mintSession uses auth.admin.generateLink (magic-link strategy) to
 * produce a one-time sign-in URL whose properties double as session tokens.
 * The exact session-mint call (generateLink vs createSession) should be
 * verified during live integration testing once real auth users are provisioned.
 * See DEFERRED.md.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { SupabaseLike } from "./handlers.ts";

export function buildSupabaseLike(
  supabaseUrl: string,
  serviceRoleKey: string
): SupabaseLike {
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  return {
    async rpc(fn, args) {
      // deno-lint-ignore no-explicit-any
      return client.rpc(fn, args) as any;
    },

    async adminCreateUser(email: string) {
      const { data, error } = await client.auth.admin.createUser({
        email,
        email_confirm: true,
      });
      if (error) throw new Error(`adminCreateUser failed: ${error.message}`);
      return { userId: data.user.id };
    },

    async mintSession(userId: string) {
      // Retrieve the user's email so we can generate a magic-link token.
      // The exact best-practice for minting a session via the Admin API
      // (generateLink vs createSession) is verified during live integration.
      // See DEFERRED.md.
      const { data: userData, error: userErr } =
        await client.auth.admin.getUserById(userId);
      if (userErr) throw new Error(`getUserById failed: ${userErr.message}`);

      const email = userData.user.email ?? `${userId}@logged.internal`;

      const { data: linkData, error: linkErr } =
        await client.auth.admin.generateLink({
          type: "magiclink",
          email,
        });
      if (linkErr) throw new Error(`generateLink failed: ${linkErr.message}`);

      // generateLink returns action_link and properties; extract token parts.
      // deno-lint-ignore no-explicit-any
      const props = (linkData as any).properties ?? {};
      return {
        access_token: props.access_token ?? "",
        refresh_token: props.refresh_token ?? "",
      };
    },
  };
}
