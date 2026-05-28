import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { validateSubjectSectionCounts } from "@/lib/jee-advance-exam-structure";
import { parseOmrTemplateSettings, type OmrTemplateSettings } from "@/lib/omr-template";
import { getTeacherOmrTemplate, setTeacherOmrTemplate } from "@/lib/omr-template-db";

export const dynamic = "force-dynamic";

export async function GET() {
  const { session, response } = await requireRoles(["TEACHER"]);
  if (response) return response;

  try {
    const settings = await getTeacherOmrTemplate(session.sub);
    return NextResponse.json({ settings });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not load OMR template";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const { session, response } = await requireRoles(["TEACHER"]);
  if (response) return response;

  let body: Partial<OmrTemplateSettings>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const current = await getTeacherOmrTemplate(session.sub);
  const merged = parseOmrTemplateSettings({
    track: body.track ?? current.track,
    rollDigits: body.rollDigits ?? current.rollDigits,
    examPreset: body.examPreset ?? current.examPreset,
    advance: body.advance ?? current.advance,
  });

  if (merged.examPreset === "JEE_ADVANCE" || merged.track === "JEE_ADVANCE") {
    const subjects = merged.advance?.subjects ?? [];
    for (const s of subjects) {
      const err = validateSubjectSectionCounts(s.sectionCounts);
      if (err) {
        return NextResponse.json({ error: `${s.subject}: ${err}` }, { status: 400 });
      }
    }
  }

  try {
    await setTeacherOmrTemplate(session.sub, merged);
    return NextResponse.json({ settings: merged });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not save OMR template";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
