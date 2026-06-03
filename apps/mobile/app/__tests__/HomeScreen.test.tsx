/**
 * Smoke test for the Home screen.
 * Mocks the data layer so no real Supabase calls are made.
 */

// Mock expo-router before any imports
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock the data layer
jest.mock("../../lib/data", () => ({
  useWeekSummary: jest.fn(),
  useActivities: jest.fn(),
  useRealtimeActivities: jest.fn(),
}));

// Mock supabase to avoid initialization errors
jest.mock("../../lib/supabase", () => ({
  supabase: {
    from: jest.fn(),
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn(),
    })),
    removeChannel: jest.fn(),
  },
}));

import React from "react";
import { render, screen } from "@testing-library/react-native";
import { useWeekSummary, useActivities, useRealtimeActivities } from "../../lib/data";
import HomeScreen from "../(tabs)/index";

const mockUseWeekSummary = useWeekSummary as jest.MockedFunction<typeof useWeekSummary>;
const mockUseActivities = useActivities as jest.MockedFunction<typeof useActivities>;
const mockUseRealtimeActivities = useRealtimeActivities as jest.MockedFunction<typeof useRealtimeActivities>;

beforeEach(() => {
  mockUseWeekSummary.mockReturnValue({
    summary: {
      distanceM: 32000,
      movingTimeS: 9600,
      count: 4,
      deltaDistancePct: 15.0,
    },
    loading: false,
  });

  mockUseActivities.mockReturnValue({
    data: [
      {
        id: "a1",
        strava_activity_id: 1001,
        name: "Sunday Long Run",
        type: "Run",
        start_time: "2024-06-05T08:00:00.000Z",
        distance_m: 15000,
        moving_time_s: 4500,
        avg_pace_s_per_km: 300,
        avg_hr: 142,
        elevation_gain_m: 100,
        workout_type: 0,
      },
    ],
    loading: false,
    reload: jest.fn(),
  });

  mockUseRealtimeActivities.mockImplementation(() => {
    // no-op; just don't throw
  });
});

test("Home screen shows week distance", () => {
  render(<HomeScreen />);
  expect(screen.getByText("32.0 km")).toBeOnTheScreen();
});

test("Home screen shows an activity name", () => {
  render(<HomeScreen />);
  expect(screen.getByText("Sunday Long Run")).toBeOnTheScreen();
});
