"use client";

import { useQuery } from "@tanstack/react-query";
import {
  fetchAdminAdmins,
  fetchAdminOverview,
  fetchAdminTeachers,
  fetchReportsOverview,
  fetchInstitutionDashboard,
  fetchSubjectScores,
  fetchTeacherOmrTemplate,
  fetchTeacherCbtSettings,
} from "@/lib/data/fetchers";
import { dataKeys } from "./keys";

export function useAdminTeachersQuery(enabled = true) {
  return useQuery({
    queryKey: dataKeys.adminTeachers,
    queryFn: fetchAdminTeachers,
    staleTime: 10 * 60_000,
    enabled,
  });
}

export function useAdminAdminsQuery() {
  return useQuery({
    queryKey: dataKeys.adminAdmins,
    queryFn: fetchAdminAdmins,
    staleTime: 10 * 60_000,
  });
}

export function useAdminOverviewQuery() {
  return useQuery({
    queryKey: dataKeys.adminOverview,
    queryFn: fetchAdminOverview,
    staleTime: 10 * 60_000,
  });
}

export function useReportsOverviewQuery(
  overviewPath: string,
  initialData?: Awaited<ReturnType<typeof fetchReportsOverview>>
) {
  return useQuery({
    queryKey: dataKeys.adminReportsOverview(overviewPath),
    queryFn: () => fetchReportsOverview(overviewPath),
    staleTime: 5 * 60_000,
    initialData,
  });
}

export function useInstitutionDashboardQuery() {
  return useQuery({
    queryKey: dataKeys.adminInstitutionDashboard,
    queryFn: fetchInstitutionDashboard,
    staleTime: 5 * 60_000,
  });
}

export function useAdminSubjectScoresQuery() {
  return useQuery({
    queryKey: dataKeys.adminSubjectScores,
    queryFn: () => fetchSubjectScores("/api/admin/reports/subject-scores"),
    staleTime: 5 * 60_000,
  });
}

export function useTeacherOmrTemplateQuery(enabled = true) {
  return useQuery({
    queryKey: dataKeys.teacherOmrTemplate,
    queryFn: fetchTeacherOmrTemplate,
    staleTime: 10 * 60_000,
    enabled,
  });
}

export function useTeacherCbtSettingsQuery(enabled = true) {
  return useQuery({
    queryKey: dataKeys.teacherCbtSettings,
    queryFn: fetchTeacherCbtSettings,
    staleTime: 10 * 60_000,
    enabled,
  });
}
