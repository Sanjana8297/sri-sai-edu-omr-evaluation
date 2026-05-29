import {
  JEE_MAINS_EXAM_DURATION_HOURS,
  JEE_MAINS_INSTRUCTION_LINES,
  JEE_MAINS_INSTRUCTIONS_TITLE,
  JEE_MAINS_MAX_MARKS,
  JEE_MAINS_QUESTIONS_PER_SUBJECT,
  JEE_MAINS_SECTION_INSTRUCTIONS,
  JEE_MAINS_SUBJECTS,
  JEE_MAINS_TOTAL_QUESTIONS,
} from "@/lib/jee-mains-exam-structure";

type JeeMainsInstructionsPanelProps = {
  className?: string;
  showSummary?: boolean;
};

export function JeeMainsInstructionsPanel({ className = "", showSummary = false }: JeeMainsInstructionsPanelProps) {
  return (
    <div className={className}>
      {showSummary ? (
        <p className="mb-3 text-xs text-[var(--muted)]">
          JEE Main template · {JEE_MAINS_EXAM_DURATION_HOURS} hours · {JEE_MAINS_TOTAL_QUESTIONS} questions ·{" "}
          {JEE_MAINS_SUBJECTS.map((s) => `${JEE_MAINS_QUESTIONS_PER_SUBJECT} ${s}`).join(", ")} · Max marks{" "}
          {JEE_MAINS_MAX_MARKS} (Section I: +4/−1 · Section II: numerical)
        </p>
      ) : null}
      <p className="text-sm font-semibold">{JEE_MAINS_INSTRUCTIONS_TITLE}</p>
      <ol className="mt-3 list-decimal space-y-2.5 pl-5 text-sm leading-relaxed text-[var(--foreground)]">
        {JEE_MAINS_INSTRUCTION_LINES.slice(0, 4).map((line) => (
          <li key={line.slice(0, 40)} className="pl-1">
            {line}
          </li>
        ))}
        <li className="pl-1">
          {JEE_MAINS_INSTRUCTION_LINES[4]}
          <ul className="mt-2 list-none space-y-3 pl-0">
            {JEE_MAINS_SECTION_INSTRUCTIONS.map((section) => (
              <li key={section.label}>
                <p className="font-medium">{section.label}</p>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {section.lines.map((line) => (
                    <li key={line.slice(0, 40)}>{line}</li>
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
