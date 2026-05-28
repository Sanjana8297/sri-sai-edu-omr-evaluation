"use client";

import {
  JEE_ADVANCE_EXAM_DURATION_HOURS,
  JEE_ADVANCE_QUESTIONS_PER_SUBJECT,
  JEE_ADVANCE_SECTION_MARKS,
  sectionMarksFromCounts,
  totalExamMarksFromSubjects,
  validateSubjectSectionCounts,
  type JeeAdvanceSubjectConfig,
} from "@/lib/jee-advance-exam-structure";

type Props = {
  subjects: JeeAdvanceSubjectConfig[];
  onChange: (subjects: JeeAdvanceSubjectConfig[]) => void;
};

function updateSectionCount(
  subjects: JeeAdvanceSubjectConfig[],
  subjectIndex: number,
  section: "section1" | "section2" | "section3",
  value: number
): JeeAdvanceSubjectConfig[] {
  return subjects.map((s, i) =>
    i === subjectIndex
      ? {
          ...s,
          sectionCounts: {
            ...s.sectionCounts,
            [section]: Math.max(0, Math.floor(value) || 0),
          },
        }
      : s
  );
}

export function JeeAdvanceStructurePanel({ subjects, onChange }: Props) {
  const grandTotal = totalExamMarksFromSubjects(subjects);

  return (
    <div className="space-y-4 rounded-lg border-2 border-black bg-white p-4 text-[11px] text-black shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-black pb-3">
        <div>
          <p className="font-bold uppercase tracking-wide">JEE Advance — exam structure</p>
          <p className="mt-1 text-[10px]">
            Duration: <strong>{JEE_ADVANCE_EXAM_DURATION_HOURS} hours</strong> (fixed) · Questions per
            subject: <strong>{JEE_ADVANCE_QUESTIONS_PER_SUBJECT}</strong> (fixed)
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase text-neutral-600">Total exam marks</p>
          <p className="text-lg font-bold">{grandTotal}</p>
          <p className="text-[10px] text-neutral-600">Varies with section counts</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-left">
          <thead>
            <tr className="border-b border-black bg-neutral-50">
              <th className="px-2 py-1.5 font-semibold">Section</th>
              <th className="px-2 py-1.5 font-semibold">Type</th>
              <th className="px-2 py-1.5 text-center font-semibold">+Ve</th>
              <th className="px-2 py-1.5 text-center font-semibold">−Ve</th>
              <th className="px-2 py-1.5 text-center font-semibold">Qs (edit)</th>
              <th className="px-2 py-1.5 text-right font-semibold">Section marks</th>
            </tr>
          </thead>
          <tbody>
            {(["section1", "section2", "section3"] as const).map((key) => {
              const meta = JEE_ADVANCE_SECTION_MARKS[key];
              return (
                <tr key={key} className="border-b border-neutral-200">
                  <td className="px-2 py-1.5 font-medium">{meta.label}</td>
                  <td className="px-2 py-1.5">{meta.subtitle}</td>
                  <td className="px-2 py-1.5 text-center">+{meta.correct}</td>
                  <td className="px-2 py-1.5 text-center">{meta.wrong}</td>
                  <td className="px-2 py-1.5 text-center text-neutral-500">—</td>
                  <td className="px-2 py-1.5 text-right text-neutral-500">per subject ↓</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {subjects.map((subject, subjectIndex) => {
        const marks = sectionMarksFromCounts(subject.sectionCounts);
        const validation = validateSubjectSectionCounts(subject.sectionCounts);
        const sum =
          subject.sectionCounts.section1 +
          subject.sectionCounts.section2 +
          subject.sectionCounts.section3;

        return (
          <div key={subject.subject} className="rounded border border-black p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold uppercase">{subject.subject}</p>
              <p className="text-[10px]">
                Subject total: <strong>{marks.total}</strong> marks · {sum} /{" "}
                {JEE_ADVANCE_QUESTIONS_PER_SUBJECT} questions
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {(["section1", "section2", "section3"] as const).map((key) => {
                const meta = JEE_ADVANCE_SECTION_MARKS[key];
                const count = subject.sectionCounts[key];
                const sectionMarks = marks[key];
                return (
                  <label key={key} className="block text-[10px]">
                    {meta.label} — No. of Qs
                    <input
                      type="number"
                      min={0}
                      max={JEE_ADVANCE_QUESTIONS_PER_SUBJECT}
                      value={count}
                      onChange={(e) =>
                        onChange(
                          updateSectionCount(
                            subjects,
                            subjectIndex,
                            key,
                            Number(e.target.value)
                          )
                        )
                      }
                      className="mt-1 w-full rounded border border-neutral-400 px-2 py-1.5 text-sm text-black"
                    />
                    <span className="mt-0.5 block text-neutral-600">
                      +{meta.correct}/−{Math.abs(meta.wrong)} · {sectionMarks} marks
                    </span>
                  </label>
                );
              })}
            </div>
            {validation ? (
              <p className="mt-2 text-[10px] font-medium text-red-700">{validation}</p>
            ) : null}
          </div>
        );
      })}

      <p className="text-[10px] leading-relaxed text-neutral-700">
        Section marks = (+Ve marks) × (number of questions). Exam total is the sum across Mathematics,
        Physics, and Chemistry. Partial marking (+1 per correct option) applies in Section II during
        scoring; the template total uses full marks per question.
      </p>
    </div>
  );
}
