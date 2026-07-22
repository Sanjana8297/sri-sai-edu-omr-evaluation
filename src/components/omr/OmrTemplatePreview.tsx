import Image from "next/image";
import type { OmrExamPreset } from "@/lib/omr-template";
import {
  JEE_ADVANCE_EXAM_DURATION_HOURS,
  JEE_ADVANCE_OVERALL_INSTRUCTION_LINES,
  JEE_ADVANCE_INSTRUCTIONS_TITLE,
  advanceSubjectInstructionLines,
  totalExamMarksFromSubjects,
  type JeeAdvanceSubjectConfig,
} from "@/lib/jee-advance-exam-structure";
import {
  JEE_MAINS_EXAM_DURATION_HOURS,
  JEE_MAINS_INSTRUCTION_LINES,
  JEE_MAINS_INSTRUCTIONS_TITLE,
  JEE_MAINS_MAX_MARKS,
  JEE_MAINS_SECTION_INSTRUCTIONS,
} from "@/lib/jee-mains-exam-structure";
import {
  NEET_EXAM_DURATION_HOURS,
  NEET_INSTRUCTION_LINES,
  NEET_INSTRUCTIONS_TITLE,
  NEET_MAX_MARKS,
} from "@/lib/neet-exam-structure";

type OmrTemplatePreviewProps = {
  examPreset: OmrExamPreset;
  rollDigits: number;
  questionCount: number;
  sectionsLabel: string;
  advanceSubjects?: JeeAdvanceSubjectConfig[];
};

function PreviewHeader({
  examTitle,
  maxMarks,
  rollDigits,
  durationHours,
}: {
  examTitle: string;
  maxMarks: number;
  rollDigits: number;
  durationHours: number;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-2 border-black p-3">
      <div className="w-[240px] max-w-full">
        <Image
          src="/images/Sri-Sai-logo.png?v=20260722b"
          alt="Sri Sai Educational Institutions"
          width={240}
          height={85}
          unoptimized
          className="h-auto w-full object-contain"
        />
      </div>
      <div className="flex-1 text-right font-semibold">
        <p>{examTitle}</p>
        <p>Time: {durationHours.toFixed(2)} Hrs</p>
        <p>Max. Marks: {maxMarks}</p>
        <p>Roll grid: {rollDigits} columns</p>
      </div>
    </div>
  );
}

function OverallInstructionsBlock({ examPreset }: { examPreset: OmrExamPreset }) {
  if (examPreset === "NEET") {
    return (
      <div>
        <p className="font-bold">{NEET_INSTRUCTIONS_TITLE}</p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 leading-5">
          {NEET_INSTRUCTION_LINES.map((line) => (
            <li key={line.slice(0, 48)}>{line}</li>
          ))}
        </ol>
      </div>
    );
  }

  if (examPreset === "JEE_MAINS") {
    return (
      <div>
        <p className="font-bold">{JEE_MAINS_INSTRUCTIONS_TITLE}</p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 leading-5">
          {JEE_MAINS_INSTRUCTION_LINES.slice(0, 4).map((line) => (
            <li key={line.slice(0, 48)}>{line}</li>
          ))}
          <li>
            {JEE_MAINS_INSTRUCTION_LINES[4]}
            <ul className="mt-1.5 list-none space-y-2 pl-0">
              {JEE_MAINS_SECTION_INSTRUCTIONS.map((section) => (
                <li key={section.label}>
                  <p className="font-semibold">{section.label}</p>
                  <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
                    {section.lines.map((line) => (
                      <li key={line.slice(0, 48)}>{line}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </li>
        </ol>
      </div>
    );
  }

  return (
    <div>
      <p className="font-bold">{JEE_ADVANCE_INSTRUCTIONS_TITLE}</p>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 leading-5">
        {JEE_ADVANCE_OVERALL_INSTRUCTION_LINES.map((line) => (
          <li key={line.slice(0, 48)}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

function SectionWiseInstructionsBlock({
  examPreset,
  advanceSubjects,
}: {
  examPreset: OmrExamPreset;
  advanceSubjects: JeeAdvanceSubjectConfig[];
}) {
  if (examPreset === "JEE_ADVANCE" && advanceSubjects.length > 0) {
    return (
      <div className="space-y-3">
        {advanceSubjects.map((subject) => (
          <div key={subject.subject} className="border-t border-black pt-2 first:border-t-0 first:pt-0">
            {advanceSubjectInstructionLines(subject).map((line) => (
              <p key={line} className="leading-5">
                {line}
              </p>
            ))}
          </div>
        ))}
      </div>
    );
  }

  return null;
}

export function OmrTemplatePreview({
  examPreset,
  rollDigits,
  questionCount,
  sectionsLabel,
  advanceSubjects = [],
}: OmrTemplatePreviewProps) {
  const examTitle =
    examPreset === "NEET"
      ? "NEET (UG) MODEL"
      : examPreset === "JEE_MAINS"
        ? "JEE MAIN MODEL"
        : "JEE ADVANCE MODEL";

  const maxMarks =
    examPreset === "NEET"
      ? NEET_MAX_MARKS
      : examPreset === "JEE_MAINS"
        ? JEE_MAINS_MAX_MARKS
        : advanceSubjects.length > 0
          ? totalExamMarksFromSubjects(advanceSubjects)
          : 198;

  const durationHours =
    examPreset === "NEET"
      ? NEET_EXAM_DURATION_HOURS
      : examPreset === "JEE_MAINS"
        ? JEE_MAINS_EXAM_DURATION_HOURS
        : JEE_ADVANCE_EXAM_DURATION_HOURS;

  const hasSectionWise = examPreset === "JEE_ADVANCE";

  return (
    <div className="rounded-lg border-2 border-black bg-white p-4 text-[11px] text-black shadow-sm">
      <p className="mb-2 font-medium">Template preview</p>
      <PreviewHeader
        examTitle={examTitle}
        maxMarks={maxMarks}
        rollDigits={rollDigits}
        durationHours={durationHours}
      />
      <p className="mt-2 text-[10px] text-gray-700">
        {questionCount} bubbles · {sectionsLabel}
      </p>

      <div className="mt-3 border border-black p-3">
        <p className="mb-2 text-center text-[10px] font-bold uppercase tracking-wide">Overall instructions</p>
        <OverallInstructionsBlock examPreset={examPreset} />
      </div>

      {hasSectionWise ? (
        <div className="mt-3 border border-black p-3">
          <p className="mb-2 text-center text-[10px] font-bold uppercase tracking-wide">
            Section instructions
          </p>
          <SectionWiseInstructionsBlock examPreset={examPreset} advanceSubjects={advanceSubjects} />
        </div>
      ) : null}
    </div>
  );
}
