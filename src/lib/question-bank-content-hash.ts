import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { stripHtmlToPlainText } from "@/lib/question-text";

export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/\\[a-z]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hashText(input: string): string {
  return createHash("sha256").update(normalizeText(input)).digest("hex");
}

/**
 * All `content_hash` shapes that may exist for the same stem (see question-bank route).
 */
export function contentHashLookupKeys(exam: "JEE" | "NEET", subject: string, questionText: string): string[] {
  const raw = questionText.trim();
  const stripped = stripHtmlToPlainText(raw).trim();
  const stems = new Set<string>([raw]);
  if (stripped !== raw) stems.add(stripped);

  const keys = new Set<string>();
  for (const stem of stems) {
    const h = hashText(stem);
    keys.add(`${subject}:${h}`);
    if (exam === "JEE") {
      keys.add(`${subject}:mains:${h}`);
      keys.add(`${subject}:advanced:${h}`);
    }
  }
  return [...keys];
}

export function sqlContentHashInClause(keys: string[]): Prisma.Sql {
  const parts = keys.map((k) => Prisma.sql`${k}`);
  return Prisma.sql`content_hash IN (${Prisma.join(parts, ", ")})`;
}
