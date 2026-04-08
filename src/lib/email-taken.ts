import { prisma } from "@/lib/prisma";

/** True if the email exists on Admin, Teacher, or Student. */
export async function isEmailTaken(email: string): Promise<boolean> {
  const [a, t, s] = await Promise.all([
    prisma.admin.findUnique({ where: { email }, select: { id: true } }),
    prisma.teacher.findUnique({ where: { email }, select: { id: true } }),
    prisma.student.findUnique({ where: { email }, select: { id: true } }),
  ]);
  return !!(a || t || s);
}
