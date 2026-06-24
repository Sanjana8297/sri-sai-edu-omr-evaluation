import { mergeUniqueExamAttempts } from "@/lib/exam-attempt-dedup";

type StudentInput = {
  id: string;
  name: string;
  email: string | null;
  username?: string | null;
  category: string;
  year?: number | null;
  createdAt: Date;
  teacher: { id: string; name: string; email: string | null; username?: string | null } | null;
};

type SessionInput = {
  id: string;
  studentId: string;
  submittedAt: Date | null;
  startedAt: Date;
  scoreObtained: number | null;
  scoreMax: number | null;
  exam: { title: string; category: string };
};

type AttemptInput = {
  id: string;
  studentId: string;
  category: string;
  title: string;
  examDate: Date;
  marksObtained: number;
  maxMarks: number;
  student?: { id: string; name: string; email: string | null; category: string };
};

type ExamInput = {
  id: string;
  title: string;
  category: string;
  startTime: Date;
  isPublished: boolean;
};

type TeacherInput = {
  id: string;
  name: string;
  email: string | null;
  username?: string | null;
  category: string;
  studentCount: number;
};

export function buildReportsOverviewPayload({
  students,
  sessions,
  attempts,
  exams,
  teachers,
  studentCount,
  teacherCount,
  examCount,
}: {
  students: StudentInput[];
  sessions: SessionInput[];
  attempts: AttemptInput[];
  exams: ExamInput[];
  teachers: TeacherInput[];
  studentCount: number;
  teacherCount: number;
  examCount?: number;
}) {
  const studentById = new Map(students.map((s) => [s.id, s]));
  const uniqueAttempts = mergeUniqueExamAttempts({ sessions, attempts });

  const performance = uniqueAttempts.map((a) => {
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
    performance.length > 0
      ? Math.round((performance.reduce((s, p) => s + p.percentage, 0) / performance.length) * 10) / 10
      : null;

  return {
    counts: { students: studentCount, teachers: teacherCount, exams: examCount ?? exams.length },
    avgPercentageAcrossAttempts: avgPct,
    students: students.map((s) => ({
      ...s,
      createdAt: s.createdAt.toISOString(),
    })),
    teachers,
    exams: exams.map((e) => ({
      id: e.id,
      title: e.title,
      category: e.category,
      startTime: e.startTime.toISOString(),
      isPublished: e.isPublished,
    })),
    performance,
  };
}
