import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { getLlmSettingsForAdmin, updateLlmSettings } from "@/lib/openai-runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  const { response } = await requireRoles(["ADMIN"]);
  if (response) return response;

  try {
    const settings = await getLlmSettingsForAdmin();
    return NextResponse.json(settings);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not load LLM settings";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const { session, response } = await requireRoles(["ADMIN"]);
  if (response) return response;

  let body: {
    model?: string;
    baseUrl?: string;
    apiKey?: string;
    clearApiKey?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const model = typeof body.model === "string" ? body.model : "";
  const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl : "";

  if (!model.trim() || !baseUrl.trim()) {
    return NextResponse.json({ error: "Model and base URL are required" }, { status: 400 });
  }

  try {
    const settings = await updateLlmSettings({
      model,
      baseUrl,
      apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
      clearApiKey: body.clearApiKey === true,
      adminId: session.sub,
    });
    return NextResponse.json(settings);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not save settings";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
