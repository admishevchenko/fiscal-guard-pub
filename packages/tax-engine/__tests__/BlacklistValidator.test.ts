import { describe, it, expect } from "vitest";
import { BlacklistValidator } from "../src/validators/BlacklistValidator.js";

const v = new BlacklistValidator();

describe("BlacklistValidator", () => {
  // Scenario 6: HK income on 2026-03-11 — NOT blacklisted (Ordinance 292/2025)
  it("Scenario 6 — HK is NOT blacklisted on 2026-03-11 (Ordinance 292/2025)", () => {
    expect(v.isActivelyBlacklisted("HK", new Date("2026-03-11"))).toBe(false);
  });

  // Scenario 7: UY income on 2026-03-11 — NOT blacklisted
  it("Scenario 7 — UY is NOT blacklisted on 2026-03-11 (Ordinance 292/2025)", () => {
    expect(v.isActivelyBlacklisted("UY", new Date("2026-03-11"))).toBe(false);
  });

  // Scenario 8: LI income on 2026-03-11 — NOT blacklisted
  it("Scenario 8 — LI is NOT blacklisted on 2026-03-11 (Ordinance 292/2025)", () => {
    expect(v.isActivelyBlacklisted("LI", new Date("2026-03-11"))).toBe(false);
  });

  // Scenario 9: HK income on 2025-12-31 — IS blacklisted (before removal)
  it("Scenario 9 — HK IS blacklisted on 2025-12-31 (before Ordinance 292/2025 removal)", () => {
    expect(v.isActivelyBlacklisted("HK", new Date("2025-12-31"))).toBe(true);
  });

  it("Boundary — HK is NOT blacklisted on exactly 2026-01-01 (removal effective date)", () => {
    expect(v.isActivelyBlacklisted("HK", new Date("2026-01-01"))).toBe(false);
  });

  it("Active blacklist — Bahamas (BS) is still blacklisted in 2026", () => {
    expect(v.isActivelyBlacklisted("BS", new Date("2026-03-11"))).toBe(true);
  });

  it("Active blacklist — Cayman Islands (KY) is still blacklisted in 2026", () => {
    expect(v.isActivelyBlacklisted("KY", new Date("2026-03-11"))).toBe(true);
  });

  it("Unknown country code — returns false (not on the list)", () => {
    expect(v.isActivelyBlacklisted("XX", new Date("2026-03-11"))).toBe(false);
  });

  it("Case-insensitive — 'hk' and 'HK' behave identically", () => {
    expect(v.isActivelyBlacklisted("hk", new Date("2026-03-11"))).toBe(false);
    expect(v.isActivelyBlacklisted("hk", new Date("2025-12-31"))).toBe(true);
  });
});
