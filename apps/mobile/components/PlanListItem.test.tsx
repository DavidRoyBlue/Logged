import { render, screen } from "@testing-library/react-native";
import { PlanListItem } from "./PlanListItem";
import type { PlanWithSync } from "../lib/types";

const BASE_PLAN: PlanWithSync = {
  id: "p1",
  type: "easy",
  planned_date: "2024-06-10",
  title: "Easy 5k",
  target_distance_m: 5000,
  status: "pending",
  matched_activity_id: null,
  calendar_event_id: "gcal-xyz",
  notion_page_id: null,
  calendarSynced: true,
  notionSynced: false,
};

describe("PlanListItem", () => {
  it("shows plan title", () => {
    render(<PlanListItem plan={BASE_PLAN} />);
    expect(screen.getByText("Easy 5k")).toBeOnTheScreen();
  });

  it("shows planned date", () => {
    render(<PlanListItem plan={BASE_PLAN} />);
    expect(screen.getByText("2024-06-10")).toBeOnTheScreen();
  });

  it("shows status", () => {
    render(<PlanListItem plan={BASE_PLAN} />);
    expect(screen.getByText("pending")).toBeOnTheScreen();
  });

  it("shows Cal badge when calendarSynced", () => {
    render(<PlanListItem plan={BASE_PLAN} />);
    expect(screen.getByText("Cal")).toBeOnTheScreen();
  });

  it("does NOT show Cal badge when not calendarSynced", () => {
    render(<PlanListItem plan={{ ...BASE_PLAN, calendarSynced: false }} />);
    expect(screen.queryByText("Cal")).toBeNull();
  });

  it("shows Notion badge when notionSynced", () => {
    render(<PlanListItem plan={{ ...BASE_PLAN, notionSynced: true }} />);
    expect(screen.getByText("Notion")).toBeOnTheScreen();
  });

  it("does NOT show Notion badge when not notionSynced", () => {
    render(<PlanListItem plan={BASE_PLAN} />);
    expect(screen.queryByText("Notion")).toBeNull();
  });

  it("shows both badges when both synced", () => {
    render(
      <PlanListItem plan={{ ...BASE_PLAN, calendarSynced: true, notionSynced: true }} />
    );
    expect(screen.getByText("Cal")).toBeOnTheScreen();
    expect(screen.getByText("Notion")).toBeOnTheScreen();
  });

  it("shows neither badge when neither synced", () => {
    render(
      <PlanListItem plan={{ ...BASE_PLAN, calendarSynced: false, notionSynced: false }} />
    );
    expect(screen.queryByText("Cal")).toBeNull();
    expect(screen.queryByText("Notion")).toBeNull();
  });

  it("shows completed status", () => {
    render(<PlanListItem plan={{ ...BASE_PLAN, status: "completed" }} />);
    expect(screen.getByText("completed")).toBeOnTheScreen();
  });

  it("shows missed status", () => {
    render(<PlanListItem plan={{ ...BASE_PLAN, status: "missed" }} />);
    expect(screen.getByText("missed")).toBeOnTheScreen();
  });
});
