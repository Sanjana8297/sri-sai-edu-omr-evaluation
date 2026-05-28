import { prisma } from "@/lib/prisma";
import {
  DEFAULT_OMR_TEMPLATE,
  parseOmrTemplateSettings,
  type OmrTemplateSettings,
} from "@/lib/omr-template";

export async function getTeacherOmrTemplate(teacherId: string): Promise<OmrTemplateSettings> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ omrDefaults: unknown }>>(
      `SELECT "omrDefaults" FROM "Teacher" WHERE id = $1 LIMIT 1`,
      teacherId
    );
    return parseOmrTemplateSettings(rows[0]?.omrDefaults ?? null);
  } catch {
    return { ...DEFAULT_OMR_TEMPLATE };
  }
}

export async function setTeacherOmrTemplate(
  teacherId: string,
  settings: OmrTemplateSettings
): Promise<void> {
  const json = JSON.stringify(settings);
  await prisma.$executeRawUnsafe(
    `UPDATE "Teacher" SET "omrDefaults" = $1::jsonb WHERE id = $2`,
    json,
    teacherId
  );
}
