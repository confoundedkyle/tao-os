import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSignalHireTierSearches,
  signalhireAdapter,
  type SignalHireLadderSpec,
  type SignalHireLadderTier,
  type SignalHireSourceArgs,
} from "@/lib/integrations/signalhire";
import { parseSignalHireLadderSpec } from "@/lib/sourcing/signalhire-ladder";
import { jsonResponse } from "../../helpers/http";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const args: SignalHireSourceArgs = {
  currentTitles: ["Tech Lead", "Lead Engineer"],
  adjacentTitles: ["Staff Engineer"],
  skills: ["React", "Node"],
  companies: ["Acme", "Globex"],
  location: "London",
};

describe("buildSignalHireTierSearches", () => {
  it("fans a title list into one search per title, folding in skills + location", () => {
    const tier: SignalHireLadderTier = {
      name: "exact",
      weight: 5,
      titlesFrom: "currentTitles",
      keywordsFrom: ["skills"],
      keywordsJoin: "AND",
      useLocation: true,
    };
    const searches = buildSignalHireTierSearches(tier, args);
    expect(searches).toEqual([
      { title: "Tech Lead", company: undefined, keywords: "React AND Node", location: "London" },
      { title: "Lead Engineer", company: undefined, keywords: "React AND Node", location: "London" },
    ]);
  });

  it("cartesians titles × companies", () => {
    const tier: SignalHireLadderTier = {
      name: "at companies",
      weight: 4,
      titlesFrom: "currentTitles",
      companiesFrom: "companies",
    };
    const searches = buildSignalHireTierSearches(tier, args);
    expect(searches).toHaveLength(4); // 2 titles × 2 companies
    expect(searches[0]).toMatchObject({ title: "Tech Lead", company: "Acme" });
  });

  it("returns [] for a tier whose declared fan-out field is empty", () => {
    const tier: SignalHireLadderTier = {
      name: "adjacent",
      weight: 3,
      titlesFrom: "adjacentTitles",
    };
    expect(buildSignalHireTierSearches({ ...tier, titlesFrom: "companies" }, {
      currentTitles: ["x"],
    })).toEqual([]);
  });

  it("skips searches that would have no constraint at all", () => {
    const tier: SignalHireLadderTier = { name: "empty", weight: 1, useLocation: true };
    // location-only → no meaningful search
    expect(buildSignalHireTierSearches(tier, { currentTitles: ["x"], location: "London" })).toEqual([]);
  });
});

describe("sourcePeople ladder", () => {
  const spec: SignalHireLadderSpec = {
    defaults: { targetCount: 25, maxSearches: 12 },
    tiers: [
      { name: "exact", weight: 5, titlesFrom: "currentTitles", useLocation: true },
      { name: "adjacent", weight: 3, titlesFrom: "adjacentTitles" },
    ],
  };

  it("dedupes across tiers by uid and ranks by tier weight", async () => {
    // Tier "exact" runs 2 searches (2 current titles); "adjacent" runs 1.
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ profiles: [{ uid: "a", fullName: "Ada" }], total: 1 }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ profiles: [{ uid: "b", fullName: "Ben" }], total: 1 }),
      )
      .mockResolvedValueOnce(
        // adjacent tier re-surfaces "a" (dupe) + new "c"
        jsonResponse({ profiles: [{ uid: "a", fullName: "Ada" }, { uid: "c", fullName: "Cyd" }], total: 2 }),
      );

    const res = await signalhireAdapter.sourcePeople("key", args, spec);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(res.searches).toBe(3);
    expect(res.count).toBe(3); // a, b, c — deduped
    // Ada/Ben (weight-5 tier) rank above Cyd (weight-3 tier).
    expect(res.text.indexOf("Ada")).toBeLessThan(res.text.indexOf("Cyd"));
    expect(res.text).toContain("no credits");
  });

  it("surfaces the error when every search fails", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "bad key" }, 401));
    const res = await signalhireAdapter.sourcePeople("key", args, spec);
    expect(res.count).toBe(0);
    expect(res.text).toContain("couldn't run");
  });

  it("runs an identical query produced by two tiers only once", async () => {
    // Both tiers resolve to the SAME single search (title 'Eng', no other fields).
    const dupSpec: SignalHireLadderSpec = {
      defaults: { targetCount: 25, maxSearches: 12 },
      tiers: [
        { name: "a", weight: 3, titlesFrom: "currentTitles" },
        { name: "b", weight: 2, titlesFrom: "currentTitles" },
      ],
    };
    fetchMock.mockResolvedValue(
      jsonResponse({ profiles: [{ uid: "x", fullName: "Xio" }], total: 1 }),
    );
    const res = await signalhireAdapter.sourcePeople(
      "key",
      { currentTitles: ["Eng"] },
      dupSpec,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1); // deduped, not 2
    expect(res.searches).toBe(1);
  });

  it("passes each tier's page-size limit to the search body", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ profiles: [], total: 0 }));
    await signalhireAdapter.sourcePeople(
      "key",
      { currentTitles: ["Eng"] },
      {
        defaults: { targetCount: 25, maxSearches: 12 },
        tiers: [{ name: "a", weight: 3, titlesFrom: "currentTitles", limit: 7 }],
      },
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.size).toBe(7);
  });

  it("early-stops once the target is met (later tiers don't run)", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        profiles: [
          { uid: "a", fullName: "A" },
          { uid: "b", fullName: "B" },
        ],
        total: 2,
      }),
    );
    const res = await signalhireAdapter.sourcePeople(
      "key",
      { currentTitles: ["Eng"], adjacentTitles: ["Dev"] },
      {
        defaults: { targetCount: 2, maxSearches: 12 },
        tiers: [
          { name: "exact", weight: 3, titlesFrom: "currentTitles" },
          { name: "adjacent", weight: 2, titlesFrom: "adjacentTitles" },
        ],
      },
    );
    expect(fetchMock).toHaveBeenCalledTimes(1); // target hit after tier 1
    expect(res.count).toBe(2);
  });
});

describe("parseSignalHireLadderSpec", () => {
  it("accepts a valid spec and rejects a malformed one", () => {
    const raw = JSON.stringify({
      defaults: { targetCount: 10, maxSearches: 6 },
      tiers: [{ name: "t", weight: 1, titlesFrom: "currentTitles" }],
    });
    expect(parseSignalHireLadderSpec(raw).tiers).toHaveLength(1);
    expect(() => parseSignalHireLadderSpec('{"tiers":[]}')).toThrow();
  });
});
