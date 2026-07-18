import { prisma } from "@/lib/prisma";

export type MatchedStudent = {
  id: string;
  name: string;
  rollNumber: string | null;
  matchedBy: "rollNumber" | "username" | "email";
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

/**
 * Match an AI-detected roll number to one of the teacher's students.
 * Tries the dedicated roll number first (including leading-zero variants), then username, then email.
 * Returns null when nothing matches or the match is ambiguous.
 */
export async function matchStudentByRoll(
  teacherId: string,
  detectedRoll: string | null | undefined
): Promise<MatchedStudent | null> {
  const roll = detectedRoll?.trim();
  if (!roll) return null;

  const students = await prisma.student.findMany({
    where: { teacherId },
    select: { id: true, name: true, rollNumber: true, username: true, email: true },
  });

  const rollKey = normalizeRollKey(roll);
  const rollExact = roll.toLowerCase();

  const byRoll = students.filter((s) => {
    const stored = s.rollNumber?.trim();
    if (!stored) return false;
    return stored.toLowerCase() === rollExact || normalizeRollKey(stored) === rollKey;
  });
  if (byRoll.length === 1) {
    return {
      id: byRoll[0].id,
      name: byRoll[0].name,
      rollNumber: byRoll[0].rollNumber,
      matchedBy: "rollNumber",
    };
  }
  if (byRoll.length > 1) return null;

  const byUsername = students.filter((s) => (s.username ?? "").toLowerCase() === rollExact);
  if (byUsername.length === 1) {
    return {
      id: byUsername[0].id,
      name: byUsername[0].name,
      rollNumber: byUsername[0].rollNumber,
      matchedBy: "username",
    };
  }

  const byEmail = students.filter((s) => (s.email ?? "").toLowerCase() === rollExact);
  if (byEmail.length === 1) {
    return {
      id: byEmail[0].id,
      name: byEmail[0].name,
      rollNumber: byEmail[0].rollNumber,
      matchedBy: "email",
    };
  }

  return null;
}
