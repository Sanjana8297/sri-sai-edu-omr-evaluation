import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import {
  contentHashLookupKeys,
  hashText,
  sqlContentHashInClause,
} from "@/lib/question-bank-content-hash";
import { sqlHashLookupFrom } from "@/lib/question-bank-table";
import { stripHtmlToPlainText } from "@/lib/question-text";

/** Load all content_hash values in the bank that match any of the given question stems. */
export async function loadExistingContentHashesForSubject(
  prisma: PrismaClient,
  exam: "JEE" | "NEET",
  subject: string,
  questionTexts: string[]
): Promise<Set<string>> {
  const uniqueKeys = new Set<string>();
  for (const text of questionTexts) {
    if (!text.trim()) continue;
    for (const key of contentHashLookupKeys(exam, subject, text)) {
      uniqueKeys.add(key);
    }
  }
  if (uniqueKeys.size === 0) return new Set();

  const keys = [...uniqueKeys];
  const fromClause = sqlHashLookupFrom(subject);
  const rows = await prisma.$queryRaw<Array<{ content_hash: string }>>(
    Prisma.sql`
      SELECT content_hash
      ${fromClause}
      WHERE exam = ${exam} AND ${sqlContentHashInClause(keys)}
    `
  );
  return new Set(rows.map((r) => r.content_hash));
}

export function questionTextExistsInBank(
  exam: "JEE" | "NEET",
  subject: string,
  questionText: string,
  existingHashes: Set<string>
): boolean {
  return contentHashLookupKeys(exam, subject, questionText).some((k) => existingHashes.has(k));
}

/** Fingerprint for within-batch dedupe (same normalization as bank inserts). */
export function batchDedupeKey(subject: string, questionText: string): string {
  const raw = questionText.trim();
  const stripped = stripHtmlToPlainText(raw).trim();
  const stem = stripped || raw;
  return `${subject}:${hashText(stem)}`;
}

export function filterQuestionsNotInBank<T extends { questionText: string }>(
  exam: "JEE" | "NEET",
  subject: string,
  questions: T[],
  existingHashes: Set<string>
): { kept: T[]; skippedDuplicateInBank: number; skippedDuplicateInBatch: number } {
  const seenInBatch = new Set<string>();
  const kept: T[] = [];
  let skippedDuplicateInBank = 0;
  let skippedDuplicateInBatch = 0;

  for (const q of questions) {
    const text = q.questionText?.trim();
    if (!text) continue;

    const batchKey = batchDedupeKey(subject, text);
    if (seenInBatch.has(batchKey)) {
      skippedDuplicateInBatch += 1;
      continue;
    }
    if (questionTextExistsInBank(exam, subject, text, existingHashes)) {
      skippedDuplicateInBank += 1;
      continue;
    }

    seenInBatch.add(batchKey);
    kept.push(q);
  }

  return { kept, skippedDuplicateInBank, skippedDuplicateInBatch };
}
