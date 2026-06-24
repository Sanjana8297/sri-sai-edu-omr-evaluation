import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/api-auth";
import { buildSubjectScoresPayload } from "@/lib/subject-score-breakdown";
import type { TeacherTrack } from "@/lib/dashboard-nav";

export async function GET() {
  const { session, response } = await requireRoles(["TEACHER"]);
  if (response) return response;

  const students = await prisma.student.findMany({
    where: { teacherId: session.sub },
    select: { id: true, category: true },
  });

  const studentIds = students.map((s) => s.id);
  if (studentIds.length === 0) {
    return NextResponse.json(
      buildSubjectScoresPayload({
        sessions: [],
        attempts: [],
        studentTracks: new Map(),
      })
    );
  }

  const [sessions, attempts] = await Promise.all([
    prisma.examSession.findMany({
      where: {
        studentId: { in: studentIds },
        status: { in: ["SUBMITTED", "AUTO_SUBMITTED"] },
        scoreMax: { not: null },
      },
      select: {
        id: true,
        studentId: true,
        submittedAt: true,
        startedAt: true,
        submittedAnswers: true,
        scoreObtained: true,
        scoreMax: true,
        exam: {
          select: {
            category: true,
            title: true,
            questionPaper: {
              select: { questionContent: true, keyContent: true },
            },
          },
        },
      },
    }),
    prisma.examAttempt.findMany({
      where: { studentId: { in: studentIds } },
      select: {
        id: true,
        studentId: true,
        category: true,
        title: true,
        examDate: true,
        marksObtained: true,
        maxMarks: true,
      },
    }),
  ]);

  const studentTracks = new Map<string, TeacherTrack>(
    students.map((s) => [s.id, s.category === "NEET" ? "NEET" : "JEE"])
  );

  const payload = buildSubjectScoresPayload({
    sessions,
    attempts,
    studentTracks,
  });

  return NextResponse.json(payload);
}
