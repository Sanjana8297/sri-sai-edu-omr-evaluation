import { mergeUniqueExamAttempts, overallAvgFromNormalizedAttempts } from "@/lib/exam-attempt-dedup";
import type { TeacherTrack } from "@/lib/dashboard-nav";
import { titleToSingleSubject } from "@/lib/subject-score-breakdown";

export const LOW_PERFORMER_THRESHOLD = 40;
export const STAFFING_LIMIT = 25;

function roundPct(value: number): number {
  return Math.round(value * 10) / 10;
}

export function academicYearLabel(date = new Date()): string {
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

type SessionRow = {
  id: string;
  studentId: string;
  submittedAt: Date | null;
  startedAt: Date;
  scoreObtained: number | null;
  scoreMax: number | null;
  exam: { title: string; category: string };
};

type AttemptRow = {
  id: string;
  studentId: string;
  category: string;
  title: string;
  examDate: Date;
  marksObtained: number;
  maxMarks: number;
};

type StudentRow = {
  id: string;
  name: string;
  category: string;
  teacherId: string | null;
  teacher: { id: string; name: string; category: string } | null;
};

type TeacherRow = {
  id: string;
  name: string;
  category: string;
  _count: { students: number };
};

export function buildInstitutionDashboardPayload(input: {
  now?: Date;
  totalStudents: number;
  studentsRecentMonth: number;
  studentsPriorMonth: number;
  teachers: TeacherRow[];
  sessions: SessionRow[];
  attempts: AttemptRow[];
  students: StudentRow[];
  examsThisMonthCount: number;
}) {
  const now = input.now ?? new Date();
  const thisMonthStart = startOfMonth(now);
  const lastMonthStart = addMonths(thisMonthStart, -1);
  const nextMonthStart = addMonths(thisMonthStart, 1);
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const uniqueAttempts = mergeUniqueExamAttempts({
    sessions: input.sessions,
    attempts: input.attempts,
  });

  const studentById = new Map(input.students.map((s) => [s.id, s]));
  const studentTracks = new Map<string, TeacherTrack>(
    input.students.map((s) => [s.id, s.category === "NEET" ? "NEET" : "JEE"])
  );

  const activeTeachers = input.teachers.filter((t) => t._count.students > 0);
  const jeeBatches = activeTeachers.filter((t) => t.category === "JEE").length;
  const neetBatches = activeTeachers.filter((t) => t.category === "NEET").length;

  const growthPct =
    input.studentsPriorMonth > 0
      ? roundPct(
          ((input.studentsRecentMonth - input.studentsPriorMonth) / input.studentsPriorMonth) * 100
        )
      : input.studentsRecentMonth > 0
        ? 100
        : 0;

  const attemptsThisMonth = uniqueAttempts.filter(
    (a) => a.examDate >= thisMonthStart && a.examDate < nextMonthStart
  ).length;
  const attemptsLastMonth = uniqueAttempts.filter(
    (a) => a.examDate >= lastMonthStart && a.examDate < thisMonthStart
  ).length;
  const examMonthDelta = attemptsThisMonth - attemptsLastMonth;

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

  const attemptsByStudent = new Map<string, Array<{ marksObtained: number; maxMarks: number }>>();
  const attemptsByStudentFull = new Map<string, typeof uniqueAttempts>();
  for (const attempt of uniqueAttempts) {
    const list = attemptsByStudent.get(attempt.studentId) ?? [];
    list.push({ marksObtained: attempt.marksObtained, maxMarks: attempt.maxMarks });
    attemptsByStudent.set(attempt.studentId, list);

    const fullList = attemptsByStudentFull.get(attempt.studentId) ?? [];
    fullList.push(attempt);
    attemptsByStudentFull.set(attempt.studentId, fullList);
  }

  const lowPerformerStudents = [...attemptsByStudent.entries()]
    .map(([studentId, studentAttempts]) => ({
      studentId,
      overallAvg: overallAvgFromNormalizedAttempts(studentAttempts),
    }))
    .filter((row) => row.overallAvg != null && row.overallAvg < LOW_PERFORMER_THRESHOLD);

  const lowPerformerIds = new Set(lowPerformerStudents.map((s) => s.studentId));

  const uniqueLowThisWeek = new Set(
    uniqueAttempts
      .filter((a) => lowPerformerIds.has(a.studentId) && a.examDate >= weekAgo)
      .map((a) => a.studentId)
  ).size;

  const subjectTally = new Map<string, number>();
  for (const { studentId } of lowPerformerStudents) {
    const studentAttempts = attemptsByStudentFull.get(studentId) ?? [];
    const track = studentTracks.get(studentId) ?? "JEE";

    let weakest = studentAttempts[0];
    let weakestPct = weakest && weakest.maxMarks > 0 ? (weakest.marksObtained / weakest.maxMarks) * 100 : 100;
    for (const attempt of studentAttempts) {
      const pct = attempt.maxMarks > 0 ? (attempt.marksObtained / attempt.maxMarks) * 100 : 0;
      if (pct < weakestPct) {
        weakest = attempt;
        weakestPct = pct;
      }
    }

    if (!weakest) {
      subjectTally.set("General", (subjectTally.get("General") ?? 0) + 1);
      continue;
    }

    const subject = titleToSingleSubject(weakest.title, track) ?? "General";
    subjectTally.set(subject, (subjectTally.get(subject) ?? 0) + 1);
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

  const monthExamMap = new Map<
    string,
    Map<string, { title: string; category: string; students: Set<string> }>
  >();
  for (const key of monthBuckets.keys()) {
    monthExamMap.set(key, new Map());
  }
  for (const attempt of uniqueAttempts) {
    const key = monthKey(attempt.examDate);
    const examMap = monthExamMap.get(key);
    if (!examMap) continue;
    const examKey = `${attempt.category}||${attempt.title}`;
    const bucket =
      examMap.get(examKey) ?? { title: attempt.title, category: attempt.category, students: new Set<string>() };
    bucket.students.add(attempt.studentId);
    examMap.set(examKey, bucket);
  }

  const monthlyExamBreakdown = [...monthBuckets.keys()].map((key) => ({
    month: key,
    label: monthShortLabel(key),
    exams: [...(monthExamMap.get(key)?.values() ?? [])]
      .map((e) => ({ title: e.title, category: e.category, studentCount: e.students.size }))
      .sort((a, b) => b.studentCount - a.studentCount),
  }));

  const understaffedBatches = input.teachers.filter((t) => t._count.students > STAFFING_LIMIT).length;
  const overallRatio = input.teachers.length > 0 ? Math.round(input.totalStudents / input.teachers.length) : 0;

  const lowPerformerList = lowPerformerStudents
    .map(({ studentId, overallAvg }) => {
      const student = studentById.get(studentId);
      return {
        id: studentId,
        name: student?.name ?? "Unknown",
        track: student?.category ?? "—",
        avg: overallAvg ?? 0,
        teacher: student?.teacher?.name ?? "—",
      };
    })
    .sort((a, b) => a.avg - b.avg);

  return {
    academicYear: academicYearLabel(now),
    updatedAt: now.toISOString(),
    summary: {
      totalStudents: input.totalStudents,
      studentGrowthPct: growthPct,
      studentGrowthPositive: growthPct >= 0,
      activeBatches: activeTeachers.length,
      jeeBatches,
      neetBatches,
      lowPerformers: lowPerformerStudents.length,
      lowPerformersNewThisWeek: uniqueLowThisWeek,
      examsThisMonth: attemptsThisMonth,
      examsScheduledThisMonth: input.examsThisMonthCount,
      examsMonthDelta: examMonthDelta,
      examsMonthDeltaPositive: examMonthDelta >= 0,
    },
    topBatches,
    allBatches,
    lowPerformerThreshold: LOW_PERFORMER_THRESHOLD,
    lowPerformerSubjects,
    lowPerformerList,
    monthlyAttempts,
    monthlyExamBreakdown,
    maxMonthlyAttempts: maxMonthly,
    staffing: {
      overallRatio: input.teachers.length > 0 ? `1 : ${overallRatio}` : "—",
      overallWithinLimit: overallRatio <= STAFFING_LIMIT,
      understaffedBatches,
      staffingLimit: STAFFING_LIMIT,
      teachers: input.teachers.map((t) => ({
        id: t.id,
        name: t.name,
        track: t.category,
        studentCount: t._count.students,
        ratio: t._count.students > 0 ? `1 : ${t._count.students}` : "—",
        isUnderstaffed: t._count.students > STAFFING_LIMIT,
      })),
    },
  };
}
