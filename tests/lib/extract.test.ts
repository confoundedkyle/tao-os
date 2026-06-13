import { describe, expect, it } from "vitest";
import { extractTextFromFile } from "@/lib/extract";

const NUL = String.fromCharCode(0);
const BELL = String.fromCharCode(7);

describe("extractTextFromFile (text files)", () => {
  it("strips NUL and other control chars that Postgres text rejects (22P05)", async () => {
    const file = new File([`a${NUL}b${BELL}c`], "notes.txt", {
      type: "text/plain",
    });
    expect(await extractTextFromFile(file)).toBe("abc");
  });

  it("keeps tab, newline and carriage return", async () => {
    const file = new File(["a\tb\nc\rd"], "notes.txt", { type: "text/plain" });
    expect(await extractTextFromFile(file)).toBe("a\tb\nc\rd");
  });

  it("trims surrounding whitespace", async () => {
    const file = new File(["  hello  "], "notes.md", { type: "text/markdown" });
    expect(await extractTextFromFile(file)).toBe("hello");
  });
});
