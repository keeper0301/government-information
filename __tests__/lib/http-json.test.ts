import { describe, expect, it } from "vitest";
import {
  JsonBodyInvalidError,
  JsonBodyTooLargeError,
  isJsonBodyInvalidError,
  isJsonBodyTooLargeError,
  readJsonWithLimit,
  readTextWithLimit,
} from "@/lib/http/json";

describe("readJsonWithLimit", () => {
  it("parses JSON within the byte limit", async () => {
    const req = new Request("https://example.com", {
      method: "POST",
      body: JSON.stringify({ hello: "world" }),
    });

    await expect(readJsonWithLimit<{ hello: string }>(req, 1024)).resolves.toEqual({
      hello: "world",
    });
  });

  it("rejects content-length that exceeds the limit before reading", async () => {
    const req = new Request("https://example.com", {
      method: "POST",
      headers: { "content-length": "2048" },
      body: "{}",
    });

    await expect(readJsonWithLimit(req, 1024)).rejects.toBeInstanceOf(JsonBodyTooLargeError);
  });

  it("rejects streamed bodies that exceed the limit", async () => {
    const req = new Request("https://example.com", {
      method: "POST",
      body: JSON.stringify({ data: "x".repeat(2000) }),
    });

    await expect(readJsonWithLimit(req, 100)).rejects.toBeInstanceOf(JsonBodyTooLargeError);
  });

  it("classifies invalid and oversized errors", () => {
    expect(isJsonBodyInvalidError(new JsonBodyInvalidError())).toBe(true);
    expect(isJsonBodyTooLargeError(new JsonBodyTooLargeError(1))).toBe(true);
  });

  it("reads raw text within the byte limit for signed webhook handlers", async () => {
    const req = new Request("https://example.com", {
      method: "POST",
      body: "signed-payload",
    });

    await expect(readTextWithLimit(req, 1024)).resolves.toBe("signed-payload");
  });
});
