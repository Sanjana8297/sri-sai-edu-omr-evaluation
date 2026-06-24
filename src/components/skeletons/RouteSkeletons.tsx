import { CardListSkeleton } from "@/components/skeletons/DashboardSkeletons";
import { StatsRowSkeleton } from "@/components/skeletons/DashboardSkeletons";
import { TableSkeleton } from "@/components/skeletons/DashboardSkeletons";

export function TeacherExamsLoading() {
  return <CardListSkeleton count={2} />;
}

export function TeacherResultReportsLoading() {
  return <StatsRowSkeleton />;
}

export function TeacherAllPapersLoading() {
  return <CardListSkeleton count={4} />;
}

export function AdminUserManagementLoading() {
  return <TableSkeleton rows={8} />;
}

export function AdminReportsLoading() {
  return <StatsRowSkeleton />;
}

export function AdminLlmSettingsLoading() {
  return <CardListSkeleton count={2} />;
}

export function StudentPerformanceLoading() {
  return <StatsRowSkeleton />;
}
