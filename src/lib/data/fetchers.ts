async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json();
  if (!res.ok) {
    throw new Error((json as { error?: string }).error ?? `Request failed: ${url}`);
  }
  return json as T;
}

export type MeUser = {
  id: string;
  name: string;
  email: string | null;
  username?: string | null;
  role: "ADMIN" | "TEACHER" | "STUDENT";
  category: string | null;
  teacherId?: string | null;
};

export async function fetchMe() {
  return jsonFetch<{ user: MeUser | null }>("/api/me");
}

export type TeacherStudent = {
  id: string;
  name: string;
  email: string | null;
  username: string | null;
  category: string | null;
  year: number | null;
  createdAt: string;
};

export async function fetchTeacherStudents() {
  return jsonFetch<{ students: TeacherStudent[]; teacher: { category: string } }>(
    "/api/teacher/students"
  );
}

export type StudentExamSession = {
  id: string;
  status: "IN_PROGRESS" | "SUBMITTED" | "AUTO_SUBMITTED";
  startedAt: string;
  submittedAt: string | null;
  violationCount: number;
};

export type StudentAvailableExam = {
  id: string;
  title: string;
  category: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  examSessions: StudentExamSession[];
};

export async function fetchStudentExamsAvailable() {
  return jsonFetch<{ exams: StudentAvailableExam[] }>("/api/student/exams/available");
}

export type StudentExamHistoryItem = {
  id: string;
  examId: string;
  title: string;
  category: string;
  examDate: string;
  marksObtained: number;
  maxMarks: number;
  percentage: number;
  status: "SUBMITTED" | "AUTO_SUBMITTED";
};

export async function fetchStudentExams() {
  return jsonFetch<{ exams: StudentExamHistoryItem[] }>("/api/student/exams");
}

export type QuestionPaperListItem = {
  id: string;
  title: string;
  category: string;
  questionContent: string;
  keyContent: string;
  isAiGenerated?: boolean;
  aiPromptVersion?: string | null;
  questionPaperUrl?: string | null;
  answerSheetUrl?: string | null;
  createdAt: string;
  _count: { exams: number };
};

export async function fetchTeacherQuestionPapers(scheduledOnly = false) {
  const q = scheduledOnly ? "?scheduledOnly=true" : "";
  return jsonFetch<{ papers: QuestionPaperListItem[] }>(`/api/teacher/question-papers${q}`);
}

export type LlmSettingsResponse = {
  model: string;
  baseUrl: string;
  hasApiKey: boolean;
  apiKeyMasked: string | null;
  usingEnvApiKey: boolean;
  updatedAt: string | null;
  tableReady?: boolean;
  aiReady?: boolean;
  statusMessage?: string | null;
};

export async function fetchAdminLlmSettings() {
  return jsonFetch<LlmSettingsResponse>("/api/admin/llm-settings");
}

export type AdminTeacherRow = {
  id: string;
  name: string;
  email: string | null;
  username: string | null;
  category: string | null;
};

export async function fetchAdminTeachers() {
  return jsonFetch<{ teachers: AdminTeacherRow[] }>("/api/admin/teachers");
}

export type AdminStudentRow = {
  id: string;
  name: string;
  email: string | null;
  username: string | null;
  category: string | null;
  year: number | null;
  createdAt: string;
  teacher: { name: string } | null;
};

export async function fetchAdminOverview() {
  return jsonFetch<{ students: AdminStudentRow[] }>("/api/admin/overview");
}

export type AdminStaffRow = {
  id: string;
  name: string;
  email: string | null;
  username: string | null;
  category?: string | null;
};

export async function fetchAdminAdmins() {
  return jsonFetch<{ admins: AdminStaffRow[] }>("/api/admin/admins");
}

export type ReportsOverviewData = {
  counts: { students: number; teachers: number; exams: number };
  avgPercentageAcrossAttempts: number | null;
  students: Array<{
    id: string;
    name: string;
    email: string;
    category: string;
    teacher: { id: string; name: string; email: string } | null;
  }>;
  teachers: Array<{
    id: string;
    name: string;
    email: string;
    category: string;
    studentCount: number;
  }>;
  exams: Array<{ id: string; title: string; category: string; startTime: string; isPublished: boolean }>;
  performance: Array<{
    id: string;
    studentId: string;
    studentName: string;
    studentEmail: string;
    category: string;
    title: string;
    examDate: string;
    marksObtained: number;
    maxMarks: number;
    percentage: number;
  }>;
};

export async function fetchReportsOverview(overviewPath: string) {
  const json = await jsonFetch<ReportsOverviewData & { error?: string }>(overviewPath);
  if (!json.counts) throw new Error("Invalid overview response");
  return json;
}

export async function fetchInstitutionDashboard() {
  return jsonFetch<Record<string, unknown>>("/api/admin/institution-dashboard");
}

export async function fetchSubjectScores(path: string) {
  return jsonFetch<import("@/lib/subject-score-breakdown").SubjectScoresPayload>(path);
}

export async function fetchTeacherOmrTemplate() {
  return jsonFetch<Record<string, unknown>>("/api/teacher/omr-template");
}

export async function fetchTeacherCbtSettings() {
  return jsonFetch<Record<string, unknown>>("/api/teacher/cbt-settings");
}
