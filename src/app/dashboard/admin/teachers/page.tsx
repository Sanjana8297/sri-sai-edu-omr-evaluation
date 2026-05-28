import { redirect } from "next/navigation";

export default function AdminTeachersRedirectPage() {
  redirect("/dashboard/admin/user-management?section=roles");
}
