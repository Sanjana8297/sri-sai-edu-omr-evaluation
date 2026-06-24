import type { QueryClient } from "@tanstack/react-query";
import {
  fetchAdminLlmSettings,
  fetchAdminOverview,
  fetchAdminTeachers,
  fetchInstitutionDashboard,
  fetchMe,
  fetchReportsOverview,
  fetchStudentExams,
  fetchStudentExamsAvailable,
  fetchTeacherQuestionPapers,
  fetchTeacherStudents,
} from "@/lib/data/fetchers";
import { dataKeys } from "@/hooks/data/keys";

/** Map nav href (path only, no query) to prefetch handlers. Question-bank routes omitted (out of scope). */
export function prefetchDashboardRoute(queryClient: QueryClient, href: string) {
  const path = href.split("?")[0];

  const handlers: Record<string, () => Promise<void>> = {
    "/dashboard/teacher/students": () =>
      queryClient.prefetchQuery({
        queryKey: dataKeys.teacherStudents,
        queryFn: fetchTeacherStudents,
        staleTime: 10 * 60_000,
      }),
    "/dashboard/teacher/all-question-papers": () =>
      queryClient.prefetchQuery({
        queryKey: dataKeys.teacherQuestionPapers,
        queryFn: () => fetchTeacherQuestionPapers(false),
        staleTime: 10 * 60_000,
      }),
    "/dashboard/teacher/uploaded-papers": () =>
      queryClient.prefetchQuery({
        queryKey: dataKeys.teacherQuestionPapersArchived,
        queryFn: () => fetchTeacherQuestionPapers(true),
        staleTime: 10 * 60_000,
      }),
    "/dashboard/teacher/result-score-reports": () =>
      queryClient.prefetchQuery({
        queryKey: dataKeys.adminReportsOverview("/api/teacher/reports/overview"),
        queryFn: () => fetchReportsOverview("/api/teacher/reports/overview"),
        staleTime: 5 * 60_000,
      }),
    "/dashboard/student/exams": () =>
      queryClient.prefetchQuery({
        queryKey: dataKeys.studentExamsAvailable,
        queryFn: fetchStudentExamsAvailable,
        staleTime: 60_000,
      }),
    "/dashboard/student/exam-history": () =>
      queryClient.prefetchQuery({
        queryKey: dataKeys.studentExams,
        queryFn: fetchStudentExams,
        staleTime: 5 * 60_000,
      }),
    "/dashboard/student/performance-summary": () =>
      Promise.all([
        queryClient.prefetchQuery({
          queryKey: dataKeys.me,
          queryFn: fetchMe,
          staleTime: 10 * 60_000,
        }),
        queryClient.prefetchQuery({
          queryKey: dataKeys.studentExams,
          queryFn: fetchStudentExams,
          staleTime: 5 * 60_000,
        }),
      ]).then(() => undefined),
    "/dashboard/student/analysis-notes": () =>
      queryClient.prefetchQuery({
        queryKey: dataKeys.studentExams,
        queryFn: fetchStudentExams,
        staleTime: 5 * 60_000,
      }),
    "/dashboard/admin/user-management": () =>
      Promise.all([
        queryClient.prefetchQuery({
          queryKey: dataKeys.adminTeachers,
          queryFn: fetchAdminTeachers,
          staleTime: 10 * 60_000,
        }),
        queryClient.prefetchQuery({
          queryKey: dataKeys.adminOverview,
          queryFn: fetchAdminOverview,
          staleTime: 10 * 60_000,
        }),
      ]).then(() => undefined),
    "/dashboard/admin/reports": () =>
      queryClient.prefetchQuery({
        queryKey: dataKeys.adminReportsOverview("/api/admin/overview"),
        queryFn: () => fetchReportsOverview("/api/admin/overview"),
        staleTime: 5 * 60_000,
      }),
    "/dashboard/admin/llm-settings": () =>
      queryClient.prefetchQuery({
        queryKey: dataKeys.adminLlmSettings,
        queryFn: fetchAdminLlmSettings,
        staleTime: 10 * 60_000,
      }),
    "/dashboard/admin/reports/follow-up": () =>
      Promise.all([
        queryClient.prefetchQuery({
          queryKey: dataKeys.adminInstitutionDashboard,
          queryFn: fetchInstitutionDashboard,
          staleTime: 5 * 60_000,
        }),
      ]).then(() => undefined),
  };

  const handler = handlers[path];
  if (handler) void handler();
}
