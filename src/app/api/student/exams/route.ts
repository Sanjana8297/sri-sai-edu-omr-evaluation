import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/api-auth";

export async function GET() {
  const { session, response } = await requireRoles(["STUDENT"]);
  if (response) return response;

  const exams = await prisma.examAttempt.findMany({
    where: { studentId: session.sub },
    orderBy: { examDate: "desc" },
  });

  const enriched = exams.map((e) => ({
    ...e,
    examDate: e.examDate.toISOString(),
    percentage: e.maxMarks > 0 ? Math.round((e.marksObtained / e.maxMarks) * 1000) / 10 : 0,
  }));

  return NextResponse.json({ exams: enriched });
}
