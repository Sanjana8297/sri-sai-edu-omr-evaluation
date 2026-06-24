import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { buildReportsOverviewPayload } from "@/lib/reports-overview";
import type {
  QuestionPaperListItem,
  StudentAvailableExam,
  StudentExamHistoryItem,
  TeacherStudent,
} from "@/lib/data/fetchers";

export async function getTeacherStudentsServer(): Promise<{
  students: TeacherStudent[];
  teacher: { category: string };
} | null> {
  const session = await getSession();
  if (!session || session.role !== "TEACHER") return null;

  const me = await prisma.teacher.findUnique({
    where: { id: session.sub },
    select: { id: true, category: true },
  });
  if (!me) return null;

  const students = await prisma.student.findMany({
    where: { teacherId: session.sub },
    select: { id: true, name: true, email: true, username: true, category: true, year: true, createdAt: true },
    orderBy: { name: "asc" },
  });

  return {
    students: students.map((s) => ({
      ...s,
      createdAt: s.createdAt.toISOString(),
    })),
    teacher: { category: me.category },
  };
}

export async function getStudentExamsAvailableServer(): Promise<{
  exams: StudentAvailableExam[];
} | null> {
  const session = await getSession();
  if (!session || session.role !== "STUDENT") return null;

  const me = await prisma.student.findUnique({
    where: { id: session.sub },
    select: { id: true, category: true },
  });
  if (!me) return null;

  const now = new Date();
  const exams = await prisma.exam.findMany({
    where: {
      category: me.category,
      isPublished: true,
      startTime: { lte: now },
      endTime: { gte: now },
      NOT: {
        examSessions: {
          some: {
            studentId: me.id,
            status: { in: ["SUBMITTED", "AUTO_SUBMITTED"] },
          },
        },
      },
    },
    orderBy: [{ startTime: "asc" }],
    select: {
      id: true,
      title: true,
      category: true,
      startTime: true,
      endTime: true,
      durationMinutes: true,
      examSessions: {
        where: { studentId: me.id },
        orderBy: { startedAt: "desc" },
        take: 1,
        select: { id: true, status: true, violationCount: true, startedAt: true, submittedAt: true },
      },
    },
  });

  return {
    exams: exams.map((exam) => ({
      id: exam.id,
      title: exam.title,
      category: exam.category,
      startTime: exam.startTime.toISOString(),
      endTime: exam.endTime.toISOString(),
      durationMinutes: exam.durationMinutes,
      examSessions: exam.examSessions.map((s) => ({
        id: s.id,
        status: s.status,
        violationCount: s.violationCount,
        startedAt: s.startedAt.toISOString(),
        submittedAt: s.submittedAt?.toISOString() ?? null,
      })),
    })),
  };
}

export async function getStudentExamsHistoryServer(): Promise<{
  exams: StudentExamHistoryItem[];
} | null> {
  const session = await getSession();
  if (!session || session.role !== "STUDENT") return null;

  const sessions = await prisma.examSession.findMany({
    where: {
      studentId: session.sub,
      status: { in: ["SUBMITTED", "AUTO_SUBMITTED"] },
    },
    orderBy: { submittedAt: "desc" },
    include: {
      exam: { select: { id: true, title: true, category: true } },
    },
  });

  return {
    exams: sessions.map((s) => ({
      id: s.id,
      examId: s.exam.id,
      title: s.exam.title,
      category: s.exam.category,
      examDate: (s.submittedAt ?? s.startedAt).toISOString(),
      marksObtained: s.scoreObtained ?? 0,
      maxMarks: s.scoreMax ?? 0,
      percentage:
        s.scoreMax && s.scoreMax > 0
          ? Math.round(((s.scoreObtained ?? 0) / s.scoreMax) * 1000) / 10
          : 0,
      status: s.status as "SUBMITTED" | "AUTO_SUBMITTED",
    })),
  };
}

export async function getTeacherQuestionPapersServer(): Promise<{
  papers: QuestionPaperListItem[];
} | null> {
  const session = await getSession();
  if (!session || session.role !== "TEACHER") return null;

  const papers = await prisma.questionPaper.findMany({
    where: { teacherId: session.sub },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      category: true,
      questionContent: true,
      keyContent: true,
      isAiGenerated: true,
      aiPromptVersion: true,
      questionPaperUrl: true,
      answerSheetUrl: true,
      createdAt: true,
      _count: { select: { exams: true } },
    },
  });

  return {
    papers: papers.map((p) => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
    })),
  };
}

export async function getAdminReportsOverviewServer() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return null;

  const [students, teachers, exams, sessions, attempts] = await Promise.all([
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
    prisma.exam.findMany({
      select: { id: true, title: true, category: true, startTime: true, isPublished: true },
      orderBy: { startTime: "desc" },
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

  return buildReportsOverviewPayload({
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
    studentCount: students.length,
    teacherCount: teachers.length,
  });
}
