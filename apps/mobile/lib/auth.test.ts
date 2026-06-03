/**
 * Auth lib tests — all logic is exercised via dependency injection so
 * no real browser / network / Supabase is needed.
 */

// Mock the supabase module so imports in auth.ts don't blow up at test time.
jest.mock("./supabase", () => ({
  supabase: {
    auth: {
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
      getSession: jest.fn(() =>
        Promise.resolve({ data: { session: null }, error: null })
      ),
    },
  },
  functionsBaseUrl: jest.fn(() => "https://example.supabase.co/functions/v1"),
}));

import { parseCodeFromCallback, signInWithStrava, connect, AuthDeps } from "./auth";

// ---------------------------------------------------------------------------
// parseCodeFromCallback
// ---------------------------------------------------------------------------
describe("parseCodeFromCallback", () => {
  it("extracts the code from a valid callback URL", () => {
    expect(parseCodeFromCallback("logged://oauth/callback?code=abc")).toBe("abc");
  });

  it("returns null when there is no code param", () => {
    expect(parseCodeFromCallback("logged://oauth/callback")).toBeNull();
  });

  it("returns null for an empty code param", () => {
    expect(parseCodeFromCallback("logged://oauth/callback?code=")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Helpers to build fake AuthDeps
// ---------------------------------------------------------------------------
function makeDeps(overrides: Partial<AuthDeps> = {}): AuthDeps & {
  setSessionMock: jest.Mock;
  openAuthSessionMock: jest.Mock;
  fetchMock: jest.Mock;
} {
  const setSessionMock = jest.fn().mockResolvedValue(undefined);
  const openAuthSessionMock = jest.fn();
  const fetchMock = jest.fn();

  const deps: AuthDeps = {
    openAuthSession: openAuthSessionMock,
    fetchImpl: fetchMock,
    setSession: setSessionMock,
    functionsBaseUrl: "https://fn.example.co/functions/v1",
    redirectScheme: "logged://oauth/callback",
    ...overrides,
  };

  return { ...deps, setSessionMock, openAuthSessionMock, fetchMock };
}

// ---------------------------------------------------------------------------
// signInWithStrava
// ---------------------------------------------------------------------------
describe("signInWithStrava", () => {
  it("happy path: opens auth session, exchanges code, stores session", async () => {
    const { setSessionMock, openAuthSessionMock, fetchMock, ...deps } = makeDeps();

    openAuthSessionMock.mockResolvedValue({
      type: "success",
      url: "logged://oauth/callback?code=XYZ",
    });

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ access_token: "AT", refresh_token: "RT" }),
    });

    const result = await signInWithStrava(deps);

    // Browser was opened to the Strava OAuth EF
    expect(openAuthSessionMock).toHaveBeenCalledTimes(1);
    const browserUrl: string = openAuthSessionMock.mock.calls[0][0];
    expect(browserUrl).toContain("/oauth-strava");

    // setSession called with the tokens
    expect(setSessionMock).toHaveBeenCalledWith({
      access_token: "AT",
      refresh_token: "RT",
    });

    expect(result).toEqual({ ok: true });
  });

  it("cancel: openAuthSession resolves {type:'cancel'} → {ok:false}, setSession NOT called", async () => {
    const { setSessionMock, openAuthSessionMock, ...deps } = makeDeps();

    openAuthSessionMock.mockResolvedValue({ type: "cancel" });

    const result = await signInWithStrava(deps);

    expect(result).toEqual({ ok: false, reason: "cancelled" });
    expect(setSessionMock).not.toHaveBeenCalled();
  });

  it("exchange failure: fetch returns 401 → {ok:false}, setSession NOT called", async () => {
    const { setSessionMock, openAuthSessionMock, fetchMock, ...deps } = makeDeps();

    openAuthSessionMock.mockResolvedValue({
      type: "success",
      url: "logged://oauth/callback?code=XYZ",
    });

    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: "unauthorized" }),
    });

    const result = await signInWithStrava(deps);

    expect(result.ok).toBe(false);
    expect(setSessionMock).not.toHaveBeenCalled();
  });

  it("no code in callback URL → {ok:false}, setSession NOT called", async () => {
    const { setSessionMock, openAuthSessionMock, ...deps } = makeDeps();

    openAuthSessionMock.mockResolvedValue({
      type: "success",
      url: "logged://oauth/callback",
    });

    const result = await signInWithStrava(deps);

    expect(result.ok).toBe(false);
    expect(setSessionMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// connect
// ---------------------------------------------------------------------------
describe("connect", () => {
  it("notion: opens URL containing /oauth-notion and token=JWT, returns {ok:true} on success", async () => {
    const { openAuthSessionMock, ...deps } = makeDeps();

    openAuthSessionMock.mockResolvedValue({ type: "success" });

    const result = await connect("notion", "JWT", deps);

    expect(openAuthSessionMock).toHaveBeenCalledTimes(1);
    const browserUrl: string = openAuthSessionMock.mock.calls[0][0];
    expect(browserUrl).toContain("/oauth-notion");
    expect(browserUrl).toContain("token=JWT");

    expect(result).toEqual({ ok: true });
  });

  it("google_calendar: opens URL containing /oauth-google-calendar", async () => {
    const { openAuthSessionMock, ...deps } = makeDeps();

    openAuthSessionMock.mockResolvedValue({ type: "success" });

    await connect("google_calendar", "TOKEN", deps);

    const browserUrl: string = openAuthSessionMock.mock.calls[0][0];
    expect(browserUrl).toContain("/oauth-google-calendar");
  });

  it("returns {ok:false} on cancel", async () => {
    const { openAuthSessionMock, ...deps } = makeDeps();

    openAuthSessionMock.mockResolvedValue({ type: "cancel" });

    const result = await connect("notion", "JWT", deps);

    expect(result).toEqual({ ok: false });
  });
});
