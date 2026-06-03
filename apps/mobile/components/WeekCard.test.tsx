import { render, screen } from "@testing-library/react-native";
import { WeekCard } from "./WeekCard";
import type { WeekSummary } from "../lib/types";

const BASE: WeekSummary = {
  distanceM: 21100,    // 21.1 km
  movingTimeS: 6780,   // 1h 53m → "1:53"
  count: 3,
  deltaDistancePct: 12.5,
};

describe("WeekCard", () => {
  it("shows distance in km with 1 decimal", () => {
    render(<WeekCard summary={BASE} />);
    expect(screen.getByText("21.1 km")).toBeOnTheScreen();
  });

  it("shows duration as h:mm", () => {
    render(<WeekCard summary={BASE} />);
    expect(screen.getByText("1:53")).toBeOnTheScreen();
  });

  it("shows activity count", () => {
    render(<WeekCard summary={BASE} />);
    expect(screen.getByText("3")).toBeOnTheScreen();
  });

  it("shows positive delta with + sign", () => {
    render(<WeekCard summary={BASE} />);
    expect(screen.getByText("+12.5%")).toBeOnTheScreen();
  });

  it("shows negative delta with - sign", () => {
    render(<WeekCard summary={{ ...BASE, deltaDistancePct: -8.3 }} />);
    expect(screen.getByText("-8.3%")).toBeOnTheScreen();
  });

  it("shows — when delta is null", () => {
    render(<WeekCard summary={{ ...BASE, deltaDistancePct: null }} />);
    expect(screen.getByText("—")).toBeOnTheScreen();
  });

  it("handles sub-1-hour duration (shows 0:mm)", () => {
    render(<WeekCard summary={{ ...BASE, movingTimeS: 1800 }} />); // 30 min
    expect(screen.getByText("0:30")).toBeOnTheScreen();
  });

  it("pads minutes to 2 digits", () => {
    render(<WeekCard summary={{ ...BASE, movingTimeS: 3660 }} />); // 1h 1m
    expect(screen.getByText("1:01")).toBeOnTheScreen();
  });
});
