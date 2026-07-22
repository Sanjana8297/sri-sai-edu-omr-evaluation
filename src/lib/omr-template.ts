import {
  JEE_ADVANCE_EXAM_DURATION_HOURS,
  JEE_ADVANCE_QUESTIONS_PER_SUBJECT,
  buildDefaultAdvanceSubjects,
} from "@/lib/jee-advance-exam-structure";

export type OmrExamPreset = "NEET" | "JEE_MAINS" | "JEE_ADVANCE";

export type OmrTrack = "NEET" | "JEE" | "JEE_MAINS" | "JEE_ADVANCE";

export type JeeAdvanceSubjectConfig = {
  subject: string;
  sectionCounts: {
    section1: number;
    section2: number;
    section3: number;
  };
};

export type OmrTemplateSettings = {
  track: OmrTrack;
  rollDigits: number;
  examPreset?: OmrExamPreset;
  advance?: {
    examDurationHours: number;
    questionsPerSubject: number;
    subjects: JeeAdvanceSubjectConfig[];
  };
};

export const DEFAULT_OMR_TEMPLATE: OmrTemplateSettings = {
  track: "NEET",
  rollDigits: 10,
  examPreset: "NEET",
};

export function parseOmrTemplateSettings(raw: unknown): OmrTemplateSettings {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_OMR_TEMPLATE };
  }
  const o = raw as Record<string, unknown>;
  const trackRaw = o.track;
  const track: OmrTrack =
    trackRaw === "JEE" || trackRaw === "JEE_MAINS" || trackRaw === "JEE_ADVANCE"
      ? trackRaw
      : "NEET";
  const rollDigits = Number(o.rollDigits);

  let advance: OmrTemplateSettings["advance"];
  if (o.advance && typeof o.advance === "object") {
    const a = o.advance as Record<string, unknown>;
    const subjectsRaw = a.subjects;
    const subjects: JeeAdvanceSubjectConfig[] = Array.isArray(subjectsRaw)
      ? (subjectsRaw as JeeAdvanceSubjectConfig[])
      : buildDefaultAdvanceSubjects();
    advance = {
      examDurationHours:
        typeof a.examDurationHours === "number" && a.examDurationHours > 0
          ? a.examDurationHours
          : JEE_ADVANCE_EXAM_DURATION_HOURS,
      questionsPerSubject:
        typeof a.questionsPerSubject === "number" && a.questionsPerSubject > 0
          ? Math.round(a.questionsPerSubject)
          : JEE_ADVANCE_QUESTIONS_PER_SUBJECT,
      subjects: subjects.map((s) => ({
        subject: String(s.subject ?? "Subject"),
        sectionCounts: {
          section1: Math.max(0, Number(s.sectionCounts?.section1) || 0),
          section2: Math.max(0, Number(s.sectionCounts?.section2) || 0),
          section3: Math.max(0, Number(s.sectionCounts?.section3) || 0),
        },
      })),
    };
  } else if (track === "JEE_ADVANCE") {
    advance = {
      examDurationHours: JEE_ADVANCE_EXAM_DURATION_HOURS,
      questionsPerSubject: JEE_ADVANCE_QUESTIONS_PER_SUBJECT,
      subjects: buildDefaultAdvanceSubjects(),
    };
  }

  const examPreset: OmrExamPreset | undefined =
    o.examPreset === "NEET" || o.examPreset === "JEE_MAINS" || o.examPreset === "JEE_ADVANCE"
      ? o.examPreset
      : track === "JEE_ADVANCE"
        ? "JEE_ADVANCE"
        : track === "JEE" || track === "JEE_MAINS"
          ? "JEE_MAINS"
          : "NEET";

  return {
    track,
    rollDigits:
      Number.isFinite(rollDigits) && rollDigits >= 5 && rollDigits <= 12
        ? Math.round(rollDigits)
        : DEFAULT_OMR_TEMPLATE.rollDigits,
    examPreset,
    advance,
  };
}

export function isJeeAdvanceSettings(settings: OmrTemplateSettings): boolean {
  return settings.examPreset === "JEE_ADVANCE" || settings.track === "JEE_ADVANCE";
}
