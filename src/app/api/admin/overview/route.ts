import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/api-auth";
import { buildReportsOverviewPayload } from "@/lib/reports-overview";

export const maxDuration = 60;

export async function GET() {
  const { response } = await requireRoles(["ADMIN"]);
  if (response) return response;

  try {
    const [studentCount, teacherCount, examCount, students, sessions, attempts] = await Promise.all([
      prisma.student.count(),
      prisma.teacher.count(),
      prisma.exam.count(),
      prisma.student.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          username: true,
          category: true,
          createdAt: true,
          teacher: { select: { id: true, name: true, email: true, username: true } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.examSession.findMany({
        where: {
          status: { in: ["SUBMITTED", "AUTO_SUBMITTED"] },
          scoreMax: { not: null },
        },
        select: {
          id: true,
          studentId: true,
          submittedAt: true,
          startedAt: true,
          scoreObtained: true,
          scoreMax: true,
          exam: { select: { title: true, category: true } },
        },
      }),
      prisma.examAttempt.findMany({
        select: {
          id: true,
          studentId: true,
          category: true,
          title: true,
          examDate: true,
          marksObtained: true,
          maxMarks: true,
        },
        orderBy: { examDate: "desc" },
      }),
    ]);

    return NextResponse.json(
      buildReportsOverviewPayload({
        students,
        sessions,
        attempts,
        exams: [],
        teachers: [],
        studentCount,
        teacherCount,
        examCount,
      })
    );
  } catch (error) {
    console.error("[admin/overview]", error);
    return NextResponse.json({ error: "Failed to load overview" }, { status: 500 });
  }
}
