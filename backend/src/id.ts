import { randomBytes } from "node:crypto";

export function newId(prefix = ""): string {
  const id = randomBytes(12).toString("hex");
  return prefix ? `${prefix}_${id}` : id;
}
