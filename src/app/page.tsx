import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function Home() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  if (session.role === "ADMIN") redirect("/dashboard/admin");
  if (session.role === "TEACHER") redirect("/dashboard/teacher");
  redirect("/dashboard/student");
}
