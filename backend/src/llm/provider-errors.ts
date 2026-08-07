export type LlmProviderFailureReason =
  | "billing"
  | "dns"
  | "rate_limit"
  | "service_unavailable"
  | "timeout"
  | "other";

const DNS_ERROR_CODES = new Set([
  "EAI_AGAIN",
  "EAI_FAIL",
  "ENODATA",
  "ENOTFOUND",
]);

function errorChain(error: unknown): unknown[] {
  const chain: unknown[] = [];
  const seen = new Set<unknown>();
  let current = error;
  while (current && !seen.has(current) && chain.length < 8) {
    chain.push(current);
    seen.add(current);
    current = typeof current === "object"
      ? (current as { cause?: unknown }).cause
      : undefined;
  }
  return chain;
}

function numericStatus(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  const status = (value as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

function errorCode(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const code = (value as { code?: unknown }).code;
  return typeof code === "string" ? code.toUpperCase() : null;
}

function errorName(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const name = (value as { name?: unknown }).name;
  return typeof name === "string" ? name : "";
}

function errorMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (!value || typeof value !== "object") return String(value ?? "");
  const message = (value as { message?: unknown }).message;
  return typeof message === "string" ? message : "";
}

export function classifyLlmProviderError(
  error: unknown,
): LlmProviderFailureReason {
  const chain = errorChain(error);
  const statuses = chain.map(numericStatus).filter(
    (status): status is number => status !== null,
  );
  const messages = chain.map(errorMessage).join(" ");
  const names = chain.map(errorName).join(" ");
  const codes = chain.map(errorCode).filter(
    (code): code is string => code !== null,
  );

  if (
    statuses.includes(429) ||
    /rate[ -]?limit|too many requests|throttl/i.test(messages)
  ) {
    return "rate_limit";
  }
  if (statuses.includes(503)) return "service_unavailable";
  if (
    codes.some((code) => ["ABORT_ERR", "ETIMEDOUT"].includes(code)) ||
    /abort|timeout/i.test(names) ||
    /request was aborted|timed? ?out|timeout/i.test(messages)
  ) {
    return "timeout";
  }
  if (
    codes.some((code) => DNS_ERROR_CODES.has(code)) ||
    /getaddrinfo|dns lookup|name resolution|enotfound|eai_again/i.test(messages)
  ) {
    return "dns";
  }
  if (
    statuses.includes(402) ||
    (
      statuses.includes(403) &&
      /credit|spend|billing|payment|insufficient.+balance|quota exhausted|usage limit/i.test(
        messages,
      )
    )
  ) {
    return "billing";
  }
  return "other";
}

function errorHeaders(
  error: unknown,
): { headers?: unknown } | undefined {
  return errorChain(error).find((value) =>
    value && typeof value === "object" && "headers" in value
  ) as { headers?: unknown } | undefined;
}

function headerValue(headers: unknown, key: string): string | null {
  if (!headers || typeof headers !== "object") return null;
  const get = (headers as { get?: unknown }).get;
  if (typeof get === "function") {
    const value = get.call(headers, key);
    return typeof value === "string" ? value : null;
  }
  const record = headers as Record<string, unknown>;
  const value = record[key] ?? record[key.toLowerCase()] ??
    record[key.toUpperCase()];
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : null;
}

export function providerRetryAfterMs(error: unknown): number | null {
  const holder = errorHeaders(error);
  const headers = holder?.headers;
  const rawMilliseconds = headerValue(headers, "retry-after-ms");
  if (rawMilliseconds !== null) {
    const milliseconds = Number(rawMilliseconds);
    if (Number.isFinite(milliseconds) && milliseconds >= 0) {
      return Math.min(Math.round(milliseconds), 10_000);
    }
  }

  const raw = headerValue(headers, "retry-after");
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(Math.round(seconds * 1_000), 10_000);
  }
  const date = Date.parse(raw);
  if (!Number.isFinite(date)) return null;
  return Math.min(Math.max(0, date - Date.now()), 10_000);
}
