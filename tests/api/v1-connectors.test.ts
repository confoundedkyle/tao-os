import { describe, expect, it } from "vitest";
import { CONNECTORS } from "@/lib/connectors";
import { SUPPORTED_PROVIDERS } from "@/lib/ai-catalog";
import { GET, OPTIONS, type PublicCatalogItem } from "@/app/api/v1/connectors/route";

async function getItems(): Promise<PublicCatalogItem[]> {
  const res = await GET();
  const body = (await res.json()) as { items: PublicCatalogItem[] };
  return body.items;
}

describe("GET /api/v1/connectors", () => {
  it("returns 200 with one item per connector, BYO provider, and Local models", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const { items } = (await res.json()) as { items: PublicCatalogItem[] };
    const byoProviders = SUPPORTED_PROVIDERS.filter((p) => p !== "calyflow");
    expect(items).toHaveLength(CONNECTORS.length + byoProviders.length + 1);
  });

  it("exposes only name, category, and status on every item", async () => {
    const items = await getItems();
    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual(["category", "name", "status"]);
      expect(["ai", "ats", "crm", "data", "email", "tool"]).toContain(
        item.category,
      );
      expect(["available", "coming_soon"]).toContain(item.status);
    }
  });

  it("maps each connector's live flag to status", async () => {
    const items = await getItems();
    const byName = Object.fromEntries(items.map((i) => [i.name, i]));
    for (const c of CONNECTORS) {
      expect(byName[c.name].status).toBe(
        c.live ? "available" : "coming_soon",
      );
    }
  });

  it("lists BYO AI providers without the internal calyflow default", async () => {
    const items = await getItems();
    const ai = items.filter((i) => i.category === "ai");
    const names = ai.map((i) => i.name);
    expect(names).toContain("Anthropic");
    expect(names).toContain("xAI (Grok)");
    expect(names).not.toContain("Calyflow default");
    expect(ai.find((i) => i.name === "Local models")?.status).toBe(
      "coming_soon",
    );
  });

  it("has unique names across the catalog", async () => {
    const items = await getItems();
    expect(new Set(items.map((i) => i.name)).size).toBe(items.length);
  });

  it("sends public CORS and cache headers", async () => {
    const res = await GET();
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("cache-control")).toContain("public");
  });

  it("answers preflight with 204 and CORS headers", () => {
    const res = OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toContain("GET");
  });
});
