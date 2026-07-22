import { prisma } from "@/lib/prisma";

export type MatchedStudent = {
  id: string;
  name: string;
  rollNumber: string | null;
  matchedBy: "name" | "rollNumber" | "username" | "email";
};

/** Normalize for comparison: trim, lower-case, strip leading zeros (keep a single 0). */
function normalizeRollKey(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  if (/^\d+$/.test(trimmed)) {
    const stripped = trimmed.replace(/^0+/, "");
    return stripped || "0";
  }
  return trimmed;
}

function normalizeNameKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");
}

function nameTokens(value: string): string[] {
  return normalizeNameKey(value).split(" ").filter(Boolean);
}

/** Simple Levenshtein distance for short OCR typos. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prevDiag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, prevDiag + cost);
      prevDiag = temp;
    }
  }
  return prev[b.length];
}

/**
 * Score how well a detected handwritten name matches a stored student name.
 * 1 = exact; lower scores allow OCR noise / missing middle names.
 */
export function scoreNameMatch(detected: string, stored: string): number {
  const a = normalizeNameKey(detected);
  const b = normalizeNameKey(stored);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.94;

  const ta = nameTokens(detected);
  const tb = nameTokens(stored);
  if (ta.length === 0 || tb.length === 0) return 0;

  const setA = new Set(ta);
  const setB = new Set(tb);
  let overlap = 0;
  for (const token of setA) {
    if (setB.has(token)) overlap += 1;
  }
  const jaccard = overlap / new Set([...setA, ...setB]).size;

  // First + last token match is strong even if middle names differ.
  const firstLast =
    ta[0] === tb[0] && ta[ta.length - 1] === tb[tb.length - 1] && ta.length >= 2 && tb.length >= 2
      ? 0.9
      : 0;

  const maxLen = Math.max(a.length, b.length);
  const editScore =
    maxLen > 0 && maxLen <= 28 ? Math.max(0, 1 - editDistance(a, b) / maxLen) : 0;

  return Math.max(jaccard, firstLast, editScore * 0.95);
}

type StudentRow = {
  id: string;
  name: string;
  rollNumber: string | null;
  username: string | null;
  email: string | null;
};

function toMatched(
  student: StudentRow,
  matchedBy: MatchedStudent["matchedBy"]
): MatchedStudent {
  return {
    id: student.id,
    name: student.name,
    rollNumber: student.rollNumber,
    matchedBy,
  };
}

/**
 * Match a detected handwritten name to one of the teacher's students.
 * Requires a clear unique winner; ambiguous ties return null.
 */
export function matchStudentByName(
  students: StudentRow[],
  detectedName: string | null | undefined
): MatchedStudent | null {
  const name = detectedName?.trim();
  if (!name) return null;

  const scored = students
    .map((s) => ({ student: s, score: scoreNameMatch(name, s.name) }))
    .filter((row) => row.score >= 0.82)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;
  if (scored.length > 1 && scored[0].score - scored[1].score < 0.05) return null;
  return toMatched(scored[0].student, "name");
}

/**
 * Match an AI-detected roll number to one of the teacher's students.
 * Tries the dedicated roll number first (including leading-zero variants), then username, then email.
 * Returns null when nothing matches or the match is ambiguous.
 */
export function matchStudentByRollAmong(
  students: StudentRow[],
  detectedRoll: string | null | undefined
): MatchedStudent | null {
  const roll = detectedRoll?.trim();
  if (!roll) return null;

  const rollKey = normalizeRollKey(roll);
  const rollExact = roll.toLowerCase();

  const byRoll = students.filter((s) => {
    const stored = s.rollNumber?.trim();
    if (!stored) return false;
    return stored.toLowerCase() === rollExact || normalizeRollKey(stored) === rollKey;
  });
  if (byRoll.length === 1) return toMatched(byRoll[0], "rollNumber");
  if (byRoll.length > 1) return null;

  const byUsername = students.filter((s) => (s.username ?? "").toLowerCase() === rollExact);
  if (byUsername.length === 1) return toMatched(byUsername[0], "username");

  const byEmail = students.filter((s) => (s.email ?? "").toLowerCase() === rollExact);
  if (byEmail.length === 1) return toMatched(byEmail[0], "email");

  return null;
}

export async function matchStudentByRoll(
  teacherId: string,
  detectedRoll: string | null | undefined
): Promise<MatchedStudent | null> {
  const students = await prisma.student.findMany({
    where: { teacherId },
    select: { id: true, name: true, rollNumber: true, username: true, email: true },
  });
  return matchStudentByRollAmong(students, detectedRoll);
}

/**
 * Prefer handwritten name match; fall back to roll / username / email when name is missing or ambiguous.
 */
export async function matchStudentForOmr(
  teacherId: string,
  input: { studentName?: string | null; rollNumber?: string | null }
): Promise<MatchedStudent | null> {
  const students = await prisma.student.findMany({
    where: { teacherId },
    select: { id: true, name: true, rollNumber: true, username: true, email: true },
  });

  const byName = matchStudentByName(students, input.studentName);
  if (byName) return byName;

  return matchStudentByRollAmong(students, input.rollNumber);
}
