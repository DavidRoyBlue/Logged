// ---------------------------------------------------------------------------
// Strava token shape
// ---------------------------------------------------------------------------
export interface StravaTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
}

// ---------------------------------------------------------------------------
// StravaClient interface
// ---------------------------------------------------------------------------
export interface StravaClient {
  getActivity(id: number, accessToken: string): Promise<Record<string, unknown>>;
  listActivities(
    opts: { afterEpoch?: number; page: number; perPage: number },
    accessToken: string
  ): Promise<Record<string, unknown>[]>;
  refreshToken(refreshToken: string): Promise<StravaTokens>;
}

// ---------------------------------------------------------------------------
// FakeStravaClient (test helper)
// ---------------------------------------------------------------------------
export interface FakeStravaClientOptions {
  /** Canned activities keyed by Strava activity id. */
  activities: Record<number, Record<string, unknown>>;
  /** Pages returned by listActivities (each call pops the head or returns []). */
  pages: Record<string, unknown>[][];
  /** Token returned by refreshToken. */
  refreshedTokens: StravaTokens;
}

export class FakeStravaClient implements StravaClient {
  private readonly _activities: Record<number, Record<string, unknown>>;
  private readonly _pages: Record<string, unknown>[][];
  private readonly _refreshedTokens: StravaTokens;

  refreshCalled = false;
  /** afterEpoch value from the most recent listActivities call (undefined if not provided). */
  lastAfterEpoch: number | undefined = undefined;

  constructor(opts: FakeStravaClientOptions) {
    this._activities = opts.activities;
    this._pages = opts.pages.slice();
    this._refreshedTokens = opts.refreshedTokens;
  }

  async getActivity(id: number, _accessToken: string): Promise<Record<string, unknown>> {
    const act = this._activities[id];
    if (act === undefined) {
      throw new Error(`FakeStravaClient: no canned activity for id ${id}`);
    }
    return act;
  }

  async listActivities(
    opts: { afterEpoch?: number; page: number; perPage: number },
    _accessToken: string
  ): Promise<Record<string, unknown>[]> {
    this.lastAfterEpoch = opts.afterEpoch;
    return this._pages.shift() ?? [];
  }

  async refreshToken(_refreshToken: string): Promise<StravaTokens> {
    this.refreshCalled = true;
    return this._refreshedTokens;
  }
}

// ---------------------------------------------------------------------------
// HttpStravaClient (production; NOT exercised in tests)
// ---------------------------------------------------------------------------
const STRAVA_BASE = "https://www.strava.com/api/v3";
const TOKEN_URL = "https://www.strava.com/oauth/token";

export class HttpStravaClient implements StravaClient {
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(opts: { clientId: string; clientSecret: string }) {
    this.clientId = opts.clientId;
    this.clientSecret = opts.clientSecret;
  }

  async getActivity(id: number, accessToken: string): Promise<Record<string, unknown>> {
    const res = await fetch(`${STRAVA_BASE}/activities/${id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Strava getActivity ${id} failed: ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as Record<string, unknown>;
  }

  async listActivities(
    opts: { afterEpoch?: number; page: number; perPage: number },
    accessToken: string
  ): Promise<Record<string, unknown>[]> {
    const params = new URLSearchParams({
      page: String(opts.page),
      per_page: String(opts.perPage),
    });
    if (opts.afterEpoch !== undefined) {
      params.set("after", String(opts.afterEpoch));
    }
    const res = await fetch(`${STRAVA_BASE}/athlete/activities?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Strava listActivities failed: ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as Record<string, unknown>[];
  }

  async refreshToken(refreshToken: string): Promise<StravaTokens> {
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    const res = await fetch(TOKEN_URL, { method: "POST", body });
    if (!res.ok) {
      throw new Error(`Strava refreshToken failed: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_at: number;
    };
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(data.expires_at * 1000).toISOString(),
    };
  }
}
