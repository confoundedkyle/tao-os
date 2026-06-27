import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildTierQuery,
  coresignalAdapter,
  type CoresignalLadderSpec,
  type CoresignalSourceArgs,
  type LadderTier,
} from "@/lib/integrations/coresignal";
import { jsonResponse } from "../../helpers/http";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const baseArgs: CoresignalSourceArgs = {
  currentTitles: ["Staff Video Engineer"],
  adjacentTitles: ["Senior Media Engineer", "Codec Engineer"],
  skills: ["ffmpeg", "libvpx"],
  location: "Berlin",
};

describe("buildTierQuery", () => {
  it("expands a single match_phrase title, a term, and a location query_string filter", () => {
    const tier: LadderTier = {
      name: "exact",
      weight: 100,
      clauses: [
        { bool: "must", op: "match_phrase", field: "job_title", valuesFrom: "currentTitles" },
        { bool: "filter", op: "term", field: "active_experience", value: 1 },
        {
          bool: "filter",
          op: "query_string",
          fields: ["location_country", "location_city"],
          valuesFrom: "location",
          defaultOperator: "and",
        },
      ],
    };
    const { query } = buildTierQuery(tier, baseArgs);
    expect(query.bool.must).toEqual([
      { match_phrase: { job_title: "Staff Video Engineer" } },
    ]);
    expect(query.bool.filter).toContainEqual({ term: { active_experience: 1 } });
    expect(query.bool.filter).toContainEqual({
      query_string: {
        query: "Berlin",
        fields: ["location_country", "location_city"],
        default_operator: "AND",
      },
    });
  });

  it("wraps multiple titles in a should bool with minimum_should_match", () => {
    const tier: LadderTier = {
      name: "adjacent",
      weight: 60,
      clauses: [
        { bool: "should", op: "match", field: "job_title", valuesFrom: "adjacentTitles" },
      ],
    };
    const { query } = buildTierQuery(tier, baseArgs);
    expect(query.bool.should).toEqual([
      {
        bool: {
          should: [
            { match: { job_title: "Senior Media Engineer" } },
            { match: { job_title: "Codec Engineer" } },
          ],
          minimum_should_match: 1,
        },
      },
    ]);
    // pure-should tier gets a floor
    expect(query.bool.minimum_should_match).toBe(1);
  });

  it("expands a nested experience.title clause", () => {
    const tier: LadderTier = {
      name: "nested",
      weight: 60,
      clauses: [
        {
          bool: "should",
          op: "nested",
          path: "experience",
          clauses: [
            { bool: "should", op: "match", field: "experience.title", valuesFrom: "adjacentTitles" },
          ],
        },
      ],
    };
    const json = JSON.stringify(buildTierQuery(tier, baseArgs));
    expect(json).toContain('"nested"');
    expect(json).toContain('"path":"experience"');
    expect(json).toContain('"experience.title":"Codec Engineer"');
  });

  it("builds a skills query_string with OR of quoted terms", () => {
    const tier: LadderTier = {
      name: "skills",
      weight: 40,
      clauses: [
        {
          bool: "must",
          op: "query_string",
          fields: ["skills", "description"],
          valuesFrom: "skills",
          defaultOperator: "or",
        },
      ],
    };
    const { query } = buildTierQuery(tier, baseArgs);
    expect(query.bool.must).toEqual([
      {
        query_string: {
          query: '"ffmpeg" OR "libvpx"',
          fields: ["skills", "description"],
          default_operator: "OR",
        },
      },
    ]);
  });

  it("drops clauses whose source is empty, yielding an empty bool", () => {
    const tier: LadderTier = {
      name: "skills-only",
      weight: 20,
      clauses: [
        { bool: "must", op: "query_string", fields: ["skills"], valuesFrom: "skills" },
      ],
    };
    const { query } = buildTierQuery(tier, { currentTitles: ["X"] }); // no skills
    expect(Object.keys(query.bool)).toHaveLength(0);
  });
});

const SPEC: CoresignalLadderSpec = {
  defaults: { targetCount: 25, maxCollects: 8, creditBudget: 40 },
  tiers: [
    {
      name: "t1",
      weight: 100,
      clauses: [{ bool: "must", op: "match_phrase", field: "job_title", valuesFrom: "currentTitles" }],
    },
    {
      name: "t2",
      weight: 40,
      clauses: [{ bool: "must", op: "query_string", fields: ["skills"], valuesFrom: "skills" }],
    },
  ],
};

/** Route the global fetch mock: searches return ids, collects return a profile.
 *  `idsByCall` supplies the id list for each successive search. */
function mockLadder(idsByCall: string[][]) {
  let searchIdx = 0;
  fetchMock.mockImplementation((url: string) => {
    if (url.includes("/search/es_dsl")) {
      const ids = idsByCall[searchIdx++] ?? [];
      return Promise.resolve(jsonResponse({ hits: { hits: ids.map((_id) => ({ _id })) } }));
    }
    if (url.includes("/collect/")) {
      const id = decodeURIComponent(url.split("/collect/")[1]);
      return Promise.resolve(jsonResponse({ id, full_name: `Person ${id}` }));
    }
    return Promise.resolve(jsonResponse({}, 404));
  });
}

function collectedIds(): string[] {
  return fetchMock.mock.calls
    .map(([url]) => url as string)
    .filter((u) => u.includes("/collect/"))
    .map((u) => decodeURIComponent(u.split("/collect/")[1]));
}

describe("sourceEmployees ladder", () => {
  it("hits the Clean Employee API, dedupes across tiers, and ranks higher-weight tiers first", async () => {
    mockLadder([
      ["A", "B"], // t1
      ["B", "C"], // t2 (B is a dup)
    ]);
    const record = vi.fn();
    const res = await coresignalAdapter.sourceEmployees("key", baseArgs, SPEC, null, record);

    // searched the clean endpoint
    expect(fetchMock.mock.calls[0][0]).toContain("/cdapi/v2/employee_clean/search/es_dsl");
    // 3 unique, ranked A,B (t1, weight 100) before C (t2, weight 40)
    expect(collectedIds()).toEqual(["A", "B", "C"]);
    expect(res.count).toBe(3);
    // 2 searches + 3 collects = ~10 credits
    expect(res.creditsSpent).toBe(10);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(10, expect.objectContaining({ unique: 3 }));
  });

  it("stops the ladder once targetCount unique candidates are gathered", async () => {
    mockLadder([["A", "B"], ["C", "D"]]);
    await coresignalAdapter.sourceEmployees("key", { ...baseArgs, targetCount: 2 }, SPEC, null);
    const searches = fetchMock.mock.calls.filter(([u]) => (u as string).includes("/search/")).length;
    expect(searches).toBe(1); // second tier never runs
  });

  it("bounds spend by the credit budget (no collects when only a search fits)", async () => {
    mockLadder([["A", "B", "C"]]);
    const res = await coresignalAdapter.sourceEmployees(
      "key",
      { ...baseArgs, creditBudget: 2 },
      SPEC,
      null,
    );
    expect(res.creditsSpent).toBe(2); // one search, no room to collect
    expect(collectedIds()).toEqual([]);
    expect(res.count).toBe(0);
  });

  it("clamps the ceiling to the project's remaining cap", async () => {
    mockLadder([["A", "B", "C", "D"]]);
    // targetCount 4 stops searching after tier 1, leaving budget for one collect.
    const res = await coresignalAdapter.sourceEmployees(
      "key",
      { ...baseArgs, targetCount: 4 },
      SPEC,
      4,
    );
    // cap 4 → one search (2) + one collect (2)
    expect(res.creditsSpent).toBe(4);
    expect(collectedIds()).toEqual(["A"]);
  });

  it("caps the number of hydrated profiles at maxCollects", async () => {
    mockLadder([["A", "B", "C", "D", "E"]]);
    const res = await coresignalAdapter.sourceEmployees(
      "key",
      { ...baseArgs, maxCollects: 2 },
      SPEC,
      null,
    );
    expect(collectedIds()).toHaveLength(2);
    expect(res.count).toBe(2);
  });

  it("refuses to search when the remaining cap is below one search", async () => {
    mockLadder([["A"]]);
    const res = await coresignalAdapter.sourceEmployees("key", baseArgs, SPEC, 1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.creditsSpent).toBe(0);
  });
});
