"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSetDashboardPage } from "@/components/dashboard/DashboardPageContext";
import { useMeQuery } from "@/hooks/data/use-me";
import { JeeAdvanceStructurePanel } from "@/components/omr/JeeAdvanceStructurePanel";
import {
  JEE_ADVANCE_EXAM_DURATION_HOURS,
  buildDefaultAdvanceSubjects,
  totalExamMarksFromSubjects,
  validateSubjectSectionCounts,
  type JeeAdvanceSubjectConfig,
} from "@/lib/jee-advance-exam-structure";
import { getJeeAdvanceTotalQuestions } from "@/lib/jee-advance-paper-builder";
import { formatQuestionTextForDisplay } from "@/lib/question-text";
import { parseQuestionPaperContentWithOptions } from "@/lib/exam-paper-parser";
import {
  mergeKeyChunk,
  mergeQuestionChunk,
  planComposeChunks,
} from "@/lib/ai-paper-config";
import { NeetInstructionsPanel } from "@/components/exam/NeetInstructionsPanel";
import { JeeMainsInstructionsPanel } from "@/components/exam/JeeMainsInstructionsPanel";
import type { TeacherTrack } from "@/lib/dashboard-nav";
import {
  dashBlock,
  dashBtnPrimary,
  dashBtnSecondary,
  dashInput,
  dashPanel,
  dashSelect,
} from "@/lib/dashboard-ui";

type AiTrackProfile = "JEE" | "JEE ADV" | "NEET";

const AI_TRACK_OPTIONS: { value: AiTrackProfile; label: string; teacherTrack: TeacherTrack }[] = [
  { value: "JEE", label: "JEE MAINS", teacherTrack: "JEE" },
  { value: "JEE ADV", label: "JEE ADV", teacherTrack: "JEE" },
  { value: "NEET", label: "NEET", teacherTrack: "NEET" },
];

function trackOptionsForTeacher(teacherTrack: TeacherTrack) {
  return AI_TRACK_OPTIONS.filter((option) => option.teacherTrack === teacherTrack);
}

type DifficultyLevel = "easy" | "medium" | "hard";
type ExamSection = {
  name: string;
  questionCount: number;
  marksPerQuestion: number;
  negativeMarks: number;
  topicFocus?: string[];
  difficulty: DifficultyLevel;
};
type PaperBlueprint = {
  category: "JEE" | "NEET";
  subject: string;
  durationMinutes: number;
  totalQuestions: number;
  totalMarks: number;
  instructions: string[];
  sections: ExamSection[];
};

export default function TeacherAiBuilderPage() {
  useSetDashboardPage({
    title: "AI Question Paper Generator",
    subtitle: "Generate blueprint, compose paper, validate, and save.",
  });

  const [teacherTrack, setTeacherTrack] = useState<TeacherTrack | null>(null);
  const [aiTrackProfile, setAiTrackProfile] = useState<AiTrackProfile>("JEE");
  const [advanceSubjects, setAdvanceSubjects] = useState<JeeAdvanceSubjectConfig[]>(
    buildDefaultAdvanceSubjects
  );
  const [title, setTitle] = useState("");
  const [questionContent, setQuestionContent] = useState("");
  const [keyContent, setKeyContent] = useState("");
  const [aiDurationMinutes, setAiDurationMinutes] = useState(180);
  const [aiTotalQuestions, setAiTotalQuestions] = useState(75);
  const [aiTotalMarks, setAiTotalMarks] = useState(300);
  const [aiDifficultyDistribution, setAiDifficultyDistribution] = useState("30% easy, 50% medium, 20% hard");
  const [aiExtraInstructions, setAiExtraInstructions] = useState("");
  const [blueprint, setBlueprint] = useState<PaperBlueprint | null>(null);
  const [aiWarnings, setAiWarnings] = useState<string[]>([]);
  const [aiValidationIssues, setAiValidationIssues] = useState<string[]>([]);
  const [aiValidationPasses, setAiValidationPasses] = useState<string[]>([]);
  const [aiComposed, setAiComposed] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [loadingBlueprint, setLoadingBlueprint] = useState(false);
  const [loadingCompose, setLoadingCompose] = useState(false);
  const [loadingValidate, setLoadingValidate] = useState(false);
  const [loadingSave, setLoadingSave] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const availableTrackOptions = useMemo(
    () => (teacherTrack ? trackOptionsForTeacher(teacherTrack) : []),
    [teacherTrack]
  );

  const { data: meData } = useMeQuery();

  useEffect(() => {
    const category = meData?.user?.category;
    if (category === "JEE" || category === "NEET") {
      setTeacherTrack(category);
      const options = trackOptionsForTeacher(category);
      setAiTrackProfile((prev) =>
        options.some((option) => option.value === prev) ? prev : options[0]?.value ?? "JEE"
      );
    }
  }, [meData?.user?.category]);

  const advanceTotalMarks = useMemo(
    () => totalExamMarksFromSubjects(advanceSubjects),
    [advanceSubjects]
  );
  const advanceTotalQuestions = useMemo(
    () => getJeeAdvanceTotalQuestions(advanceSubjects),
    [advanceSubjects]
  );
  const composedPreview = useMemo(
    () =>
      questionContent.trim()
        ? parseQuestionPaperContentWithOptions(questionContent, keyContent)
        : { sections: [], flatQuestions: [], answerKey: {} as Record<string, string> },
    [questionContent, keyContent]
  );

  useEffect(() => {
    if (aiTrackProfile === "JEE") {
      setAiDurationMinutes(180);
      setAiTotalQuestions(75);
      setAiTotalMarks(300);
    }
    if (aiTrackProfile === "JEE ADV") {
      setAiDurationMinutes(JEE_ADVANCE_EXAM_DURATION_HOURS * 60);
      setAiTotalQuestions(advanceTotalQuestions);
      setAiTotalMarks(advanceTotalMarks);
    }
    if (aiTrackProfile === "NEET") {
      setAiDurationMinutes(180);
      setAiTotalQuestions(180);
      setAiTotalMarks(720);
    }
  }, [aiTrackProfile, advanceTotalQuestions, advanceTotalMarks]);

  async function generateBlueprint() {
    setErr(null);
    setMsg(null);
    if (aiTrackProfile === "JEE ADV") {
      for (const s of advanceSubjects) {
        const validationErr = validateSubjectSectionCounts(s.sectionCounts);
        if (validationErr) {
          setErr(`${s.subject}: ${validationErr}`);
          return;
        }
      }
    }
    setLoadingBlueprint(true);
    try {
      const res = await fetch("/api/teacher/question-papers/ai/blueprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          durationMinutes: aiDurationMinutes,
          difficultyDistribution: aiDifficultyDistribution.trim(),
          examProfile: aiTrackProfile,
          advanceSubjects: aiTrackProfile === "JEE ADV" ? advanceSubjects : undefined,
          extraInstructions: [aiExtraInstructions.trim(), `Target exam profile: ${aiTrackProfile}`]
            .filter(Boolean)
            .join("\n"),
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setErr(j.error ?? "Could not generate blueprint");
        return;
      }
      setBlueprint(j.blueprint);
      setAiValidationIssues([]);
      setAiValidationPasses([]);
      setAiWarnings([]);
      setMsg("AI blueprint generated. You can now compose the paper.");
    } finally {
      setLoadingBlueprint(false);
    }
  }

  async function composePaper() {
    if (!blueprint) {
      setErr("Generate a blueprint first.");
      return;
    }
    setErr(null);
    setMsg(null);
    setLoadingCompose(true);
    try {
      const chunks = planComposeChunks(blueprint);
      let questionContent = "";
      let keyContent = "";
      const warnings: string[] = [];
      const paperTitle = title.trim() || `${blueprint.subject} Mock Test`;

      for (let i = 0; i < chunks.length; i += 1) {
        const chunk = chunks[i];
        setMsg(
          `Composing section ${chunk.section.name} (questions ${chunk.questionStart}–${chunk.questionStart + chunk.questionCount - 1})… ${i + 1}/${chunks.length}`
        );
        const res = await fetch("/api/teacher/question-papers/ai/compose-chunk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: paperTitle,
            blueprint,
            additionalConstraints: aiExtraInstructions.trim(),
            section: chunk.section,
            questionStart: chunk.questionStart,
            questionCount: chunk.questionCount,
          }),
        });
        const j = await res.json();
        if (!res.ok) {
          setErr(j.error ?? "Could not compose paper");
          return;
        }
        const generated = j.generated as {
          questionContent: string;
          keyContent: string;
          warnings: string[];
        };
        questionContent = mergeQuestionChunk(
          questionContent,
          chunk.section.name,
          generated.questionContent
        );
        keyContent = mergeKeyChunk(keyContent, chunk.section.name, generated.keyContent);
        warnings.push(...(generated.warnings ?? []));
      }

      setTitle(paperTitle);
      setQuestionContent(questionContent);
      setKeyContent(keyContent);
      setAiWarnings(warnings);
      setAiComposed(true);
      setShowPreview(true);
      setMsg("AI composed a full paper and answer key. Review and save.");
    } finally {
      setLoadingCompose(false);
    }
  }

  async function validatePaper() {
    if (!blueprint) {
      setErr("Generate a blueprint first.");
      return;
    }
    if (!questionContent.trim()) {
      setErr("Compose or enter question content first.");
      return;
    }
    setErr(null);
    setMsg(null);
    setLoadingValidate(true);
    try {
      const res = await fetch("/api/teacher/question-papers/ai/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blueprint,
          questionContent: questionContent.trim(),
          keyContent: keyContent.trim(),
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setErr(j.error ?? "Could not validate paper");
        return;
      }
      setAiValidationIssues(j.issues ?? []);
      setAiValidationPasses(j.passes ?? []);
      setMsg("AI validation complete.");
    } finally {
      setLoadingValidate(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    const trimmed = questionContent.trim();
    if (!blueprint) {
      setErr("Generate a blueprint first.");
      return;
    }
    if (!aiComposed || !trimmed) {
      setErr("Please use AI Compose before saving.");
      return;
    }
    const paperTitle = title.trim() || `${blueprint.subject} Mock Test`;
    if (!paperTitle) {
      setErr("Paper title is required.");
      return;
    }

    setLoadingSave(true);
    try {
      const res = await fetch("/api/teacher/question-papers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: paperTitle,
          questionContent: trimmed,
          keyContent: keyContent.trim(),
          category: blueprint.category,
          isAiGenerated: true,
          aiPromptVersion: "v1",
          aiConfig: blueprint,
          generationMeta: aiWarnings.length ? { warnings: aiWarnings } : null,
        }),
      });

      let j: { error?: string; paper?: { id: string } } = {};
      try {
        j = (await res.json()) as { error?: string; paper?: { id: string } };
      } catch {
        setErr(
          res.status === 413
            ? "Paper is too large to upload. Try a shorter paper or contact support."
            : `Could not save paper (HTTP ${res.status}).`
        );
        return;
      }

      if (!res.ok) {
        setErr(j.error ?? "Could not save paper");
        return;
      }

      setTitle("");
      setQuestionContent("");
      setKeyContent("");
      setBlueprint(null);
      setAiComposed(false);
      setAiWarnings([]);
      setShowPreview(false);
      setMsg(
        "Question paper saved. Use Exam Scheduling in the sidebar to schedule it, or find it in the paper list when scheduling."
      );
    } catch {
      setErr("Network error while saving. Check your connection and try again.");
    } finally {
      setLoadingSave(false);
    }
  }

  return (
      <div className={dashPanel}>
        <div className={`${dashBlock} mb-6`}>
          <p className="text-sm font-semibold">AI Paper Configuration</p>
          <p className="mt-1 text-xs text-[var(--muted)]">Generate blueprint, compose paper, then validate before saving.</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="text-xs text-[var(--muted)]">
              Track
              <select
                className={`${dashSelect} mt-1 w-full text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-70`}
                value={aiTrackProfile}
                onChange={(e) => setAiTrackProfile(e.target.value as AiTrackProfile)}
                disabled={!teacherTrack}
              >
                {availableTrackOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-[var(--muted)]">
              Duration (minutes)
              <input className={`${dashInput} mt-1`} type="number" min={1} max={480} value={aiDurationMinutes} onChange={(e) => setAiDurationMinutes(Number(e.target.value || 0))} disabled={aiTrackProfile === "JEE" || aiTrackProfile === "JEE ADV" || aiTrackProfile === "NEET"} />
            </label>
            <label className="text-xs text-[var(--muted)]">
              Total Questions
              <input
                className={`${dashInput} mt-1`}
                type="number"
                min={1}
                max={300}
                value={aiTotalQuestions}
                onChange={(e) => setAiTotalQuestions(Number(e.target.value || 0))}
                disabled={aiTrackProfile === "JEE" || aiTrackProfile === "JEE ADV" || aiTrackProfile === "NEET"}
              />
            </label>
            <label className="text-xs text-[var(--muted)]">
              Total Marks
              <input
                className={`${dashInput} mt-1`}
                type="number"
                value={aiTotalMarks}
                disabled={aiTrackProfile === "JEE" || aiTrackProfile === "JEE ADV" || aiTrackProfile === "NEET"}
                onChange={(e) => setAiTotalMarks(Number(e.target.value || 0))}
              />
            </label>
          </div>
          {aiTrackProfile === "JEE" ? (
            <div className={`${dashBlock} mt-3 text-xs text-[var(--muted)]`}>
              JEE Main format is fixed: 180 minutes (3 hours), Mathematics/Physics/Chemistry (25 questions each; 20 MCQ + 5 Numerical-with-options per subject), marking +4 / 0 / −1.
            </div>
          ) : null}
          {aiTrackProfile === "JEE ADV" ? (
            <div className="mt-3">
              <JeeAdvanceStructurePanel subjects={advanceSubjects} onChange={setAdvanceSubjects} />
            </div>
          ) : null}
          {aiTrackProfile === "NEET" ? (
            <div className={`${dashBlock} mt-3 text-xs text-[var(--muted)]`}>
              NEET format is fixed: 180 minutes (3 hours), 4 parts (Botany, Zoology, Physics, Chemistry), 45 questions each, total 180 questions, marking +4 / 0 / -1, total marks 720.
            </div>
          ) : null}
          <label className="mt-3 block text-xs text-[var(--muted)]">
            Difficulty Configuration
            <textarea className={`${dashInput} mt-1 min-h-[70px]`} placeholder="e.g., 30% easy, 50% medium, 20% hard" value={aiDifficultyDistribution} onChange={(e) => setAiDifficultyDistribution(e.target.value)} />
          </label>
          <label className="mt-3 block text-xs text-[var(--muted)]">
            Additional Constraints
            <textarea className={`${dashInput} mt-1 min-h-[90px]`} placeholder="Syllabus focus, question style, excluded topics, etc." value={aiExtraInstructions} onChange={(e) => setAiExtraInstructions(e.target.value)} />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={dashBtnPrimary} type="button" disabled={loadingBlueprint} onClick={generateBlueprint}>
              {loadingBlueprint ? "Generating blueprint..." : "1) Generate Blueprint"}
            </button>
            <button className={dashBtnPrimary} type="button" disabled={!blueprint || loadingCompose} onClick={composePaper}>
              {loadingCompose ? "Composing..." : "2) Compose Paper"}
            </button>
            <button className={dashBtnPrimary} type="button" disabled={!blueprint || loadingValidate} onClick={validatePaper}>
              {loadingValidate ? "Validating..." : "3) Validate"}
            </button>
            <button
              className={dashBtnSecondary}
              type="button"
              disabled={!aiComposed}
              onClick={() => setShowPreview((v) => !v)}
            >
              {showPreview ? "Hide Preview" : "Preview Composed Paper"}
            </button>
          </div>
          {blueprint ? <pre className="mt-3 max-h-64 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 text-xs">{JSON.stringify(blueprint, null, 2)}</pre> : null}
          {aiWarnings.length ? <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900"><p className="font-semibold">AI warnings</p><ul className="mt-1 list-disc pl-5">{aiWarnings.map((warning, idx) => <li key={`${warning}-${idx}`}>{warning}</li>)}</ul></div> : null}
          {aiValidationIssues.length ? <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-900"><p className="font-semibold">Validation issues</p><ul className="mt-1 list-disc pl-5">{aiValidationIssues.map((issue, idx) => <li key={`${issue}-${idx}`}>{issue}</li>)}</ul></div> : null}
          {aiValidationPasses.length ? <div className="mt-3 rounded-lg border border-green-300 bg-green-50 p-3 text-xs text-green-900"><p className="font-semibold">Validation checks passed</p><ul className="mt-1 list-disc pl-5">{aiValidationPasses.map((pass, idx) => <li key={`${pass}-${idx}`}>{pass}</li>)}</ul></div> : null}
          {showPreview && aiComposed ? (
            <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
              <p className="text-sm font-semibold">Preview: Composed Question Paper</p>
              {aiTrackProfile === "NEET" ? (
                <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
                  <NeetInstructionsPanel showSummary />
                </div>
              ) : null}
              {aiTrackProfile === "JEE" ? (
                <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
                  <JeeMainsInstructionsPanel showSummary />
                </div>
              ) : null}
              {composedPreview.sections.length > 0 ? (
                <div className="mt-2 max-h-80 space-y-4 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 text-xs">
                  {composedPreview.sections.map((section) => (
                    <section key={section.name}>
                      <p className="font-semibold">{section.name}</p>
                      <div className="mt-2 space-y-3">
                        {section.questions.map((q) => (
                          <article key={q.id} className="rounded border border-[var(--border)] p-2">
                            <p className="whitespace-pre-wrap">
                              Q{q.indexInSection}. {formatQuestionTextForDisplay(q.prompt)}
                            </p>
                            {q.options.length > 0 ? (
                              <ul className="mt-1 list-none space-y-0.5">
                                {q.options.map((opt) => (
                                  <li key={opt} className="whitespace-pre-wrap">
                                    {formatQuestionTextForDisplay(opt)}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </article>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 text-xs">
                  {questionContent
                    ? formatQuestionTextForDisplay(questionContent)
                    : "No question content composed yet."}
                </pre>
              )}
              <p className="mt-3 text-sm font-semibold">Preview: Composed Answer Key</p>
              <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 text-xs">
                {Object.keys(composedPreview.answerKey).length > 0
                  ? Object.entries(composedPreview.answerKey)
                      .map(([id, answer]) => `${id}: ${answer}`)
                      .join("\n")
                  : keyContent || "No answer key composed yet."}
              </pre>
            </div>
          ) : null}
        </div>

        <form className="space-y-3" onSubmit={submit}>
          <input className={dashInput} placeholder="Paper title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          {aiComposed ? (
            <p className="text-xs text-[var(--muted)]">
              AI content is generated and ready. Click save to store this paper.
            </p>
          ) : (
            <p className="text-xs text-[var(--muted)]">
              Run step 2 (Compose Paper) to generate question content before saving.
            </p>
          )}
          <button
            className={dashBtnPrimary}
            type="submit"
            disabled={!aiComposed || loadingSave}
          >
            {loadingSave ? "Saving…" : "Save paper"}
          </button>
        </form>
        {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}
        {msg ? <p className="mt-2 text-sm text-green-700">{msg}</p> : null}
      </div>
  );
}
