"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FeatureActivityHub, type ActivityFeature } from "@/components/FeatureActivityHub";
import { useMeQuery } from "@/hooks/data/use-me";
import { useTeacherQuestionPapersQuery } from "@/hooks/data/use-teacher-question-papers";
import { useTeacherStudentsQuery } from "@/hooks/data/use-teacher-students";
import { displayLoginId } from "@/lib/user-login-id";
import {
  useTeacherCbtSettingsQuery,
  useTeacherOmrTemplateQuery,
} from "@/hooks/data/use-admin-queries";
import { DEFAULT_CBT_SETTINGS, type CbtSettings } from "@/lib/cbt-settings";
import { JeeAdvanceStructurePanel } from "@/components/omr/JeeAdvanceStructurePanel";
import { OmrTemplatePreview } from "@/components/omr/OmrTemplatePreview";
import type { TeacherTrack } from "@/lib/dashboard-nav";
import {
  dashBlock,
  dashBtnPrimary,
  dashBtnSecondary,
  dashInput,
  dashPanel,
  dashSelect,
} from "@/lib/dashboard-ui";
import {
  JEE_ADVANCE_EXAM_DURATION_HOURS,
  JEE_ADVANCE_QUESTIONS_PER_SUBJECT,
  buildDefaultAdvanceSubjects,
  validateSubjectSectionCounts,
} from "@/lib/jee-advance-exam-structure";
import type { JeeAdvanceSubjectConfig, OmrExamPreset } from "@/lib/omr-template";
import {
  buildOmrBundlePdfBlob,
  buildOmrSheetPdfBlob,
  downloadOmrBundlePdf,
  downloadOmrSheetPdf,
  OMR_LAYOUT,
  printPdfBlob,
  type OmrTrack,
} from "@/lib/omr-pdf";

type Paper = { id: string; title: string; category: string; hasAnswerKey: boolean };

type OmrMatchedStudent = {
  id: string;
  name: string;
  rollNumber: string | null;
  matchedBy: "rollNumber" | "username" | "email";
};

type OmrEvaluationResult = {
  paper: { id: string; title: string };
  track: string;
  rollNumber: string | null;
  rollDigits?: Array<{
    position: number;
    digit: number | null;
    confidence: number;
    flagged: boolean;
  }>;
  matchedStudent: OmrMatchedStudent | null;
  submittedAnswers: Record<string, string>;
  score: {
    obtained: number;
    maximum: number;
    correct: number;
    wrong: number;
    unanswered: number;
    flagged: number;
  };
  issues: string[];
  breakdown: Array<{
    question: number;
    detected: string | null;
    expected: string;
    status: "correct" | "wrong" | "unanswered";
    confidence: number;
    flagged: boolean;
  }>;
};

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

type ExamPreset = OmrExamPreset;

const OMR_PRESET_OPTIONS: { value: ExamPreset; label: string; teacherTrack: TeacherTrack }[] = [
  { value: "NEET", label: "NEET", teacherTrack: "NEET" },
  { value: "JEE_MAINS", label: "JEE Main", teacherTrack: "JEE" },
  { value: "JEE_ADVANCE", label: "JEE Advance", teacherTrack: "JEE" },
];

function presetOptionsForTeacher(teacherTrack: TeacherTrack) {
  return OMR_PRESET_OPTIONS.filter((option) => option.teacherTrack === teacherTrack);
}

function clampPresetToTeacher(preset: ExamPreset, teacherTrack: TeacherTrack | null): ExamPreset {
  if (!teacherTrack) return preset;
  const options = presetOptionsForTeacher(teacherTrack);
  return options.some((option) => option.value === preset) ? preset : options[0]?.value ?? preset;
}

const OMR_ACTIVITIES: ActivityFeature[] = [
  { id: "template", title: "OMR template designer", description: "NEET / JEE Main / JEE Advance presets" },
  { id: "bundle", title: "Print-ready OMR + paper bundle", description: "Pair OMR with your question paper" },
  {
    id: "capture",
    title: "Camera / scanner capture + AI bubble-fill detection",
    description: "Upload sheets, tune detection sensitivity, and run mark detection in one place",
  },
  { id: "flags", title: "Error and smudge alert flags", description: "Highlight sheets that need manual review" },
];

const ONLINE_ACTIVITIES: ActivityFeature[] = [
  { id: "timer", title: "Timer + auto-submit", description: "Countdown and hard stop at zero" },
  { id: "palette", title: "Question palette", description: "NTA-style navigation during CBT" },
  { id: "proctoring", title: "Browser lock / anti-cheat", description: "Proctoring during live attempt" },
  { id: "offline", title: "Offline fallback sync", description: "Cache answers when connectivity drops" },
];

function presetToTrack(preset: ExamPreset): OmrTrack {
  if (preset === "JEE_ADVANCE") return "JEE_ADVANCE";
  if (preset === "JEE_MAINS") return "JEE_MAINS";
  return "NEET";
}

function trackToPreset(track: string | undefined): ExamPreset {
  if (track === "JEE_ADVANCE") return "JEE_ADVANCE";
  if (track === "JEE" || track === "JEE_MAINS") return "JEE_MAINS";
  return "NEET";
}

export function OmrSheetManagementPanel({ resetKey }: { resetKey?: string }) {
  const [teacherTrack, setTeacherTrack] = useState<TeacherTrack | null>(null);
  const [examPreset, setExamPreset] = useState<ExamPreset>("NEET");
  const [rollDigits, setRollDigits] = useState(10);
  const [advanceSubjects, setAdvanceSubjects] = useState<JeeAdvanceSubjectConfig[]>(
    buildDefaultAdvanceSubjects
  );
  const [bundlePaper, setBundlePaper] = useState("");
  const { data: papersData } = useTeacherQuestionPapersQuery();
  const papers: Paper[] = useMemo(
    () =>
      (papersData?.papers ?? []).map((p) => ({
        id: p.id,
        title: p.title,
        category: p.category,
        hasAnswerKey: Boolean(p.keyContent?.trim()),
      })),
    [papersData?.papers]
  );
  const { data: meData } = useMeQuery();
  const { data: templateData, isLoading: templateQueryLoading } = useTeacherOmrTemplateQuery();
  const [scanPaper, setScanPaper] = useState("");
  const [scanFile, setScanFile] = useState<File | null>(null);
  const [scanName, setScanName] = useState<string | null>(null);
  const [sensitivity, setSensitivity] = useState(80);
  const [flagSmudge, setFlagSmudge] = useState(true);
  const [flagDoubleMark, setFlagDoubleMark] = useState(true);
  const [flagBlankRoll, setFlagBlankRoll] = useState(true);
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanResult, setScanResult] = useState<OmrEvaluationResult | null>(null);
  const [scanStudentId, setScanStudentId] = useState("");
  const [scanSaving, setScanSaving] = useState(false);
  const [scanSavedMsg, setScanSavedMsg] = useState<string | null>(null);
  const { data: studentsData } = useTeacherStudentsQuery();
  const students = useMemo(() => studentsData?.students ?? [], [studentsData?.students]);
  const [bundleCopies, setBundleCopies] = useState(30);
  const [bundlePrintFormat, setBundlePrintFormat] = useState<"omr" | "full">("full");
  const [bundlePageSize, setBundlePageSize] = useState<"a4" | "b4">("a4");
  const [bundleLoading, setBundleLoading] = useState(false);
  const [bundleMsg, setBundleMsg] = useState<string | null>(null);
  const [bundleErr, setBundleErr] = useState<string | null>(null);
  const [templateLoading, setTemplateLoading] = useState(true);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateMsg, setTemplateMsg] = useState<string | null>(null);
  const [templateErr, setTemplateErr] = useState<string | null>(null);
  const [templateSavedForNextStep, setTemplateSavedForNextStep] = useState(false);

  const availablePresetOptions = useMemo(
    () => (teacherTrack ? presetOptionsForTeacher(teacherTrack) : []),
    [teacherTrack]
  );

  const omrTrack = presetToTrack(examPreset);
  const layout = OMR_LAYOUT[omrTrack];

  const selectedPaper = papers.find((p) => p.id === bundlePaper);

  const buildOmrOpts = useCallback(
    (title: string) => ({
      track: omrTrack,
      rollDigits,
      paperTitle: title,
      questionCount: layout.questions,
      sectionsLabel: layout.sections,
      copies: bundleCopies,
      pageSize: bundlePageSize,
      advance:
        examPreset === "JEE_ADVANCE"
          ? {
              examDurationHours: JEE_ADVANCE_EXAM_DURATION_HOURS,
              questionsPerSubject: JEE_ADVANCE_QUESTIONS_PER_SUBJECT,
              subjects: advanceSubjects,
            }
          : undefined,
    }),
    [omrTrack, rollDigits, layout, bundleCopies, bundlePageSize, examPreset, advanceSubjects]
  );

  const loadPaperForBundle = useCallback(async () => {
    if (!bundlePaper) return null;
    const res = await fetch(`/api/teacher/question-papers/${encodeURIComponent(bundlePaper)}`);
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error ?? "Could not load question paper");
    }
    const paper = json.paper as {
      title: string;
      questionContent: string;
      keyContent?: string | null;
      questionPaperUrl?: string | null;
    };
    if (!paper.questionContent?.trim() && paper.questionPaperUrl) {
      throw new Error(
        "This paper is stored as an uploaded file only. Add question text in the paper editor to include it in the bundle, or download the file from Archived Question Papers."
      );
    }
    if (!paper.questionContent?.trim()) {
      throw new Error("This question paper has no text content to bundle.");
    }
    return paper;
  }, [bundlePaper]);

  const downloadOmrOnly = useCallback(async () => {
    if (!bundlePaper) return;
    setBundleLoading(true);
    setBundleErr(null);
    setBundleMsg(null);
    try {
      const title = selectedPaper?.title ?? "OMR Sheet";
      await downloadOmrSheetPdf(buildOmrOpts(title));
      setBundleMsg("OMR PDF downloaded.");
    } catch (e) {
      setBundleErr(e instanceof Error ? e.message : "Could not generate OMR PDF.");
    } finally {
      setBundleLoading(false);
    }
  }, [bundlePaper, selectedPaper, buildOmrOpts]);

  const downloadFullBundle = useCallback(async () => {
    if (!bundlePaper) return;
    setBundleLoading(true);
    setBundleErr(null);
    setBundleMsg(null);
    try {
      const paper = await loadPaperForBundle();
      if (!paper) return;
      await downloadOmrBundlePdf({
        ...buildOmrOpts(paper.title),
        questionContent: paper.questionContent,
        keyContent: paper.keyContent ?? null,
      });
      setBundleMsg("Full bundle PDF downloaded (question paper + OMR sheet).");
    } catch (e) {
      setBundleErr(e instanceof Error ? e.message : "Could not generate bundle PDF.");
    } finally {
      setBundleLoading(false);
    }
  }, [bundlePaper, buildOmrOpts, loadPaperForBundle]);

  const printBundle = useCallback(async () => {
    if (!bundlePaper) return;
    setBundleLoading(true);
    setBundleErr(null);
    setBundleMsg(null);
    try {
      let blob: Blob;
      if (bundlePrintFormat === "omr") {
        const title = selectedPaper?.title ?? "OMR Sheet";
        blob = await buildOmrSheetPdfBlob(buildOmrOpts(title));
      } else {
        const paper = await loadPaperForBundle();
        if (!paper) return;
        blob = await buildOmrBundlePdfBlob({
          ...buildOmrOpts(paper.title),
          questionContent: paper.questionContent,
          keyContent: paper.keyContent ?? null,
        });
      }
      await printPdfBlob(blob);
      setBundleMsg(
        `Print dialog opened for ${bundlePrintFormat === "omr" ? "OMR sheets" : "full bundle"} (${bundleCopies} OMR ${bundleCopies === 1 ? "copy" : "copies"}, ${bundlePageSize.toUpperCase()}). Choose a connected printer and confirm.`
      );
    } catch (e) {
      setBundleErr(e instanceof Error ? e.message : "Could not print. Try downloading the PDF instead.");
    } finally {
      setBundleLoading(false);
    }
  }, [
    bundlePaper,
    bundlePrintFormat,
    bundleCopies,
    bundlePageSize,
    selectedPaper,
    buildOmrOpts,
    loadPaperForBundle,
  ]);

  useEffect(() => {
    if (templateQueryLoading) {
      setTemplateLoading(true);
      return;
    }
    setTemplateLoading(false);
    setTemplateErr(null);
    try {
      let track: TeacherTrack | null = null;
      const category = meData?.user?.category;
      if (category === "JEE" || category === "NEET") {
        track = category;
        setTeacherTrack(category);
      }
      const json = templateData as { settings?: {
        track?: string;
        rollDigits?: number;
        examPreset?: ExamPreset;
        advance?: { subjects?: JeeAdvanceSubjectConfig[] };
      } } | undefined;
      if (!json?.settings) return;
      const s = json.settings;
      setExamPreset(clampPresetToTeacher(trackToPreset(s.examPreset ?? s.track), track));
      if (typeof s.rollDigits === "number" && !Number.isNaN(s.rollDigits)) {
        setRollDigits(Math.min(12, Math.max(6, s.rollDigits)));
      }
      if (Array.isArray(s.advance?.subjects) && s.advance.subjects.length > 0) {
        setAdvanceSubjects(s.advance.subjects);
      }
    } catch {
      setTemplateErr("Could not load saved template.");
    }
  }, [templateData, templateQueryLoading, meData?.user?.category]);

  const saveOmrTemplate = useCallback(async () => {
    setTemplateSaving(true);
    setTemplateMsg(null);
    setTemplateErr(null);
    const roll = Math.min(12, Math.max(6, rollDigits));
    if (examPreset === "JEE_ADVANCE") {
      for (const s of advanceSubjects) {
        const err = validateSubjectSectionCounts(s.sectionCounts);
        if (err) {
          setTemplateErr(`${s.subject}: ${err}`);
          setTemplateSaving(false);
          return;
        }
      }
    }
    try {
      const payload: Record<string, unknown> = {
        track: presetToTrack(examPreset),
        examPreset,
        rollDigits: roll,
      };
      if (examPreset === "JEE_ADVANCE") {
        payload.advance = {
          examDurationHours: JEE_ADVANCE_EXAM_DURATION_HOURS,
          questionsPerSubject: JEE_ADVANCE_QUESTIONS_PER_SUBJECT,
          subjects: advanceSubjects,
        };
      }
      const res = await fetch("/api/teacher/omr-template", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setTemplateErr(json.error ?? "Could not save template");
        return;
      }
      if (json.settings?.examPreset || json.settings?.track) {
        setExamPreset(trackToPreset(json.settings.examPreset ?? json.settings.track));
      }
      if (typeof json.settings?.rollDigits === "number") {
        setRollDigits(json.settings.rollDigits);
      }
      if (Array.isArray(json.settings?.advance?.subjects)) {
        setAdvanceSubjects(json.settings.advance.subjects);
      }
      setTemplateSavedForNextStep(true);
      setTemplateMsg("Template saved. OMR PDF and bundle downloads will use these settings.");
    } catch {
      setTemplateErr("Network error while saving template.");
    } finally {
      setTemplateSaving(false);
    }
  }, [examPreset, rollDigits, advanceSubjects]);

  async function runDetection() {
    if (!scanPaper) {
      setScanError("Select the question paper whose answer key should be used.");
      return;
    }
    if (!scanFile) {
      setScanError("Upload or capture an OMR sheet image first.");
      return;
    }

    setScanLoading(true);
    setScanError(null);
    setScanStatus("Reading marked bubbles and evaluating against the selected answer key…");
    setScanResult(null);
    setScanSavedMsg(null);
    setScanStudentId("");
    try {
      const form = new FormData();
      form.set("paperId", scanPaper);
      form.set("sensitivity", String(sensitivity));
      form.set("image", scanFile);
      const res = await fetch("/api/teacher/omr-detect", {
        method: "POST",
        body: form,
      });
      const json = (await res.json()) as OmrEvaluationResult & { error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? "Could not evaluate the OMR sheet.");
      }
      setScanResult(json);
      setScanStudentId(json.matchedStudent?.id ?? "");
      setScanStatus(
        `Evaluation complete: ${json.score.obtained}/${json.score.maximum} marks.`
      );
      if (json.matchedStudent) {
        // A student matched the detected roll number — save the score automatically.
        await saveScoreToStudent(json, json.matchedStudent.id);
      }
    } catch (error) {
      setScanStatus(null);
      setScanError(error instanceof Error ? error.message : "Could not evaluate the OMR sheet.");
    } finally {
      setScanLoading(false);
    }
  }

  async function saveScoreToStudent(result: OmrEvaluationResult, studentId: string) {
    if (!studentId) {
      setScanError("Select the student this OMR sheet belongs to.");
      return;
    }
    setScanSaving(true);
    setScanError(null);
    setScanSavedMsg(null);
    try {
      const res = await fetch("/api/teacher/omr-record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paperId: result.paper.id,
          studentId,
          submittedAnswers: result.submittedAnswers,
          rollNumber: result.rollNumber,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        student?: { name: string };
        score?: { obtained: number; maximum: number };
      };
      if (!res.ok) {
        throw new Error(json.error ?? "Could not save the score.");
      }
      setScanSavedMsg(
        `Saved ${json.score?.obtained}/${json.score?.maximum} to ${json.student?.name}'s profile. ` +
          "It now appears in their exam history and Analysis Notes."
      );
    } catch (error) {
      setScanError(error instanceof Error ? error.message : "Could not save the score.");
    } finally {
      setScanSaving(false);
    }
  }

  function renderFeature(id: string, actions: { openFeature: (id: string) => void }) {
    switch (id) {
      case "template":
        return (
          <div className="space-y-3">
            <label className="block text-xs text-[var(--muted)]">
              Exam track
              <select
                value={examPreset}
                onChange={(e) => {
                  setExamPreset(e.target.value as ExamPreset);
                  setTemplateSavedForNextStep(false);
                }}
                disabled={!teacherTrack}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm disabled:opacity-50"
              >
                {availablePresetOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-[var(--muted)]">
              Roll number columns
              <input
                type="number"
                min={6}
                max={12}
                value={rollDigits}
                onChange={(e) =>
                  {
                    setRollDigits(Math.min(12, Math.max(6, Number(e.target.value) || 10)));
                    setTemplateSavedForNextStep(false);
                  }
                }
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              />
            </label>
            {examPreset === "JEE_ADVANCE" ? (
              <JeeAdvanceStructurePanel subjects={advanceSubjects} onChange={setAdvanceSubjects} />
            ) : null}
            <OmrTemplatePreview
              examPreset={examPreset}
              rollDigits={rollDigits}
              questionCount={layout.questions}
              sectionsLabel={layout.sections}
              advanceSubjects={examPreset === "JEE_ADVANCE" ? advanceSubjects : undefined}
            />
            <button
              type="button"
              className={dashBtnPrimary}
              disabled={templateLoading || templateSaving}
              onClick={() => void saveOmrTemplate()}
            >
              {templateSaving ? "Saving…" : "Save template"}
            </button>
            {!templateSavedForNextStep ? (
              <p className="text-xs text-[var(--muted)]">Save the template, then use Next to open the paper bundle activity.</p>
            ) : null}
            {templateLoading ? (
              <p className="text-xs text-[var(--muted)]">Loading saved template…</p>
            ) : null}
            {templateMsg ? <p className="text-xs text-emerald-700">{templateMsg}</p> : null}
            {templateErr ? <p className="text-xs text-red-600">{templateErr}</p> : null}
          </div>
        );
      case "bundle":
        return (
          <div className="space-y-3">
            <label className="block text-xs text-[var(--muted)]">
              Question paper
              <select
                value={bundlePaper}
                onChange={(e) => {
                  const id = e.target.value;
                  setBundlePaper(id);
                  const paper = papers.find((p) => p.id === id);
                  if (paper?.category === "JEE" || paper?.category === "NEET") {
                    setExamPreset(
                      clampPresetToTeacher(trackToPreset(paper.category), teacherTrack)
                    );
                  }
                  setBundleMsg(null);
                  setBundleErr(null);
                }}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              >
                <option value="">Select paper for bundle</option>
                {papers.map((paper) => (
                  <option key={paper.id} value={paper.id}>
                    {paper.title} ({paper.category})
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-[var(--muted)]">
              OMR copies
              <input
                type="number"
                min={1}
                max={100}
                value={bundleCopies}
                onChange={(e) => setBundleCopies(Math.min(100, Math.max(1, Number(e.target.value) || 1)))}
                className={`${dashInput} mt-1`}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-[var(--muted)]">
                Print / download format
                <select
                  value={bundlePrintFormat}
                  onChange={(e) => setBundlePrintFormat(e.target.value as "omr" | "full")}
                  className={`${dashSelect} mt-1 w-full`}
                >
                  <option value="full">Full bundle (question paper + OMR)</option>
                  <option value="omr">OMR sheets only</option>
                </select>
              </label>
              <label className="block text-xs text-[var(--muted)]">
                Page size
                <select
                  value={bundlePageSize}
                  onChange={(e) => setBundlePageSize(e.target.value as "a4" | "b4")}
                  className={`${dashSelect} mt-1 w-full`}
                >
                  <option value="a4">A4</option>
                  <option value="b4">B4</option>
                </select>
              </label>
            </div>
            <p className="text-xs text-[var(--muted)]">
              OMR grid matches the selected track ({omrTrack}): {layout.questions} questions in{" "}
              {omrTrack === "NEET" ? 4 : 3} columns ×{" "}
              {Math.ceil(layout.questions / (omrTrack === "NEET" ? 4 : 3))} rows, scaled to{" "}
              {bundlePageSize.toUpperCase()}. Includes {bundleCopies} OMR{" "}
              {bundleCopies === 1 ? "sheet" : "sheets"} for Print / Download.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={dashBtnPrimary}
                disabled={!bundlePaper || bundleLoading}
                onClick={() => void printBundle()}
              >
                {bundleLoading ? "Preparing…" : "Print"}
              </button>
              <button
                type="button"
                className={dashBtnSecondary}
                disabled={!bundlePaper || bundleLoading}
                onClick={() => void downloadOmrOnly()}
              >
                Download OMR PDF
              </button>
              <button
                type="button"
                className={dashBtnSecondary}
                disabled={!bundlePaper || bundleLoading}
                onClick={() => void downloadFullBundle()}
              >
                {bundleLoading ? "Building bundle…" : "Download full bundle"}
              </button>
            </div>
            {bundleMsg ? <p className="text-xs text-emerald-700">{bundleMsg}</p> : null}
            {bundleErr ? <p className="text-xs text-red-600">{bundleErr}</p> : null}
          </div>
        );
      case "capture":
        return (
          <div className="space-y-3">
            <label className="block text-xs text-[var(--muted)]">
              Question paper and answer key
              <select
                value={scanPaper}
                onChange={(e) => {
                  setScanPaper(e.target.value);
                  setScanResult(null);
                  setScanStatus(null);
                  setScanError(null);
                }}
                className={`${dashSelect} mt-1 w-full`}
              >
                <option value="">Select a question paper</option>
                {papers.map((paper) => (
                  <option key={paper.id} value={paper.id} disabled={!paper.hasAnswerKey}>
                    {paper.title} ({paper.category})
                    {paper.hasAnswerKey ? "" : " — no answer key"}
                  </option>
                ))}
              </select>
              <span className="mt-1 block">
                The saved answer key for this paper will be fetched securely and used for scoring.
              </span>
            </label>
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--background)] px-4 py-8 text-center text-sm text-[var(--muted)] hover:border-[var(--accent)]">
              <span className="font-medium text-[var(--foreground)]">Choose OMR image</span>
              <span className="mt-1 text-xs">JPG, PNG, or WebP · maximum 15 MB</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  setScanFile(file ?? null);
                  setScanName(file?.name ?? null);
                  setScanStatus(null);
                  setScanError(null);
                  setScanResult(null);
                }}
              />
            </label>
            {scanName ? <p className="text-xs text-[var(--muted)]">Selected: {scanName}</p> : null}
            <label className="block w-full cursor-pointer rounded-lg border border-[var(--border)] px-3 py-2 text-center text-sm">
              Open camera capture
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  setScanFile(file ?? null);
                  setScanName(file?.name ?? null);
                  setScanStatus(null);
                  setScanError(null);
                  setScanResult(null);
                }}
              />
            </label>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-4">
              <label className="block text-xs text-[var(--muted)]">
                Detection sensitivity ({sensitivity}%)
                <input
                  type="range"
                  min={40}
                  max={100}
                  value={sensitivity}
                  onChange={(e) => setSensitivity(Number(e.target.value))}
                  className="mt-2 w-full"
                />
              </label>
              <button
                type="button"
                className={`${dashBtnPrimary} mt-3 w-full`}
                onClick={() => void runDetection()}
                disabled={scanLoading || !scanPaper || !scanFile}
              >
                {scanLoading ? "Detecting and scoring…" : "Detect bubbles and calculate score"}
              </button>
              {scanStatus ? <p className="mt-3 text-xs text-[var(--muted)]">{scanStatus}</p> : null}
              {scanError ? <p className="mt-3 text-xs text-red-600">{scanError}</p> : null}
            </div>
            {scanResult ? (
              <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--background)] p-4">
                <div>
                  <p className="text-xs text-[var(--muted)]">Evaluation result</p>
                  <p className="text-lg font-bold text-[var(--foreground)]">
                    {scanResult.score.obtained} / {scanResult.score.maximum}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    {scanResult.paper.title}
                    {scanResult.rollNumber ? ` · Roll ${scanResult.rollNumber}` : ""}
                  </p>
                  {scanResult.rollDigits && scanResult.rollDigits.length > 0 ? (
                    <p className="mt-1 font-mono text-[11px] text-[var(--muted)]">
                      Roll grid (col→digit):{" "}
                      {scanResult.rollDigits
                        .map((d) => `${d.position}:${d.digit ?? "—"}`)
                        .join(" · ")}
                    </p>
                  ) : null}
                </div>
                <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
                  <div className="rounded-md bg-emerald-50 p-2 text-emerald-800">
                    <strong className="block text-base">{scanResult.score.correct}</strong>
                    Correct
                  </div>
                  <div className="rounded-md bg-red-50 p-2 text-red-800">
                    <strong className="block text-base">{scanResult.score.wrong}</strong>
                    Wrong
                  </div>
                  <div className="rounded-md bg-amber-50 p-2 text-amber-800">
                    <strong className="block text-base">{scanResult.score.unanswered}</strong>
                    Unanswered
                  </div>
                  <div className="rounded-md bg-slate-100 p-2 text-slate-800">
                    <strong className="block text-base">{scanResult.score.flagged}</strong>
                    Review
                  </div>
                </div>
                {scanResult.issues.length > 0 ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                    <p className="font-semibold">Detection notes</p>
                    <ul className="mt-1 list-disc pl-4">
                      {scanResult.issues.map((issue, index) => (
                        <li key={`${issue}-${index}`}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {scanResult.matchedStudent ? (
                  <div className="rounded-md border border-[var(--border)] bg-[var(--card)] p-3">
                    <p className="text-xs font-semibold text-[var(--foreground)]">
                      Saved to student profile
                    </p>
                    {scanSaving ? (
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        Saving score to {scanResult.matchedStudent.name}
                        {scanResult.rollNumber ? ` (roll ${scanResult.rollNumber})` : ""}…
                      </p>
                    ) : scanSavedMsg ? (
                      <p className="mt-1 text-xs text-emerald-700">{scanSavedMsg}</p>
                    ) : (
                      <p className="mt-1 text-xs text-red-600">
                        {scanError ?? "The score could not be saved automatically."}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                    <p className="text-xs font-semibold text-amber-900">
                      {scanResult.rollNumber
                        ? `No student profile matches the detected roll number "${scanResult.rollNumber}".`
                        : "No roll number could be detected on this sheet."}
                    </p>
                    <p className="mt-1 text-xs text-amber-800">
                      Select the student to link this exam attempt to, then save the score.
                    </p>
                    <select
                      value={scanStudentId}
                      onChange={(e) => {
                        setScanStudentId(e.target.value);
                        setScanSavedMsg(null);
                      }}
                      className={`${dashSelect} mt-2 w-full`}
                    >
                      <option value="">Select student</option>
                      {students.map((student) => (
                        <option key={student.id} value={student.id}>
                          {student.name}
                          {student.rollNumber ? ` · Roll ${student.rollNumber}` : ""}
                          {` · ${displayLoginId(student)}`}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className={`${dashBtnPrimary} mt-3 w-full`}
                      disabled={scanSaving || !scanStudentId}
                      onClick={() => void saveScoreToStudent(scanResult, scanStudentId)}
                    >
                      {scanSaving ? "Saving…" : "Save score to selected student"}
                    </button>
                    {scanSavedMsg ? (
                      <p className="mt-2 text-xs text-emerald-700">{scanSavedMsg}</p>
                    ) : null}
                  </div>
                )}
                <details>
                  <summary className="cursor-pointer text-sm font-medium">Question-wise evaluation</summary>
                  <div className="mt-2 max-h-72 overflow-auto rounded-md border border-[var(--border)]">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-[var(--background)]">
                        <tr>
                          <th className="px-2 py-1.5">Q</th>
                          <th className="px-2 py-1.5">Detected</th>
                          <th className="px-2 py-1.5">Answer</th>
                          <th className="px-2 py-1.5">Result</th>
                          <th className="px-2 py-1.5">Confidence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scanResult.breakdown.map((item) => (
                          <tr key={item.question} className="border-t border-[var(--border)]">
                            <td className="px-2 py-1.5">{item.question}</td>
                            <td className="px-2 py-1.5">{item.detected ?? "—"}</td>
                            <td className="px-2 py-1.5">{item.expected}</td>
                            <td
                              className={`px-2 py-1.5 font-medium ${
                                item.status === "correct"
                                  ? "text-emerald-700"
                                  : item.status === "wrong"
                                    ? "text-red-700"
                                    : "text-amber-700"
                              }`}
                            >
                              {item.status}
                              {item.flagged ? " · review" : ""}
                            </td>
                            <td className="px-2 py-1.5">{Math.round(item.confidence * 100)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
                <p className="text-[11px] text-[var(--muted)]">
                  Scoring follows the {scanResult.track.replace("_", " ")} marking scheme
                  {scanResult.track === "JEE_ADVANCE"
                    ? " (per-section: Section I +3/−1, Section II +4/−2, Section III +4/0)."
                    : " (+4 correct, −1 wrong for MCQs, 0 for unanswered)."}
                  {" "}Review all flagged bubbles before saving the score.
                </p>
              </div>
            ) : null}
          </div>
        );
      case "flags":
        return (
          <div className="space-y-2">
            <ToggleRow label="Smudge / faint marks" checked={flagSmudge} onChange={setFlagSmudge} />
            <ToggleRow label="Double bubble marks" checked={flagDoubleMark} onChange={setFlagDoubleMark} />
            <ToggleRow label="Blank or invalid roll number" checked={flagBlankRoll} onChange={setFlagBlankRoll} />
          </div>
        );
      default:
        return null;
    }
  }

  return (
    <FeatureActivityHub
      features={OMR_ACTIVITIES}
      renderFeature={renderFeature}
      resetKey={resetKey}
      validateNext={(activeId) =>
        activeId === "template" && !templateSavedForNextStep ? "Save the Template first" : null
      }
    />
  );
}

export function OnlineExamModulePanel({ resetKey: _resetKey }: { resetKey?: string }) {
  const { data: cbtData, isLoading: cbtLoading } = useTeacherCbtSettingsQuery();
  const [settings, setSettings] = useState<CbtSettings | null>(null);
  const [savedSettings, setSavedSettings] = useState<CbtSettings | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (cbtLoading) return;
    try {
      const json = cbtData as { settings?: CbtSettings } | undefined;
      const loaded = json?.settings ?? { ...DEFAULT_CBT_SETTINGS };
      setSettings(loaded);
      setSavedSettings(loaded);
    } catch {
      const defaults = { ...DEFAULT_CBT_SETTINGS };
      setSettings(defaults);
      setSavedSettings(defaults);
    }
  }, [cbtData, cbtLoading]);

  const hasUnsavedChanges =
    settings !== null &&
    savedSettings !== null &&
    JSON.stringify(settings) !== JSON.stringify(savedSettings);

  const persist = useCallback(async (next: CbtSettings) => {
    setSaving(true);
    setSaveMsg(null);
    setSaveErr(null);
    try {
      const res = await fetch("/api/teacher/cbt-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const text = await res.text();
      const json = text ? (JSON.parse(text) as { settings?: CbtSettings; error?: string }) : {};
      if (res.ok && json.settings) {
        setSettings(json.settings);
        setSavedSettings(json.settings);
        setSaveMsg("All changes saved — applied to newly scheduled exams.");
        return true;
      }
      setSaveErr(json.error ?? "Could not save settings.");
      return false;
    } catch {
      setSaveErr("Could not save settings.");
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  function update(patch: Partial<CbtSettings>) {
    setSaveMsg(null);
    setSaveErr(null);
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  async function saveAllChanges() {
    if (!settings || saving) return;
    await persist(settings);
  }

  if (!settings) {
    return <p className="text-sm text-[var(--muted)]">Loading CBT settings…</p>;
  }

  const cbt = settings;

  function renderFeature(id: string) {
    switch (id) {
      case "timer":
        return (
          <>
            <ToggleRow
              label="Auto-submit when timer ends"
              checked={cbt.autoSubmitOnTimerEnd}
              onChange={(autoSubmitOnTimerEnd) => update({ autoSubmitOnTimerEnd })}
            />
            <p className="mt-3 text-xs text-[var(--muted)]">
              Live countdown in the student CBT shell; paper submits when time expires
              {cbt.autoSubmitOnTimerEnd ? " automatically." : " (student must submit manually if disabled)."}
            </p>
          </>
        );
      case "palette":
        return (
          <p className="text-sm text-[var(--foreground)]">
            Students use a section-wise palette (not visited, not answered, answered, marked for review) with
            Previous, Save &amp; Next, and submit confirmation.
          </p>
        );
      case "proctoring":
        return (
          <div className="space-y-2">
            <ToggleRow
              label="Require fullscreen"
              checked={cbt.requireFullscreen}
              onChange={(requireFullscreen) => update({ requireFullscreen })}
            />
            <ToggleRow
              label="Flag tab / window switches"
              checked={cbt.blockTabSwitch}
              onChange={(blockTabSwitch) => update({ blockTabSwitch })}
            />
            <ToggleRow
              label="Block copy / paste"
              checked={cbt.blockClipboard}
              onChange={(blockClipboard) => update({ blockClipboard })}
            />
          </div>
        );
      case "offline":
        return (
          <>
            <ToggleRow
              label="Enable offline answer cache"
              checked={cbt.offlineSyncEnabled}
              onChange={(offlineSyncEnabled) => update({ offlineSyncEnabled })}
            />
            <p className="mt-3 text-xs text-[var(--muted)]">
              Answers sync to the server while online and queue in the browser when offline.
            </p>
          </>
        );
      default:
        return null;
    }
  }

  return (
    <div className="space-y-5">
      <div className={`${dashBlock} text-sm text-[var(--muted)]`}>
        These options apply during live student attempts. Exam duration is set under{" "}
        <strong className="text-[var(--foreground)]">Exam Scheduling</strong>.
        {hasUnsavedChanges ? (
          <span className="ml-2 text-xs text-amber-700">You have unsaved changes.</span>
        ) : null}
      </div>
      <div className="flex flex-col gap-4">
        {ONLINE_ACTIVITIES.map((feature) => (
          <section
            key={feature.id}
            id={`online-activity-${feature.id}`}
            className="scroll-mt-6 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 sm:p-6"
          >
            <h3 className="text-base font-semibold text-[var(--foreground)]">{feature.title}</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">{feature.description}</p>
            <div className="mt-5 border-t border-[var(--border)] pt-5">{renderFeature(feature.id)}</div>
          </section>
        ))}
      </div>

      <div className="sticky bottom-0 z-10 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-[var(--muted)]">
            {hasUnsavedChanges
              ? "Review your changes above, then save to apply them to new exams."
              : "All settings are saved."}
          </p>
          <button
            type="button"
            className={dashBtnPrimary}
            disabled={saving || !hasUnsavedChanges}
            onClick={() => void saveAllChanges()}
          >
            {saving ? "Saving…" : "Save all Changes"}
          </button>
        </div>
        {saveMsg ? <p className="mt-2 text-xs text-emerald-700">{saveMsg}</p> : null}
        {saveErr ? <p className="mt-2 text-xs text-red-600">{saveErr}</p> : null}
      </div>
    </div>
  );
}
