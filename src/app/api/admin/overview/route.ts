import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/api-auth";

export async function GET() {
  const { response } = await requireRoles(["ADMIN"]);
  if (response) return response;

  const [studentCount, teacherCount, students, attempts] = await Promise.all([
    prisma.student.count(),
    prisma.teacher.count(),
    prisma.student.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        category: true,
        teacher: { select: { name: true, email: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.examAttempt.findMany({
      include: {
        student: { select: { id: true, name: true, email: true, category: true } },
      },
      orderBy: { examDate: "desc" },
    }),
  ]);

  const percentages = attempts.map((a) => ({
    id: a.id,
    studentId: a.studentId,
    studentName: a.student.name,
    category: a.category,
    title: a.title,
    examDate: a.examDate.toISOString(),
    marksObtained: a.marksObtained,
    maxMarks: a.maxMarks,
    percentage: a.maxMarks > 0 ? Math.round((a.marksObtained / a.maxMarks) * 1000) / 10 : 0,
  }));

  const avgPct =
    percentages.length > 0
      ? Math.round(
          (percentages.reduce((s, p) => s + p.percentage, 0) / percentages.length) * 10,
        ) / 10
      : null;

  return NextResponse.json({
    counts: { students: studentCount, teachers: teacherCount },
    avgPercentageAcrossAttempts: avgPct,
    students,
    performance: percentages,
  });
}
