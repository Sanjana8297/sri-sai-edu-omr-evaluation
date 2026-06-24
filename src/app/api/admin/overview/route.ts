import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/api-auth";
import { buildReportsOverviewPayload } from "@/lib/reports-overview";

export const maxDuration = 60;

export async function GET() {
  const { response } = await requireRoles(["ADMIN"]);
  if (response) return response;

  try {
  const [studentCount, teacherCount, students, sessions, attempts, exams, teachers] = await Promise.all([
    prisma.student.count(),
    prisma.teacher.count(),
    prisma.student.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        category: true,
        year: true,
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
        student: { select: { id: true, name: true, email: true, category: true } },
      },
      orderBy: { examDate: "desc" },
    }),
    prisma.exam.findMany({
      select: { id: true, title: true, category: true, startTime: true, isPublished: true },
      orderBy: { startTime: "desc" },
    }),
    prisma.teacher.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        category: true,
        _count: { select: { students: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  return NextResponse.json(
    buildReportsOverviewPayload({
      students,
      sessions,
      attempts,
      exams,
      teachers: teachers.map((t) => ({
        id: t.id,
        name: t.name,
        email: t.email,
        category: t.category,
        studentCount: t._count.students,
      })),
      studentCount,
      teacherCount,
    })
  );
  } catch (error) {
    console.error("[admin/overview]", error);
    return NextResponse.json({ error: "Failed to load overview" }, { status: 500 });
  }
}
