import { render, screen } from "@testing-library/react-native";
import { ActivityListItem } from "./ActivityListItem";
import type { ActivityRow } from "../lib/types";

const BASE_ACTIVITY: ActivityRow = {
  id: "a1",
  strava_activity_id: 1001,
  name: "Morning Run",
  type: "Run",
  start_time: "2024-06-05T08:00:00.000Z",
  distance_m: 5000,
  moving_time_s: 1500,
  avg_pace_s_per_km: 300, // 5:00/km
  avg_hr: 145,
  elevation_gain_m: 50,
  workout_type: 0,
};

describe("ActivityListItem", () => {
  it("shows activity name when present", () => {
    render(<ActivityListItem activity={BASE_ACTIVITY} />);
    expect(screen.getByText("Morning Run")).toBeOnTheScreen();
  });

  it("shows type + km fallback when name is null", () => {
    render(
      <ActivityListItem activity={{ ...BASE_ACTIVITY, name: null, distance_m: 10200 }} />
    );
    expect(screen.getByText("Run 10.2k")).toBeOnTheScreen();
  });

  it("shows distance in km with 1 decimal", () => {
    render(<ActivityListItem activity={BASE_ACTIVITY} />);
    expect(screen.getByText("5.0 km")).toBeOnTheScreen();
  });

  it("shows pace as m:ss/km", () => {
    render(<ActivityListItem activity={BASE_ACTIVITY} />);
    // 300 s/km = 5:00/km
    expect(screen.getByText("5:00/km")).toBeOnTheScreen();
  });

  it("shows pace with correct seconds padding", () => {
    // 313 s/km = 5:13/km
    render(<ActivityListItem activity={{ ...BASE_ACTIVITY, avg_pace_s_per_km: 313 }} />);
    expect(screen.getByText("5:13/km")).toBeOnTheScreen();
  });

  it("does NOT show pace when avg_pace_s_per_km is null", () => {
    render(<ActivityListItem activity={{ ...BASE_ACTIVITY, avg_pace_s_per_km: null }} />);
    expect(screen.queryByText(/\/km/)).toBeNull();
  });

  it("does NOT show ✅ when matched is false", () => {
    render(<ActivityListItem activity={BASE_ACTIVITY} matched={false} />);
    expect(screen.queryByText("✅")).toBeNull();
  });

  it("does NOT show ✅ when matched is undefined", () => {
    render(<ActivityListItem activity={BASE_ACTIVITY} />);
    expect(screen.queryByText("✅")).toBeNull();
  });

  it("shows ✅ when matched is true", () => {
    render(<ActivityListItem activity={BASE_ACTIVITY} matched={true} />);
    expect(screen.getByText("✅")).toBeOnTheScreen();
  });

  it("does NOT show RACE badge when workout_type is 0", () => {
    render(<ActivityListItem activity={{ ...BASE_ACTIVITY, workout_type: 0 }} />);
    expect(screen.queryByText("RACE")).toBeNull();
  });

  it("does NOT show RACE badge when workout_type is null", () => {
    render(<ActivityListItem activity={{ ...BASE_ACTIVITY, workout_type: null }} />);
    expect(screen.queryByText("RACE")).toBeNull();
  });

  it("shows RACE badge when workout_type is 1", () => {
    render(<ActivityListItem activity={{ ...BASE_ACTIVITY, workout_type: 1 }} />);
    expect(screen.getByText("RACE")).toBeOnTheScreen();
  });

  it("shows date", () => {
    render(<ActivityListItem activity={BASE_ACTIVITY} />);
    // Should show the date portion of start_time
    expect(screen.getByText("2024-06-05")).toBeOnTheScreen();
  });
});
