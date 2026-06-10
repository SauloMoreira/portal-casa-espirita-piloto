import { describe, it, expect } from "vitest";
import { calcAge, getAgeGroup, buildAgeDistribution } from "./ageGroups";

const REF = new Date("2026-06-10T00:00:00");

describe("calcAge", () => {
  it("returns null for missing birthdate", () => {
    expect(calcAge(null, REF)).toBeNull();
  });
  it("computes age relative to a reference date", () => {
    expect(calcAge("2000-01-01", REF)).toBe(26);
  });
  it("does not count a birthday that has not occurred yet", () => {
    expect(calcAge("2000-12-31", REF)).toBe(25);
  });
});

describe("getAgeGroup", () => {
  it("classifies into the standard buckets", () => {
    expect(getAgeGroup(10)).toBe("Até 17");
    expect(getAgeGroup(20)).toBe("18–24");
    expect(getAgeGroup(70)).toBe("60+");
    expect(getAgeGroup(null)).toBe("Não informado");
  });
});

describe("buildAgeDistribution", () => {
  it("aggregates counts and drops empty buckets", () => {
    const dist = buildAgeDistribution([
      { data_nascimento: "2000-01-01" },
      { data_nascimento: "2000-06-01" },
      { data_nascimento: null },
    ]);
    const map = Object.fromEntries(dist.map((d) => [d.name, d.value]));
    expect(map["25–34"]).toBe(2);
    expect(map["Não informado"]).toBe(1);
    expect(dist.every((d) => d.value > 0)).toBe(true);
  });
});
