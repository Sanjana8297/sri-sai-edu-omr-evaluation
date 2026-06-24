import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/api-auth";
import { mergeUniqueExamAttempts } from "@/lib/exam-attempt-dedup";
import { buildSubjectScoresPayload } from "@/lib/subject-score-breakdown";
import type { TeacherTrack } from "@/lib/dashboard-nav";

const LOW_PERFORMER_THRESHOLD = 40;
const STAFFING_LIMIT = 25;

function roundPct(value: number): number {
  return Math.round(value * 10) / 10;
}

function academicYearLabel(date = new Date()): string {
  const year = date.getFullYear();
  const month = date.getMonth();
  const startYear = month >= 5 ? year : year - 1;
  const endYear = startYear + 1;
  return `AY ${startYear}–${String(endYear).slice(-2)}`;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthShortLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleString("en-IN", { month: "short" });
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

export async function GET() {
  const { response } = await requireRoles(["ADMIN"]);
  if (response) return response;

  const now = new Date();
  const thisMonthStart = startOfMonth(now);
  const lastMonthStart = addMonths(thisMonthStart, -1);
  const nextMonthStart = addMonths(thisMonthStart, 1);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sixtyDaysAgo = new Date(now);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

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
        submittedAnswers: true,
        scoreObtained: true,
        scoreMax: true,
        exam: {
          select: {
            category: true,
            title: true,
            questionPaper: { select: { questionContent: true, keyContent: true } },
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

  const uniqueAttempts = mergeUniqueExamAttempts({ sessions, attempts });

  const studentTracks = new Map<string, TeacherTrack>(
    students.map((s) => [s.id, s.category === "NEET" ? "NEET" : "JEE"])
  );

  const subjectScoresFull = buildSubjectScoresPayload({
    sessions,
    attempts,
    studentTracks,
  });

  const activeTeachers = teachers.filter((t) => t._count.students > 0);
  const jeeBatches = activeTeachers.filter((t) => t.category === "JEE").length;
  const neetBatches = activeTeachers.filter((t) => t.category === "NEET").length;

  const growthPct =
    studentsPriorMonth > 0
      ? roundPct(((studentsRecentMonth - studentsPriorMonth) / studentsPriorMonth) * 100)
      : studentsRecentMonth > 0
        ? 100
        : 0;

  const attemptsThisMonth = uniqueAttempts.filter(
    (a) => a.examDate >= thisMonthStart && a.examDate < nextMonthStart
  ).length;
  const attemptsLastMonth = uniqueAttempts.filter(
    (a) => a.examDate >= lastMonthStart && a.examDate < thisMonthStart
  ).length;
  const examMonthDelta = attemptsThisMonth - attemptsLastMonth;

  const studentById = new Map(students.map((s) => [s.id, s]));
  const batchStats = new Map<
    string,
    { label: string; track: string; total: number; count: number }
  >();

  for (const attempt of uniqueAttempts) {
    const student = studentById.get(attempt.studentId);
    const teacherName = student?.teacher?.name ?? "Unassigned";
    const track = student?.category ?? attempt.category;
    const batchId = student?.teacherId ?? "unassigned";
    const label = `${track} · ${teacherName}`;
    const bucket = batchStats.get(batchId) ?? { label, track, total: 0, count: 0 };
    const pct = attempt.maxMarks > 0 ? (attempt.marksObtained / attempt.maxMarks) * 100 : 0;
    bucket.total += pct;
    bucket.count += 1;
    batchStats.set(batchId, bucket);
  }

  const topBatches = [...batchStats.values()]
    .filter((b) => b.count > 0)
    .map((b) => ({
      label: b.label,
      track: b.track,
      avg: roundPct(b.total / b.count),
      attemptCount: b.count,
    }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 3);

  const allBatches = [...batchStats.values()]
    .filter((b) => b.count > 0)
    .map((b) => ({
      label: b.label,
      track: b.track,
      avg: roundPct(b.total / b.count),
      attemptCount: b.count,
    }))
    .sort((a, b) => b.avg - a.avg);

  const lowPerformerStudents = Object.entries(subjectScoresFull.byStudent)
    .filter(([, stats]) => stats.overallAvg != null && stats.overallAvg < LOW_PERFORMER_THRESHOLD)
    .map(([studentId, stats]) => ({ studentId, stats }));

  const lowPerformerIds = new Set(lowPerformerStudents.map((s) => s.studentId));

  const uniqueLowThisWeek = new Set(
    uniqueAttempts
      .filter((a) => lowPerformerIds.has(a.studentId) && a.examDate >= weekAgo)
      .map((a) => a.studentId)
  ).size;

  const subjectTally = new Map<string, number>();
  for (const { stats } of lowPerformerStudents) {
    const withData = stats.subjects.filter((s) => s.avg != null);
    if (withData.length === 0) {
      subjectTally.set("General", (subjectTally.get("General") ?? 0) + 1);
      continue;
    }
    const weakest = withData.reduce((min, s) => (s.avg! < min.avg! ? s : min));
    subjectTally.set(weakest.subject, (subjectTally.get(weakest.subject) ?? 0) + 1);
  }

  const lowPerformerSubjects = [...subjectTally.entries()]
    .map(([subject, count]) => ({ subject, count }))
    .sort((a, b) => b.count - a.count);

  const monthBuckets = new Map<string, number>();
  for (let i = 3; i >= 0; i -= 1) {
    const d = addMonths(thisMonthStart, -i);
    monthBuckets.set(monthKey(d), 0);
  }
  for (const attempt of uniqueAttempts) {
    const key = monthKey(attempt.examDate);
    if (monthBuckets.has(key)) {
      monthBuckets.set(key, (monthBuckets.get(key) ?? 0) + 1);
    }
  }

  const monthlyAttempts = [...monthBuckets.entries()].map(([key, count]) => ({
    month: key,
    label: monthShortLabel(key),
    count,
  }));

  const maxMonthly = Math.max(...monthlyAttempts.map((m) => m.count), 1);

  const understaffedBatches = teachers.filter((t) => t._count.students > STAFFING_LIMIT).length;
  const overallRatio =
    teachers.length > 0 ? Math.round(totalStudents / teachers.length) : 0;

  const lowPerformerList = lowPerformerStudents
    .map(({ studentId, stats }) => {
      const student = studentById.get(studentId);
      return {
        id: studentId,
        name: student?.name ?? "Unknown",
        track: stats.track,
        avg: stats.overallAvg ?? 0,
        teacher: student?.teacher?.name ?? "—",
      };
    })
    .sort((a, b) => a.avg - b.avg);

  return NextResponse.json({
    academicYear: academicYearLabel(now),
    updatedAt: now.toISOString(),
    summary: {
      totalStudents,
      studentGrowthPct: growthPct,
      studentGrowthPositive: growthPct >= 0,
      activeBatches: activeTeachers.length,
      jeeBatches,
      neetBatches,
      lowPerformers: lowPerformerStudents.length,
      lowPerformersNewThisWeek: uniqueLowThisWeek,
      examsThisMonth: attemptsThisMonth,
      examsScheduledThisMonth: examsThisMonthCount,
      examsMonthDelta: examMonthDelta,
      examsMonthDeltaPositive: examMonthDelta >= 0,
    },
    topBatches,
    allBatches,
    lowPerformerThreshold: LOW_PERFORMER_THRESHOLD,
    lowPerformerSubjects,
    lowPerformerList,
    monthlyAttempts,
    maxMonthlyAttempts: maxMonthly,
    staffing: {
      overallRatio: teachers.length > 0 ? `1 : ${overallRatio}` : "—",
      overallWithinLimit: overallRatio <= STAFFING_LIMIT,
      understaffedBatches,
      staffingLimit: STAFFING_LIMIT,
      teachers: teachers.map((t) => ({
        id: t.id,
        name: t.name,
        track: t.category,
        studentCount: t._count.students,
        ratio: t._count.students > 0 ? `1 : ${t._count.students}` : "—",
        isUnderstaffed: t._count.students > STAFFING_LIMIT,
      })),
    },
  });
}
