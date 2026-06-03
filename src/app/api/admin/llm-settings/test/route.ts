import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { testLlmConnection } from "@/lib/openai-runtime";

export const dynamic = "force-dynamic";

export async function POST() {
  const { response } = await requireRoles(["ADMIN"]);
  if (response) return response;

  try {
    const result = await testLlmConnection();
    return NextResponse.json(result, { status: result.ok ? 200 : 503 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Connection test failed";
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}
