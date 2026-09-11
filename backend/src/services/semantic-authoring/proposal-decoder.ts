import type { z } from "zod";

export type ProposalDecodeIssueV1 = Readonly<{
  code: "encoded_size_exceeded" | "invalid_json" | "schema_mismatch";
  message: string;
}>;

export type ProposalDecodeResultV1<Value> =
  | Readonly<{ accepted: true; value: Value }>
  | Readonly<{ accepted: false; issue: ProposalDecodeIssueV1 }>;

export function decodeProposalResponseV1<Schema extends z.ZodTypeAny>(
  encodedProposal: string,
  schema: Schema,
  maxEncodedBytes = 6_144,
): ProposalDecodeResultV1<z.infer<Schema>> {
  const encodedBytes = Buffer.byteLength(encodedProposal, "utf8");
  if (encodedBytes > maxEncodedBytes) {
    return {
      accepted: false,
      issue: {
        code: "encoded_size_exceeded",
        message: `Encoded proposal is ${encodedBytes} bytes; maximum is ${maxEncodedBytes}`,
      },
    };
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(encodedProposal);
  } catch {
    return {
      accepted: false,
      issue: {
        code: "invalid_json",
        message: "Proposal response is not valid JSON",
      },
    };
  }

  const result = schema.safeParse(decoded);
  if (!result.success) {
    return {
      accepted: false,
      issue: {
        code: "schema_mismatch",
        message: result.error.issues[0]?.message ?? "Proposal response does not match its schema",
      },
    };
  }
  return { accepted: true, value: result.data };
}
