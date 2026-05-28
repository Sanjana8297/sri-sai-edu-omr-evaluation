import { redirect } from "next/navigation";

export default function AdminPerformanceRedirectPage() {
  redirect("/dashboard/admin/reports?section=results");
}
