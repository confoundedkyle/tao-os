import { describe, expect, it } from "vitest";
import {
  meteredConnectors,
  effectiveConnectorCap,
  effectiveConnectorCaps,
} from "@/lib/connectors";

describe("meteredConnectors", () => {
  it("keeps only metered connectors among the connected providers, in catalog order", () => {
    const got = meteredConnectors(["github", "firecrawl", "coresignal"]).map(
      (c) => c.provider,
    );
    // github is free → excluded; Coresignal precedes Firecrawl in the catalog.
    expect(got).toEqual(["coresignal", "firecrawl"]);
  });

  it("returns nothing when no connected provider is metered", () => {
    expect(meteredConnectors(["github", "slack"])).toEqual([]);
  });
});

describe("effectiveConnectorCap", () => {
  it("uses the stored budget when set", () => {
    expect(effectiveConnectorCap("coresignal", { coresignal: 10 })).toBe(10);
  });
  it("falls back to the connector default when unset", () => {
    expect(effectiveConnectorCap("coresignal", {})).toBe(40);
  });
  it("returns null for a non-metered provider", () => {
    expect(effectiveConnectorCap("github", {})).toBeNull();
  });
});

describe("effectiveConnectorCaps", () => {
  it("computes cap + remaining (stored or default) minus prior spend", () => {
    const caps = effectiveConnectorCaps(
      { coresignal: 30 },
      { coresignal: 12, firecrawl: 5 },
    );
    expect(caps.coresignal).toEqual({ cap: 30, remaining: 18 });
    expect(caps.firecrawl).toEqual({ cap: 100, remaining: 95 }); // default cap
    expect(caps.github).toBeUndefined(); // not metered
  });

  it("never goes negative when spend exceeds the cap", () => {
    const caps = effectiveConnectorCaps({ coresignal: 10 }, { coresignal: 40 });
    expect(caps.coresignal).toEqual({ cap: 10, remaining: 0 });
  });
});
