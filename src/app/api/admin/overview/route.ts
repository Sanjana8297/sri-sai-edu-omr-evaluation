import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/api-auth";
import { mergeUniqueExamAttempts } from "@/lib/exam-attempt-dedup";

export async function GET() {
  const { response } = await requireRoles(["ADMIN"]);
  if (response) return response;

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

  const studentById = new Map(students.map((s) => [s.id, s]));

  const uniqueAttempts = mergeUniqueExamAttempts({ sessions, attempts });

  const percentages = uniqueAttempts.map((a) => {
    const student = studentById.get(a.studentId);
    return {
      id: a.sourceId,
      studentId: a.studentId,
      studentName: student?.name ?? "",
      studentEmail: student?.email ?? "",
      category: a.category,
      title: a.title,
      examDate: a.examDate.toISOString(),
      marksObtained: a.marksObtained,
      maxMarks: a.maxMarks,
      percentage: a.maxMarks > 0 ? Math.round((a.marksObtained / a.maxMarks) * 1000) / 10 : 0,
    };
  });

  const avgPct =
    percentages.length > 0
      ? Math.round(
          (percentages.reduce((s, p) => s + p.percentage, 0) / percentages.length) * 10,
        ) / 10
      : null;

  return NextResponse.json({
    counts: { students: studentCount, teachers: teacherCount, exams: exams.length },
    avgPercentageAcrossAttempts: avgPct,
    students: students.map((s) => ({
      ...s,
      createdAt: s.createdAt.toISOString(),
    })),
    teachers: teachers.map((t) => ({
      id: t.id,
      name: t.name,
      email: t.email,
      category: t.category,
      studentCount: t._count.students,
    })),
    exams: exams.map((e) => ({
      id: e.id,
      title: e.title,
      category: e.category,
      startTime: e.startTime.toISOString(),
      isPublished: e.isPublished,
    })),
    performance: percentages,
  });
}
