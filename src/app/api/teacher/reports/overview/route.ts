import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/api-auth";
import { buildReportsOverviewPayload } from "@/lib/reports-overview";

export async function GET() {
  const { session, response } = await requireRoles(["TEACHER"]);
  if (response) return response;

  const teacherId = session.sub;

  const students = await prisma.student.findMany({
    where: { teacherId },
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
  });

  const studentIds = students.map((s) => s.id);

  const [sessions, attempts, exams, teacher] = await Promise.all([
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
        scoreObtained: true,
        scoreMax: true,
        exam: { select: { title: true, category: true } },
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
      orderBy: { examDate: "desc" },
    }),
    prisma.exam.findMany({
      where: { teacherId },
      select: { id: true, title: true, category: true, startTime: true, isPublished: true },
      orderBy: { startTime: "desc" },
    }),
    prisma.teacher.findUnique({
      where: { id: teacherId },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        category: true,
        _count: { select: { students: true } },
      },
    }),
  ]);

  const teachers = teacher
    ? [
        {
          id: teacher.id,
          name: teacher.name,
          email: teacher.email,
          category: teacher.category,
          studentCount: teacher._count.students,
        },
      ]
    : [];

  return NextResponse.json(
    buildReportsOverviewPayload({
      students,
      sessions,
      attempts,
      exams,
      teachers,
      studentCount: students.length,
      teacherCount: 1,
    })
  );
}
