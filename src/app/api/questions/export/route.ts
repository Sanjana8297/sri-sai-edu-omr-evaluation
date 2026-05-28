import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { exportQuestionsCsv, exportQuestionsForPdf } from "@/lib/questions/export-questions";
import { parseFiltersFromBody } from "@/lib/questions/parse-filters";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { session, response } = await requireRoles(["TEACHER"]);
  if (response) return response;

  const me = await prisma.teacher.findUnique({
    where: { id: session.sub },
    select: { category: true },
  });
  if (!me) {
    return NextResponse.json({ error: "Invalid teacher profile" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const format = body.format === "pdf" ? "pdf" : "csv";
  const filters = parseFiltersFromBody(body, me.category);
  const subjectLabel =
    typeof body.subjectLabel === "string" ? body.subjectLabel : filters.subject ?? "export";

  if (format === "csv") {
    const csv = await exportQuestionsCsv(filters);
    const filename = `question-bank-${subjectLabel.replace(/\s+/g, "-")}-export.csv`;
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  const rows = await exportQuestionsForPdf(filters);
  return NextResponse.json(
    { rows, subjectLabel, format: "pdf" as const },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
