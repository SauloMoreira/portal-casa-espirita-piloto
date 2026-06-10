import { describe, it, expect } from "vitest";
import { formatEntrevistaTime } from "./agenda";

describe("formatEntrevistaTime", () => {
  it("returns null when time is midnight (no explicit time)", () => {
    expect(formatEntrevistaTime("2026-06-10T00:00:00Z")).toBeNull();
  });
  it("formats the UTC time portion", () => {
    expect(formatEntrevistaTime("2026-06-10T14:30:00Z")).toBe("14:30");
    expect(formatEntrevistaTime("2026-06-10T09:05:00Z")).toBe("09:05");
  });
});
