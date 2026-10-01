import { describe, expect, it } from "vitest";
import { hostAllowed, isPublicAddress, normalizeDomain, parseWatchUrl, sniffDocumentMime } from "@/lib/watch/net";
import { safeFetch } from "@/lib/watch/safe-fetch";

describe("parseWatchUrl", () => {
  it("accepts https on a domain name and drops the fragment", () => {
    expect(parseWatchUrl("https://www.JORADP.dz/FTP/jo-francais/2026/F2026001.pdf#page=2")).toEqual({
      url: "https://www.joradp.dz/FTP/jo-francais/2026/F2026001.pdf",
      host: "www.joradp.dz",
    });
    expect(parseWatchUrl("https://cnas.dz:443/actualites")?.host).toBe("cnas.dz");
  });

  it("refuses http, IP literals, other ports, credentials and spaces", () => {
    for (const u of [
      "http://joradp.dz/",
      "https://127.0.0.1/",
      "https://10.0.0.5/admin",
      "https://[::1]/",
      "https://joradp.dz:8443/",
      "https://user:pass@joradp.dz/",
      "https://joradp.dz/a b",
      "https://localhost/",
      "ftp://joradp.dz/",
      "",
    ]) {
      expect(parseWatchUrl(u), u).toBeNull();
    }
  });
});

describe("hostAllowed / normalizeDomain", () => {
  it("allows the domain and its subdomains only", () => {
    expect(hostAllowed("joradp.dz", ["joradp.dz"])).toBe(true);
    expect(hostAllowed("www.joradp.dz", ["joradp.dz"])).toBe(true);
    expect(hostAllowed("evil-joradp.dz", ["joradp.dz"])).toBe(false);
    expect(hostAllowed("joradp.dz.evil.com", ["joradp.dz"])).toBe(false);
  });

  it("normalizes a bare domain name", () => {
    expect(normalizeDomain(" MFDGI.gov.dz ")).toBe("mfdgi.gov.dz");
    expect(normalizeDomain("https://joradp.dz")).toBeNull();
    expect(normalizeDomain("joradp.dz/path")).toBeNull();
    expect(normalizeDomain("192.168.1.1")).toBeNull();
  });
});

describe("isPublicAddress", () => {
  it("refuses private, loopback, link-local, carrier-grade, documentation and multicast IPv4", () => {
    for (const ip of [
      "0.0.0.0",
      "10.1.2.3",
      "100.64.0.1",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.10",
      "192.0.2.1",
      "198.18.0.1",
      "203.0.113.9",
      "224.0.0.1",
      "255.255.255.255",
    ]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });

  it("refuses internal IPv6, including IPv4-mapped private addresses", () => {
    for (const ip of ["::1", "::", "fd00::1", "fc12::3", "fe80::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:c0a8:101", "2001:db8::1"]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });

  it("accepts public unicast addresses and refuses garbage", () => {
    expect(isPublicAddress("41.111.12.5")).toBe(true);
    expect(isPublicAddress("172.32.0.1")).toBe(true);
    expect(isPublicAddress("2a00:1450:4007:80e::200e")).toBe(true);
    expect(isPublicAddress("::ffff:41.111.12.5")).toBe(true);
    expect(isPublicAddress("not-an-ip")).toBe(false);
    expect(isPublicAddress("999.1.1.1")).toBe(false);
  });
});

describe("sniffDocumentMime", () => {
  it("recognizes PDF and images from their first bytes only", () => {
    expect(sniffDocumentMime(new TextEncoder().encode("%PDF-1.7\n"))).toBe("application/pdf");
    expect(sniffDocumentMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffDocumentMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffDocumentMime(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(sniffDocumentMime(new TextEncoder().encode("<!doctype html><html>"))).toBeNull();
  });
});

describe("safeFetch guards (no network)", () => {
  const opts = { domains: ["joradp.dz"], maxBytes: 1000, timeoutMs: 1000, accept: "text/html" };

  it("refuses an IP literal or a domain outside the list before any connection", async () => {
    await expect(safeFetch("https://169.254.169.254/latest/meta-data", opts)).rejects.toThrow(/Adresse refusée/);
    await expect(safeFetch("https://example.com/", opts)).rejects.toThrow(/Domaine non autorisé/);
    await expect(safeFetch("http://joradp.dz/", opts)).rejects.toThrow(/Adresse refusée/);
  });
});
