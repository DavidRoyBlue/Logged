import { render, screen, fireEvent } from "@testing-library/react-native";
import { ConnectionCard } from "./ConnectionCard";
import type { ConnectionRow } from "../lib/types";

const MOCK_CONNECT = jest.fn();

beforeEach(() => {
  MOCK_CONNECT.mockClear();
});

describe("ConnectionCard", () => {
  it("shows 'Connected' CTA when status is active", () => {
    const connection: ConnectionRow = {
      id: "c1",
      provider: "strava",
      status: "active",
      config: {},
    };
    render(
      <ConnectionCard
        connection={connection}
        provider="strava"
        onConnect={MOCK_CONNECT}
      />
    );
    expect(screen.getByText("Connected")).toBeOnTheScreen();
  });

  it("shows 'Finish setup' CTA when status is pending_config", () => {
    const connection: ConnectionRow = {
      id: "c2",
      provider: "google_calendar",
      status: "pending_config",
      config: {},
    };
    render(
      <ConnectionCard
        connection={connection}
        provider="google_calendar"
        onConnect={MOCK_CONNECT}
      />
    );
    expect(screen.getByText("Finish setup")).toBeOnTheScreen();
  });

  it("shows 'Reconnect' CTA when status is expired", () => {
    const connection: ConnectionRow = {
      id: "c3",
      provider: "strava",
      status: "expired",
      config: {},
    };
    render(
      <ConnectionCard
        connection={connection}
        provider="strava"
        onConnect={MOCK_CONNECT}
      />
    );
    expect(screen.getByText("Reconnect")).toBeOnTheScreen();
  });

  it("shows 'Connect' CTA when connection is null", () => {
    render(
      <ConnectionCard
        connection={null}
        provider="notion"
        onConnect={MOCK_CONNECT}
      />
    );
    expect(screen.getByText("Connect")).toBeOnTheScreen();
  });

  it("shows 'Connect' CTA when connection is undefined", () => {
    render(
      <ConnectionCard
        connection={undefined}
        provider="notion"
        onConnect={MOCK_CONNECT}
      />
    );
    expect(screen.getByText("Connect")).toBeOnTheScreen();
  });

  it("calls onConnect when CTA button is pressed", () => {
    render(
      <ConnectionCard
        connection={null}
        provider="strava"
        onConnect={MOCK_CONNECT}
      />
    );
    fireEvent.press(screen.getByText("Connect"));
    expect(MOCK_CONNECT).toHaveBeenCalledTimes(1);
  });

  it("shows the provider name", () => {
    render(
      <ConnectionCard
        connection={null}
        provider="strava"
        onConnect={MOCK_CONNECT}
      />
    );
    expect(screen.getByText("strava")).toBeOnTheScreen();
  });

  it("shows 'Reconnect' for revoked status", () => {
    const connection: ConnectionRow = {
      id: "c4",
      provider: "notion",
      status: "revoked",
      config: {},
    };
    render(
      <ConnectionCard
        connection={connection}
        provider="notion"
        onConnect={MOCK_CONNECT}
      />
    );
    expect(screen.getByText("Reconnect")).toBeOnTheScreen();
  });
});
