/**
 * Smoke test for the Settings screen.
 * Mocks the data and auth layers so no real I/O happens.
 */

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("../../lib/data", () => ({
  useConnections: jest.fn(),
}));

jest.mock("../../lib/auth", () => ({
  signInWithStrava: jest.fn(),
  connect: jest.fn(),
  useSession: jest.fn(),
}));

jest.mock("expo-web-browser", () => ({
  openAuthSessionAsync: jest.fn(() => Promise.resolve({ type: "dismiss" })),
}));

jest.mock("../../lib/supabase", () => ({
  supabase: {
    from: jest.fn(),
  },
  functionsBaseUrl: jest.fn(() => "https://example.supabase.co/functions/v1"),
}));

import React from "react";
import { render, screen } from "@testing-library/react-native";
import { useConnections } from "../../lib/data";
import { useSession } from "../../lib/auth";
import SettingsScreen from "../(tabs)/settings";

const mockUseConnections = useConnections as jest.MockedFunction<typeof useConnections>;
const mockUseSession = useSession as jest.MockedFunction<typeof useSession>;

beforeEach(() => {
  mockUseConnections.mockReturnValue({
    data: [],
    loading: false,
  });

  mockUseSession.mockReturnValue({
    session: null,
    loading: false,
  });
});

test("Settings screen shows Connect CTA for strava when no connection", () => {
  render(<SettingsScreen />);
  // Should show at least one "Connect" button since no connections are present
  const connectButtons = screen.getAllByText("Connect");
  expect(connectButtons.length).toBeGreaterThan(0);
});

test("Settings screen shows Connected when strava is active", () => {
  mockUseConnections.mockReturnValue({
    data: [
      {
        id: "c1",
        provider: "strava",
        status: "active",
        config: {},
      },
    ],
    loading: false,
  });

  render(<SettingsScreen />);
  expect(screen.getByText("Connected")).toBeOnTheScreen();
});
