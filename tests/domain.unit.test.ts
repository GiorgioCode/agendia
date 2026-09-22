import { describe, it, expect } from "vitest";
import {
  todayIn,
  localNow,
  isFuture,
  monthCells,
  shiftMonth,
} from "../src/lib/dates";
import { safeReturn, tenantSlugFromLocation } from "../src/lib/tenantResolver";
import { errorMessage } from "../src/lib/errors";
describe("Tenant resolution", () => {
  it("verified hostname takes precedence even for a deep route", () =>
    expect(
      tenantSlugFromLocation(
        "custom.example.com",
        "/t/other",
        "example.com",
        "verified-clinic",
      ),
    ).toBe("verified-clinic"));
  it("prioritizes configured tenant subdomain over path", () =>
    expect(
      tenantSlugFromLocation(
        "clinic-a.example.com",
        "/t/clinic-b",
        "example.com",
      ),
    ).toBe("clinic-a"));
  it("app host uses route and never guesses unknown domains", () => {
    expect(
      tenantSlugFromLocation("app.example.com", "/t/clinic-b", "example.com"),
    ).toBe("clinic-b");
    expect(
      tenantSlugFromLocation("evil-example.com", "/", "example.com"),
    ).toBeNull();
  });
  it("does not treat malformed or nested subdomains as tenants", () => {
    expect(
      tenantSlugFromLocation("a.b.example.com", "/", "example.com"),
    ).toBeNull();
    expect(
      tenantSlugFromLocation("localhost", "/t/clinic-a/professionals", ""),
    ).toBe("clinic-a");
  });
  it("keeps internal reservation return paths and rejects open redirects", () => {
    expect(safeReturn("/t/demo/book/123?date=2026-10-01")).toBe(
      "/t/demo/book/123?date=2026-10-01",
    );
    for (const value of [
      "https://evil.test",
      "//evil.test",
      "/\\evil.test",
      null,
    ])
      expect(safeReturn(value)).toBe("/account");
  });
});
describe("Tenant-local dates", () => {
  it("uses tenant timezone across UTC midnight", () => {
    const now = new Date("2026-10-01T01:00:00Z");
    expect(todayIn("America/Argentina/Buenos_Aires", now)).toBe("2026-09-30");
    expect(localNow("America/Argentina/Buenos_Aires", now)).toBe(
      "2026-09-30T22:00:00",
    );
  });
  it("builds leap-year calendars starting on Monday", () => {
    const days = monthCells("2028-02-01");
    expect(days[0]).toBeNull();
    expect(days[1]).toBe("2028-02-01");
    expect(days.at(-1)).toBe("2028-02-29");
  });
  it("moves across year boundaries", () => {
    expect(shiftMonth("2026-12-01", 1)).toBe("2027-01-01");
    expect(shiftMonth("2026-01-01", -1)).toBe("2025-12-01");
  });
  it("correctly separates past and future appointment dates", () => {
    expect(
      isFuture("2099-01-01", "08:00:00", "America/Argentina/Buenos_Aires"),
    ).toBe(true);
    expect(
      isFuture("2000-01-01", "08:00:00", "America/Argentina/Buenos_Aires"),
    ).toBe(false);
  });
});
describe("Domain errors", () => {
  it("explains slot conflicts without SQL details", () =>
    expect(errorMessage({ message: "SLOT_UNAVAILABLE" })).toContain(
      "ya no está disponible",
    ));
  it("hides unrecognized SQL internals", () =>
    expect(
      errorMessage({
        message: "permission denied for table private.patient_notes",
      }),
    ).not.toContain("private.patient_notes"));
  it("explains Mercado Pago checkout configuration errors", () =>
    expect(errorMessage({ message: "MP_ACCESS_TOKEN_REQUIRED" })).toContain(
      "MP_ACCESS_TOKEN",
    ));
});
