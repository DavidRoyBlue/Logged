import { render, screen } from "@testing-library/react-native";
import { ComingSoon } from "./ComingSoon";

test("renders the feature name and a coming-soon label", () => {
  render(<ComingSoon feature="Training load" />);
  expect(screen.getByText("Training load")).toBeOnTheScreen();
  expect(screen.getByText("Coming soon")).toBeOnTheScreen();
});
