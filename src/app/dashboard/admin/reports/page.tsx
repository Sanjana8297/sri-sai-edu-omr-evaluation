import { getAdminReportsOverviewServer } from "@/lib/server/dashboard-data";
import type { fetchReportsOverview } from "@/lib/data/fetchers";
import { AdminReportsClient } from "./admin-reports-client";

export default async function AdminReportsPage() {
  const initialOverview = await getAdminReportsOverviewServer();
  return (
    <AdminReportsClient
      initialOverview={
        (initialOverview ?? undefined) as Awaited<ReturnType<typeof fetchReportsOverview>> | undefined
      }
    />
  );
}
