// ============================================================
// JSON request body helpers
// ============================================================
// Public POST endpoints should reject oversized bodies before JSON.parse so a
// single request cannot spend unbounded memory/CPU in serverless functions.

export class JsonBodyTooLargeError extends Error {
  constructor(public readonly maxBytes: number) {
    super(`JSON body too large (max ${maxBytes} bytes)`);
    this.name = "JsonBodyTooLargeError";
  }
}

export class JsonBodyInvalidError extends Error {
  constructor(message = "Invalid JSON body") {
    super(message);
    this.name = "JsonBodyInvalidError";
  }
}

export function isJsonBodyTooLargeError(err: unknown): err is JsonBodyTooLargeError {
  return err instanceof JsonBodyTooLargeError;
}

export function isJsonBodyInvalidError(err: unknown): err is JsonBodyInvalidError {
  return err instanceof JsonBodyInvalidError;
}

function parseContentLength(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export async function readTextWithLimit(request: Request, maxBytes: number): Promise<string> {
  const contentLength = parseContentLength(request.headers.get("content-length"));
  if (contentLength !== null && contentLength > maxBytes) {
    throw new JsonBodyTooLargeError(maxBytes);
  }

  if (!request.body) {
    return "";
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        throw new JsonBodyTooLargeError(maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

export async function readJsonWithLimit<T = unknown>(
  request: Request,
  maxBytes: number,
): Promise<T> {
  const text = await readTextWithLimit(request, maxBytes);
  if (!text.trim()) {
    throw new JsonBodyInvalidError("Empty JSON body");
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new JsonBodyInvalidError();
  }
}
