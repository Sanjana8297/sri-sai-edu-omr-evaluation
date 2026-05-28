import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { listQuestions } from "@/lib/questions/list-questions";
import { parseFiltersFromSearchParams } from "@/lib/questions/parse-filters";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { session, response } = await requireRoles(["TEACHER"]);
  if (response) return response;

  const me = await prisma.teacher.findUnique({
    where: { id: session.sub },
    select: { category: true },
  });
  if (!me) {
    return NextResponse.json({ error: "Invalid teacher profile" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const filters = parseFiltersFromSearchParams(searchParams, me.category);
  const limit = Number(searchParams.get("limit") ?? "40");
  const offset = Number(searchParams.get("offset") ?? "0");
  const includeTotal = searchParams.get("includeTotal") === "true";
  const fullRows = searchParams.get("fullRows") === "true";

  const result = await listQuestions({
    ...filters,
    limit,
    offset,
    includeTotal,
    fullRows,
  });

  return NextResponse.json(result, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
