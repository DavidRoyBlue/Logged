export interface ProviderConfig {
  name: "strava" | "google_calendar" | "notion";
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  usesPkce: boolean;
  extraAuthorizeParams?: Record<string, string>;
}

export const PROVIDERS: Record<string, ProviderConfig> = {
  strava: {
    name: "strava",
    authorizeUrl: "https://www.strava.com/oauth/authorize",
    tokenUrl: "https://www.strava.com/oauth/token",
    scope: "read,activity:read_all",
    usesPkce: false,
  },
  google_calendar: {
    name: "google_calendar",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/calendar.events",
    usesPkce: true,
    extraAuthorizeParams: { access_type: "offline", prompt: "consent" },
  },
  notion: {
    name: "notion",
    authorizeUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    scope: "",
    usesPkce: true,
    extraAuthorizeParams: { owner: "user" },
  },
};
