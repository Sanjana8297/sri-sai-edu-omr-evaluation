import {
  NEET_EXAM_DURATION_HOURS,
  NEET_INSTRUCTION_LINES,
  NEET_INSTRUCTIONS_TITLE,
  NEET_MAX_MARKS,
  NEET_QUESTIONS_PER_SUBJECT,
  NEET_SUBJECTS,
  NEET_TOTAL_QUESTIONS,
} from "@/lib/neet-exam-structure";

type NeetInstructionsPanelProps = {
  className?: string;
  /** Show duration / marks / subject summary above the numbered list. */
  showSummary?: boolean;
};

export function NeetInstructionsPanel({ className = "", showSummary = false }: NeetInstructionsPanelProps) {
  return (
    <div className={className}>
      {showSummary ? (
        <p className="mb-3 text-xs text-[var(--muted)]">
          NEET (UG) template · {NEET_EXAM_DURATION_HOURS} hours · {NEET_TOTAL_QUESTIONS} MCQs ·{" "}
          {NEET_SUBJECTS.map((s) => `${NEET_QUESTIONS_PER_SUBJECT} ${s}`).join(", ")} · Max marks{" "}
          {NEET_MAX_MARKS} (+4 / −1)
        </p>
      ) : null}
      <p className="text-sm font-semibold">{NEET_INSTRUCTIONS_TITLE}</p>
      <ol className="mt-3 list-decimal space-y-2.5 pl-5 text-sm leading-relaxed text-[var(--foreground)]">
        {NEET_INSTRUCTION_LINES.map((line) => (
          <li key={line.slice(0, 40)} className="pl-1">
            {line}
          </li>
        ))}
      </ol>
    </div>
  );
}
