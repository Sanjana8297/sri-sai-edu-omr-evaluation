import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/api-auth";
import { buildInstitutionDashboardPayload } from "@/lib/institution-dashboard";

export const maxDuration = 60;

export async function GET() {
  const { response } = await requireRoles(["ADMIN"]);
  if (response) return response;

  try {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sixtyDaysAgo = new Date(now);
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const [
      totalStudents,
      studentsRecentMonth,
      studentsPriorMonth,
      teachers,
      sessions,
      attempts,
      students,
      examsThisMonthCount,
    ] = await Promise.all([
      prisma.student.count(),
      prisma.student.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.student.count({
        where: { createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } },
      }),
      prisma.teacher.findMany({
        select: {
          id: true,
          name: true,
          category: true,
          _count: { select: { students: true } },
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
          exam: {
            select: {
              category: true,
              title: true,
            },
          },
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
      }),
      prisma.student.findMany({
        select: {
          id: true,
          name: true,
          category: true,
          teacherId: true,
          teacher: { select: { id: true, name: true, category: true } },
        },
      }),
      prisma.exam.count({
        where: { startTime: { gte: thisMonthStart, lt: nextMonthStart } },
      }),
    ]);

    const payload = buildInstitutionDashboardPayload({
      now,
      totalStudents,
      studentsRecentMonth,
      studentsPriorMonth,
      teachers,
      sessions,
      attempts,
      students,
      examsThisMonthCount,
    });

    return NextResponse.json(payload);
  } catch (error) {
    console.error("[institution-dashboard]", error);
    return NextResponse.json({ error: "Failed to load institution dashboard" }, { status: 500 });
  }
}
