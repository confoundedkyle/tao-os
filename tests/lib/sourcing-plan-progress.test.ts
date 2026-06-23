import { describe, expect, it } from "vitest";
import {
  appendProgressEntry,
  sanitizeProgressNote,
} from "@/lib/sourcing-plan/progress";

describe("sanitizeProgressNote", () => {
  it("collapses whitespace and trims", () => {
    expect(sanitizeProgressNote("  searched\n\n  GitHub  ")).toBe(
      "searched GitHub",
    );
  });

  it("caps long notes with an ellipsis", () => {
    const out = sanitizeProgressNote("x".repeat(700));
    expect(out.length).toBe(500);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("appendProgressEntry", () => {
  const plan = "# Sourcing Plan: Role\n\n## 1. Role decoded\n- target";

  it("creates the Progress log section on the first entry", () => {
    const out = appendProgressEntry(plan, "23 Jun 2026", "Searched GitHub → 18");
    expect(out).toContain("## Progress log");
    expect(out).toContain("- **23 Jun 2026** — Searched GitHub → 18");
    // Exactly one heading.
    expect(out.match(/## Progress log/g)).toHaveLength(1);
  });

  it("appends to the existing section without rewriting earlier entries", () => {
    const first = appendProgressEntry(plan, "23 Jun", "first entry");
    const second = appendProgressEntry(first, "24 Jun", "second entry");
    expect(second.match(/## Progress log/g)).toHaveLength(1);
    expect(second).toContain("- **23 Jun** — first entry");
    expect(second).toContain("- **24 Jun** — second entry");
    // Oldest first.
    expect(second.indexOf("first entry")).toBeLessThan(
      second.indexOf("second entry"),
    );
    // The strategy body is untouched.
    expect(second).toContain("## 1. Role decoded\n- target");
  });

  it("never mutates the original strategy text", () => {
    const out = appendProgressEntry(plan, "23 Jun", "note");
    expect(out.startsWith(plan)).toBe(true);
  });

  it("returns the input unchanged for an empty note", () => {
    expect(appendProgressEntry(plan, "23 Jun", "   ")).toBe(plan);
  });
});
