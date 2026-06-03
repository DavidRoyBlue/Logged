import { describe, it, expect } from "vitest";
import { serviceClient, userClient, cleanupUser } from "./helpers";

describe("token encryption", () => {
  it("round-trips and stores ciphertext that differs from plaintext", async () => {
    const svc = serviceClient();
    const plain = "strava_access_abc123";
    const enc = await svc.rpc("encrypt_token", { plain });
    expect(enc.error).toBeNull();
    expect(typeof enc.data).toBe("string");
    expect(enc.data).not.toBe(plain); // ciphertext != plaintext
    const dec = await svc.rpc("decrypt_token", { cipher: enc.data });
    expect(dec.error).toBeNull();
    expect(dec.data).toBe(plain);
  });

  it("an authenticated (non-service) user cannot call decrypt_token", async () => {
    const a = await userClient(`crypto-${Date.now()}@t.dev`);
    try {
      const svc = serviceClient();
      const enc = await svc.rpc("encrypt_token", { plain: "secret" });
      const res = await a.client.rpc("decrypt_token", { cipher: enc.data });
      // RLS/grants: the call must be denied (error) OR return null — it must NOT return the plaintext.
      expect(res.error !== null || res.data == null).toBe(true);
      expect(res.data).not.toBe("secret");
    } finally {
      await cleanupUser(a.userId);
    }
  });
});
