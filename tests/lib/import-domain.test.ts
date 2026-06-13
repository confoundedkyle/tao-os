import { describe, expect, it } from "vitest";
import { hostIsWithinDomain, normalizeDomain } from "@/lib/import-domain";

describe("normalizeDomain", () => {
  it("returns a bare domain unchanged", () => {
    expect(normalizeDomain("acme.com")).toBe("acme.com");
  });

  it("strips scheme, www, path, query, port and userinfo", () => {
    expect(normalizeDomain("https://www.Acme.com/about?x=1")).toBe("acme.com");
    expect(normalizeDomain("http://acme.com:8080/x")).toBe("acme.com");
    expect(normalizeDomain("user@acme.com")).toBe("acme.com");
    expect(normalizeDomain("  HTTPS://ACME.COM/  ")).toBe("acme.com");
  });

  it("keeps non-www subdomains", () => {
    expect(normalizeDomain("careers.acme.co.uk")).toBe("careers.acme.co.uk");
  });

  it("only drops a leading www, not mid-host 'www'", () => {
    expect(normalizeDomain("wwwacme.com")).toBe("wwwacme.com");
  });

  it("rejects input that does not look like a domain", () => {
    for (const bad of [
      "",
      "   ",
      "localhost",
      "acme",
      "just text",
      "http://",
      "acme.c", // TLD too short
      "-acme.com", // label can't start with a hyphen
    ]) {
      expect(normalizeDomain(bad), bad).toBeNull();
    }
  });
});

describe("hostIsWithinDomain (SSRF guard)", () => {
  it("accepts the exact domain and its subdomains", () => {
    expect(hostIsWithinDomain("https://acme.com/about", "acme.com")).toBe(true);
    expect(hostIsWithinDomain("https://www.acme.com", "acme.com")).toBe(true);
    expect(hostIsWithinDomain("https://careers.acme.com/x", "acme.com")).toBe(
      true,
    );
    expect(hostIsWithinDomain("http://acme.com", "acme.com")).toBe(true);
  });

  it("rejects other hosts, including look-alikes and suffix tricks", () => {
    expect(hostIsWithinDomain("https://evil.com", "acme.com")).toBe(false);
    expect(hostIsWithinDomain("https://acme.com.evil.com", "acme.com")).toBe(
      false,
    );
    expect(hostIsWithinDomain("https://notacme.com", "acme.com")).toBe(false);
    expect(hostIsWithinDomain("https://acme.evil.com", "acme.com")).toBe(false);
  });

  it("rejects non-http(s) schemes (file/ftp/data/internal)", () => {
    expect(hostIsWithinDomain("file:///etc/passwd", "acme.com")).toBe(false);
    expect(hostIsWithinDomain("ftp://acme.com/x", "acme.com")).toBe(false);
    expect(hostIsWithinDomain("data:text/html,hi", "acme.com")).toBe(false);
  });

  it("rejects malformed URLs", () => {
    expect(hostIsWithinDomain("not a url", "acme.com")).toBe(false);
    expect(hostIsWithinDomain("acme.com/about", "acme.com")).toBe(false);
  });
});
