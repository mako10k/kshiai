/** A completed HTTP response whose content cannot be decoded as JSON. */
export class ProviderJsonSyntaxError extends SyntaxError {
  // Retain candidate text only in memory for the bounded domain repair. Do not
  // include it (or JSON.parse's potentially content-bearing message) in logs.
  #rejectedText: string;

  constructor(text: string) {
    super("Provider returned invalid JSON");
    this.name = "ProviderJsonSyntaxError";
    this.#rejectedText = text.slice(0, 16000);
  }

  get rejectedText(): string {
    return this.#rejectedText;
  }
}

export function parseProviderJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new ProviderJsonSyntaxError(text);
  }
}
