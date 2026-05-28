import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { DEFAULT_CBT_SETTINGS, parseCbtSettings, type CbtSettings } from "@/lib/cbt-settings";
import { getTeacherCbtDefaults, setTeacherCbtDefaults } from "@/lib/cbt-settings-db";

export async function GET() {
  try {
    const { session, response } = await requireRoles(["TEACHER"]);
    if (response) return response;

    const settings = await getTeacherCbtDefaults(session.sub);
    return NextResponse.json({ settings });
  } catch (error) {
    console.error("[cbt-settings GET]", error);
    return NextResponse.json({ settings: DEFAULT_CBT_SETTINGS });
  }
}

export async function PATCH(request: Request) {
  try {
    const { session, response } = await requireRoles(["TEACHER"]);
    if (response) return response;

    let body: Partial<CbtSettings>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const current = await getTeacherCbtDefaults(session.sub);
    const merged: CbtSettings = {
      ...current,
      ...body,
      bilingualMode:
        body.bilingualMode === "en" || body.bilingualMode === "hi" || body.bilingualMode === "both"
          ? body.bilingualMode
          : current.bilingualMode,
    };

    await setTeacherCbtDefaults(session.sub, merged);
    return NextResponse.json({ settings: merged });
  } catch (error) {
    console.error("[cbt-settings PATCH]", error);
    return NextResponse.json({ error: "Could not save CBT settings" }, { status: 500 });
  }
}
