"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import type { TeacherTrack } from "@/lib/dashboard-nav";
import {
  dashBlock,
  dashBtnPrimary,
  dashBtnSecondary,
  dashInput,
  dashSelect,
} from "@/lib/dashboard-ui";
import {
  JEE_ADVANCE_EXAM_DURATION_HOURS,
  JEE_ADVANCE_QUESTIONS_PER_SUBJECT,
  buildDefaultAdvanceSubjects,
} from "@/lib/jee-advance-exam-structure";
import { isJeeAdvancePaperContent } from "@/lib/jee-mains-exam-structure";
import type { JeeAdvanceSubjectConfig, OmrExamPreset } from "@/lib/omr-template";
import {
  buildOmrBundlePdfBlob,
  buildOmrSheetPdfBlob,
  downloadOmrBundlePdf,
  downloadOmrSheetPdf,
  OMR_LAYOUT,
  printOmrSheet,
  printPdfBlob,
  type OmrTrack,
} from "@/lib/omr-pdf";
import {
  isOmrScanPdf,
  OMR_PDF_MAX_PAGES,
  pdfFileToOmrPageImages,
} from "@/lib/omr-pdf-pages-client";

type Paper = {
  id: string;
  title: string;
  category: string;
  questionContent: string;
  hasAnswerKey: boolean;
};

type OmrMatchedStudent = {
  id: string;
  name: string;
  rollNumber: string | null;
  matchedBy: "name" | "rollNumber" | "username" | "email";
};

type OmrEvaluationResult = {
  paper: { id: string; title: string };
  track: string;
  studentName: string | null;
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

type OmrBatchPageResult = {
  pageIndex: number;
  pageLabel: string;
  result: OmrEvaluationResult | null;
  error: string | null;
  savedMsg: string | null;
  saving: boolean;
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

function clampPresetToTeacher(preset: ExamPreset, teacherTrack: TeacherTrack | null): ExamPreset {
  if (!teacherTrack) return preset;
  if (teacherTrack === "NEET") return "NEET";
  // JEE teachers: Main or Advance only.
  return preset === "NEET" ? "JEE_MAINS" : preset;
}

/** Lock OMR sheet layout from the selected paper + teacher profile track. */
function resolvePresetFromPaper(
  paper: { category: string; questionContent?: string },
  teacherTrack: TeacherTrack | null
): ExamPreset {
  let preset: ExamPreset;
  if (paper.category === "NEET") {
    preset = "NEET";
  } else if (paper.category === "JEE") {
    preset = isJeeAdvancePaperContent(paper.questionContent ?? "")
      ? "JEE_ADVANCE"
      : "JEE_MAINS";
  } else {
    preset = trackToPreset(paper.category);
  }
  return clampPresetToTeacher(preset, teacherTrack);
}

function presetLabel(preset: ExamPreset): string {
  if (preset === "JEE_ADVANCE") return "JEE Advance";
  if (preset === "JEE_MAINS") return "JEE Main";
  return "NEET";
}

const OMR_ACTIVITIES: ActivityFeature[] = [
  { id: "bundle", title: "Print-ready OMR + paper bundle", description: "Pair OMR with your question paper" },
  {
    id: "capture",
    title: "Camera / scanner capture + AI bubble-fill detection",
    description:
      "Upload an image or multi-page PDF; match each sheet by name/roll and save to student profiles",
  },
  { id: "flags", title: "Error and smudge alert flags", description: "Highlight sheets that need manual review" },
];

const ONLINE_ACTIVITIES: ActivityFeature[] = [
  { id: "timer", title: "Timer + auto-submit", description: "Countdown and hard stop at zero" },
  { id: "palette", title: "Question palette", description: "NTA-style navigation during CBT" },
  { id: "proctoring", title: "Browser lock / anti-cheat", description: "Proctoring during live attempt" },
  { id: "offline", title: "Offline fallback sync", description: "Cache answers when connectivity drops" },
];

export function OmrSheetManagementPanel({ resetKey }: { resetKey?: string }) {
  const [examPreset, setExamPreset] = useState<ExamPreset>("NEET");
  const [rollDigits, setRollDigits] = useState(5);
  const [advanceSubjects, setAdvanceSubjects] = useState<JeeAdvanceSubjectConfig[]>(
    buildDefaultAdvanceSubjects
  );
  const [bundlePaper, setBundlePaper] = useState("");
  const { data: papersData } = useTeacherQuestionPapersQuery();
  const { data: meData } = useMeQuery();
  const { data: templateData, isLoading: templateQueryLoading } = useTeacherOmrTemplateQuery();

  const teacherTrack: TeacherTrack | null =
    meData?.user?.category === "JEE" || meData?.user?.category === "NEET"
      ? meData.user.category
      : null;

  const papers: Paper[] = useMemo(() => {
    const all = (papersData?.papers ?? []).map((p) => ({
      id: p.id,
      title: p.title,
      category: p.category,
      questionContent: p.questionContent ?? "",
      hasAnswerKey: Boolean(p.keyContent?.trim()),
    }));
    if (!teacherTrack) return all;
    return all.filter((p) => p.category === teacherTrack);
  }, [papersData?.papers, teacherTrack]);

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
  const [scanResultOpen, setScanResultOpen] = useState(true);
  const [scanBatch, setScanBatch] = useState<OmrBatchPageResult[]>([]);
  const [scanBatchActive, setScanBatchActive] = useState(0);
  const [scanStudentId, setScanStudentId] = useState("");
  const [scanSaving, setScanSaving] = useState(false);
  const [scanSavedMsg, setScanSavedMsg] = useState<string | null>(null);
  const scanFileInputRef = useRef<HTMLInputElement>(null);
  const scanCameraInputRef = useRef<HTMLInputElement>(null);
  const { data: studentsData } = useTeacherStudentsQuery();
  const students = useMemo(() => studentsData?.students ?? [], [studentsData?.students]);
  const [bundleCopies, setBundleCopies] = useState(30);
  const [bundlePrintFormat, setBundlePrintFormat] = useState<"omr" | "full">("full");
  const [bundlePageSize, setBundlePageSize] = useState<"a4" | "b4">("a4");
  const [bundleLoading, setBundleLoading] = useState(false);
  const [bundleMsg, setBundleMsg] = useState<string | null>(null);
  const [bundleErr, setBundleErr] = useState<string | null>(null);
  const [bundlePreviewUrl, setBundlePreviewUrl] = useState<string | null>(null);
  const [bundlePreviewLoading, setBundlePreviewLoading] = useState(false);
  const [bundlePreviewErr, setBundlePreviewErr] = useState<string | null>(null);

  const omrTrack = presetToTrack(examPreset);
  const layout = OMR_LAYOUT[omrTrack];

  const selectedPaper = papers.find((p) => p.id === bundlePaper);
  const selectedScanPaper = papers.find((p) => p.id === scanPaper);
  const lockedFromPaper = selectedPaper ?? selectedScanPaper;

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

  // Live PDF preview of the complete bundle (question paper + OMR) after paper select.
  useEffect(() => {
    if (!bundlePaper) {
      setBundlePreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setBundlePreviewErr(null);
      setBundlePreviewLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setBundlePreviewLoading(true);
        setBundlePreviewErr(null);
        try {
          // Preview uses 1 OMR copy so generation stays fast; print/download still use bundleCopies.
          const previewOpts = {
            track: omrTrack,
            rollDigits,
            paperTitle: selectedPaper?.title ?? "OMR Sheet",
            questionCount: layout.questions,
            sectionsLabel: layout.sections,
            copies: 1,
            pageSize: bundlePageSize,
            advance:
              examPreset === "JEE_ADVANCE"
                ? {
                    examDurationHours: JEE_ADVANCE_EXAM_DURATION_HOURS,
                    questionsPerSubject: JEE_ADVANCE_QUESTIONS_PER_SUBJECT,
                    subjects: advanceSubjects,
                  }
                : undefined,
          };

          let blob: Blob;
          if (bundlePrintFormat === "omr") {
            blob = await buildOmrSheetPdfBlob(previewOpts);
          } else {
            const paper = await loadPaperForBundle();
            if (!paper) {
              throw new Error("Could not load the selected question paper.");
            }
            if (cancelled) return;
            blob = await buildOmrBundlePdfBlob({
              ...previewOpts,
              paperTitle: paper.title,
              questionContent: paper.questionContent,
              keyContent: paper.keyContent ?? null,
            });
          }
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          setBundlePreviewUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return url;
          });
        } catch (e) {
          if (cancelled) return;
          setBundlePreviewUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
          });
          setBundlePreviewErr(
            e instanceof Error ? e.message : "Could not build the bundle preview."
          );
        } finally {
          if (!cancelled) setBundlePreviewLoading(false);
        }
      })();
    }, 280);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    bundlePaper,
    bundlePrintFormat,
    bundlePageSize,
    examPreset,
    omrTrack,
    rollDigits,
    layout.questions,
    layout.sections,
    advanceSubjects,
    selectedPaper?.title,
    loadPaperForBundle,
  ]);

  useEffect(() => {
    return () => {
      if (bundlePreviewUrl) URL.revokeObjectURL(bundlePreviewUrl);
    };
  }, [bundlePreviewUrl]);

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
      if (bundlePrintFormat === "omr") {
        const title = selectedPaper?.title ?? "OMR Sheet";
        await printOmrSheet(buildOmrOpts(title));
      } else {
        const paper = await loadPaperForBundle();
        if (!paper) return;
        const blob = await buildOmrBundlePdfBlob({
          ...buildOmrOpts(paper.title),
          questionContent: paper.questionContent,
          keyContent: paper.keyContent ?? null,
        });
        await printPdfBlob(blob);
      }
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
    if (templateQueryLoading) return;
    try {
      const json = templateData as {
        settings?: {
          track?: string;
          rollDigits?: number;
          examPreset?: ExamPreset;
          advance?: { subjects?: JeeAdvanceSubjectConfig[] };
        };
      } | undefined;
      const profileDefault: ExamPreset =
        teacherTrack === "JEE" ? "JEE_MAINS" : "NEET";
      if (json?.settings) {
        const s = json.settings;
        if (!bundlePaper && !scanPaper) {
          setExamPreset(
            clampPresetToTeacher(trackToPreset(s.examPreset ?? s.track), teacherTrack)
          );
        }
        setRollDigits(5);
        if (Array.isArray(s.advance?.subjects) && s.advance.subjects.length > 0) {
          setAdvanceSubjects(s.advance.subjects);
        }
      } else if (!bundlePaper && !scanPaper && teacherTrack) {
        setExamPreset(profileDefault);
      }
    } catch {
      // Keep defaults.
    }
  }, [templateData, templateQueryLoading, teacherTrack, bundlePaper, scanPaper]);

  const lockTemplateFromPaper = useCallback(
    async (paper: Paper) => {
      const preset = resolvePresetFromPaper(paper, teacherTrack);
      setExamPreset(preset);
      setRollDigits(5);
      const subjects =
        preset === "JEE_ADVANCE"
          ? advanceSubjects.length > 0
            ? advanceSubjects
            : buildDefaultAdvanceSubjects()
          : advanceSubjects;
      if (preset === "JEE_ADVANCE" && advanceSubjects.length === 0) {
        setAdvanceSubjects(subjects);
      }
      try {
        const payload: Record<string, unknown> = {
          track: presetToTrack(preset),
          examPreset: preset,
          rollDigits: 5,
        };
        if (preset === "JEE_ADVANCE") {
          payload.advance = {
            examDurationHours: JEE_ADVANCE_EXAM_DURATION_HOURS,
            questionsPerSubject: JEE_ADVANCE_QUESTIONS_PER_SUBJECT,
            subjects,
          };
        }
        await fetch("/api/teacher/omr-template", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } catch {
        // Local lock still applies even if persistence fails.
      }
    },
    [teacherTrack, advanceSubjects]
  );

  const lockedTemplateBanner = (
    <div className="rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs text-[var(--muted)]">
      <span className="font-semibold text-[var(--foreground)]">OMR template locked</span>
      {": "}
      {presetLabel(examPreset)} · {layout.questions} questions · {omrTrack === "NEET" ? 4 : 3}{" "}
      columns · 5-digit roll
      {lockedFromPaper ? (
        <span>
          {" "}
          (from {lockedFromPaper.title}
          {teacherTrack ? ` · teacher track ${teacherTrack}` : ""})
        </span>
      ) : teacherTrack ? (
        <span> (default for your {teacherTrack} profile — select a paper to refine)</span>
      ) : null}
    </div>
  );

  async function detectOneSheet(imageFile: File): Promise<OmrEvaluationResult> {
    const form = new FormData();
    form.set("paperId", scanPaper);
    form.set("sensitivity", String(sensitivity));
    form.set("image", imageFile);
    const res = await fetch("/api/teacher/omr-detect", {
      method: "POST",
      body: form,
    });
    const json = (await res.json()) as OmrEvaluationResult & { error?: string };
    if (!res.ok) {
      throw new Error(json.error ?? "Could not evaluate the OMR sheet.");
    }
    return json;
  }

  async function persistScoreToStudent(
    result: OmrEvaluationResult,
    studentId: string
  ): Promise<{ studentName: string; obtained: number; maximum: number }> {
    const res = await fetch("/api/teacher/omr-record", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paperId: result.paper.id,
        studentId,
        submittedAnswers: result.submittedAnswers,
        rollNumber: result.rollNumber,
        studentName: result.studentName,
        issues: result.issues,
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
    return {
      studentName: json.student?.name ?? "student",
      obtained: json.score?.obtained ?? result.score.obtained,
      maximum: json.score?.maximum ?? result.score.maximum,
    };
  }

  async function runDetection() {
    if (!scanPaper) {
      setScanError("Select the question paper whose answer key should be used.");
      return;
    }
    if (!scanFile) {
      setScanError("Upload an OMR sheet image or a multi-page PDF first.");
      return;
    }

    setScanLoading(true);
    setScanError(null);
    setScanResult(null);
    setScanBatch([]);
    setScanBatchActive(0);
    setScanResultOpen(true);
    setScanSavedMsg(null);
    setScanStudentId("");

    try {
      const pageFiles = isOmrScanPdf(scanFile)
        ? await (async () => {
            setScanStatus("Reading PDF pages…");
            return pdfFileToOmrPageImages(scanFile, {
              maxPages: OMR_PDF_MAX_PAGES,
              onProgress: (done, total) => {
                setScanStatus(`Preparing PDF page ${done} of ${total}…`);
              },
            });
          })()
        : [{ pageIndex: 0, file: scanFile }];

      if (pageFiles.length === 1 && !isOmrScanPdf(scanFile)) {
        setScanStatus("Reading student name, then scoring bubbles against the answer key…");
        const json = await detectOneSheet(pageFiles[0].file);
        setScanResult(json);
        setScanResultOpen(true);
        setScanStudentId(json.matchedStudent?.id ?? "");
        setScanStatus(
          `Evaluation complete: ${json.score.obtained}/${json.score.maximum} marks.`
        );
        if (json.matchedStudent) {
          await saveScoreToStudent(json, json.matchedStudent.id);
        }
        return;
      }

      const batch: OmrBatchPageResult[] = [];
      const seenStudentIds = new Set<string>();
      let matched = 0;
      let unmatched = 0;
      let failed = 0;

      for (const page of pageFiles) {
        const pageLabel = `Page ${page.pageIndex + 1}`;
        setScanStatus(
          `Evaluating ${pageLabel} of ${pageFiles.length} (name + roll match)…`
        );
        try {
          const json = await detectOneSheet(page.file);
          const entry: OmrBatchPageResult = {
            pageIndex: page.pageIndex,
            pageLabel,
            result: json,
            error: null,
            savedMsg: null,
            saving: false,
          };

          if (json.matchedStudent) {
            if (seenStudentIds.has(json.matchedStudent.id)) {
              entry.savedMsg =
                `Matched ${json.matchedStudent.name}, but another page already saved to this profile — review before overwriting.`;
              unmatched += 1;
            } else {
              entry.saving = true;
              batch.push(entry);
              setScanBatch([...batch]);
              try {
                const saved = await persistScoreToStudent(json, json.matchedStudent.id);
                seenStudentIds.add(json.matchedStudent.id);
                entry.savedMsg = `Saved ${saved.obtained}/${saved.maximum} to ${saved.studentName}.`;
                matched += 1;
              } catch (error) {
                entry.error =
                  error instanceof Error
                    ? error.message
                    : "Matched but could not save the score.";
                unmatched += 1;
              } finally {
                entry.saving = false;
              }
              batch[batch.length - 1] = { ...entry };
              setScanBatch([...batch]);
              continue;
            }
          } else {
            unmatched += 1;
          }

          batch.push(entry);
        } catch (error) {
          failed += 1;
          batch.push({
            pageIndex: page.pageIndex,
            pageLabel,
            result: null,
            error: error instanceof Error ? error.message : "Evaluation failed.",
            savedMsg: null,
            saving: false,
          });
        }
        setScanBatch([...batch]);
      }

      setScanBatchActive(0);
      setScanResultOpen(true);
      const firstOk = batch.find((p) => p.result);
      if (firstOk?.result) {
        setScanResult(firstOk.result);
        setScanBatchActive(firstOk.pageIndex);
        setScanStudentId(firstOk.result.matchedStudent?.id ?? "");
        setScanSavedMsg(firstOk.savedMsg);
      }
      setScanStatus(
        `Batch complete: ${pageFiles.length} sheet(s) · ${matched} saved · ${unmatched} need review · ${failed} failed.`
      );
    } catch (error) {
      setScanStatus(null);
      setScanError(error instanceof Error ? error.message : "Could not evaluate the OMR upload.");
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
      const saved = await persistScoreToStudent(result, studentId);
      const msg =
        `Saved ${saved.obtained}/${saved.maximum} to ${saved.studentName}'s profile. ` +
        "It now appears in their exam history and Analysis Notes.";
      setScanSavedMsg(msg);
      setScanBatch((prev) =>
        prev.map((page) =>
          page.pageIndex === scanBatchActive
            ? { ...page, savedMsg: msg, error: null }
            : page
        )
      );
    } catch (error) {
      setScanError(error instanceof Error ? error.message : "Could not save the score.");
    } finally {
      setScanSaving(false);
    }
  }

  function clearScanFile() {
    setScanFile(null);
    setScanName(null);
    setScanStatus(null);
    setScanError(null);
    setScanResult(null);
    setScanResultOpen(true);
    setScanBatch([]);
    setScanBatchActive(0);
    setScanSavedMsg(null);
    setScanStudentId("");
    if (scanFileInputRef.current) scanFileInputRef.current.value = "";
    if (scanCameraInputRef.current) scanCameraInputRef.current.value = "";
  }

  function selectBatchPage(pageIndex: number) {
    // Clicking the open result card again collapses Evaluation result.
    if (pageIndex === scanBatchActive && scanResultOpen) {
      setScanResultOpen(false);
      return;
    }
    const page = scanBatch.find((p) => p.pageIndex === pageIndex);
    setScanBatchActive(pageIndex);
    setScanResultOpen(true);
    setScanResult(page?.result ?? null);
    setScanStudentId(page?.result?.matchedStudent?.id ?? "");
    setScanSavedMsg(page?.savedMsg ?? null);
    setScanError(page?.error ?? null);
  }

  function renderFeature(id: string, actions: { openFeature: (id: string) => void }) {
    switch (id) {
      case "bundle":
        return (
          <div className="space-y-3">
            {lockedTemplateBanner}
            <label className="block text-xs text-[var(--muted)]">
              Question paper
              <select
                value={bundlePaper}
                onChange={(e) => {
                  const id = e.target.value;
                  setBundlePaper(id);
                  const paper = papers.find((p) => p.id === id);
                  if (paper) void lockTemplateFromPaper(paper);
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
              <span className="mt-1 block">
                Papers match your teacher profile track
                {teacherTrack ? ` (${teacherTrack})` : ""}. Selecting a paper locks the OMR
                layout automatically.
              </span>
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

            {bundlePaper ? (
              <div className="space-y-2 pt-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-xs font-semibold text-[var(--foreground)]">
                    {bundlePrintFormat === "omr" ? "OMR sheet preview" : "Complete bundle preview"}
                  </p>
                  <p className="text-[11px] text-[var(--muted)]">
                    {bundlePrintFormat === "full"
                      ? "Question paper + 1 OMR sample page"
                      : "1 OMR sample page"}
                    {" · "}
                    {bundlePageSize.toUpperCase()}
                    {bundleCopies > 1
                      ? ` · print/download will include ${bundleCopies} OMR copies`
                      : ""}
                  </p>
                </div>
                {bundlePreviewLoading ? (
                  <p className="text-xs text-[var(--muted)]">Building preview…</p>
                ) : null}
                {bundlePreviewErr ? (
                  <p className="text-xs text-red-600">{bundlePreviewErr}</p>
                ) : null}
                {bundlePreviewUrl && !bundlePreviewLoading ? (
                  <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-white shadow-sm">
                    <iframe
                      title={
                        bundlePrintFormat === "omr"
                          ? "OMR sheet preview"
                          : "Complete OMR bundle preview"
                      }
                      src={bundlePreviewUrl}
                      className="h-[min(80vh,900px)] w-full bg-white"
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      case "capture":
        return (
          <div className="space-y-3">
            {lockedTemplateBanner}
            <label className="block text-xs text-[var(--muted)]">
              Question paper and answer key
              <select
                value={scanPaper}
                onChange={(e) => {
                  const id = e.target.value;
                  setScanPaper(id);
                  const paper = papers.find((p) => p.id === id);
                  if (paper) void lockTemplateFromPaper(paper);
                  setScanResult(null);
                  setScanBatch([]);
                  setScanResultOpen(true);
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
                OMR layout locks to this paper&apos;s track automatically.
              </span>
            </label>
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--background)] px-4 py-8 text-center text-sm text-[var(--muted)] hover:border-[var(--accent)]">
              <span className="font-medium text-[var(--foreground)]">
                Choose OMR image or PDF
              </span>
              <span className="mt-1 text-xs">
                JPG, PNG, WebP (15 MB) · or multi-page PDF of scanned sheets (50 MB, up to{" "}
                {OMR_PDF_MAX_PAGES} pages)
              </span>
              <input
                ref={scanFileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf,.pdf"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  setScanFile(file ?? null);
                  setScanName(file?.name ?? null);
                  setScanStatus(null);
                  setScanError(null);
                  setScanResult(null);
                  setScanResultOpen(true);
                  setScanBatch([]);
                  setScanSavedMsg(null);
                }}
              />
            </label>
            {scanFile && scanName ? (
              <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2.5">
                <span
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-sky-100"
                  aria-hidden
                  title="Uploaded file"
                >
                  <svg viewBox="0 0 32 32" className="h-6 w-6" role="img">
                    <path
                      fill="#38bdf8"
                      d="M8 2h11l7 7v19a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"
                    />
                    <path fill="#0284c7" d="M19 2v7h7z" />
                    <path
                      fill="#fff"
                      d="M10 15h12v1.6H10zm0 4h12v1.6H10zm0 4h8v1.6h-8z"
                      opacity="0.95"
                    />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--foreground)]">
                    {scanName}
                  </p>
                  <p className="text-[11px] text-[var(--muted)]">
                    {isOmrScanPdf(scanFile) ? "PDF · multi-page batch" : "Image"}
                    {scanFile.size > 0
                      ? ` · ${(scanFile.size / (1024 * 1024)).toFixed(scanFile.size >= 1024 * 1024 ? 1 : 2)} MB`
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-xs font-medium text-[var(--muted)] hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                  onClick={clearScanFile}
                  aria-label={`Remove ${scanName}`}
                  title="Remove file"
                >
                  <span aria-hidden className="text-sm leading-none">
                    ×
                  </span>
                  Remove
                </button>
              </div>
            ) : null}
            <label className="block w-full cursor-pointer rounded-lg border border-[var(--border)] px-3 py-2 text-center text-sm">
              Open camera capture
              <input
                ref={scanCameraInputRef}
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
                  setScanResultOpen(true);
                  setScanBatch([]);
                  setScanSavedMsg(null);
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
                {scanLoading
                  ? "Detecting and scoring…"
                  : scanFile && isOmrScanPdf(scanFile)
                    ? "Evaluate all PDF pages"
                    : "Detect bubbles and calculate score"}
              </button>
              {scanStatus ? <p className="mt-3 text-xs text-[var(--muted)]">{scanStatus}</p> : null}
              {scanError && scanBatch.length === 0 ? (
                <p className="mt-3 text-xs text-red-600">{scanError}</p>
              ) : null}
            </div>

            {scanBatch.length > 0 ? (
              <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
                <p className="text-xs font-semibold text-[var(--foreground)]">
                  Sheets in this upload ({scanBatch.length})
                </p>
                <ul className="max-h-56 space-y-1.5 overflow-auto">
                  {scanBatch.map((page) => {
                    const active = page.pageIndex === scanBatchActive && scanResultOpen;
                    const matchName =
                      page.result?.matchedStudent?.name ??
                      page.result?.studentName ??
                      null;
                    const roll = page.result?.rollNumber;
                    return (
                      <li key={page.pageIndex}>
                        <button
                          type="button"
                          onClick={() => selectBatchPage(page.pageIndex)}
                          aria-expanded={active}
                          className={`w-full rounded-md border px-3 py-2 text-left text-xs transition ${
                            active
                              ? "border-[var(--accent)] bg-[var(--card)]"
                              : "border-[var(--border)] hover:border-[var(--accent)]"
                          }`}
                        >
                          <span className="font-medium text-[var(--foreground)]">
                            {page.pageLabel}
                          </span>
                          {page.error ? (
                            <span className="mt-0.5 block text-red-600">{page.error}</span>
                          ) : page.result ? (
                            <span className="mt-0.5 block text-[var(--muted)]">
                              {matchName ?? "Unmatched"}
                              {roll ? ` · Roll ${roll}` : ""}
                              {` · ${page.result.score.obtained}/${page.result.score.maximum}`}
                              {page.savedMsg
                                ? " · saved"
                                : page.result.matchedStudent
                                  ? ""
                                  : " · needs student"}
                              {page.saving ? " · saving…" : ""}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {scanResult && scanResultOpen ? (
              <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--background)] p-4">
                <div>
                  <p className="text-xs text-[var(--muted)]">
                    Evaluation result
                    {scanBatch.length > 1
                      ? ` · ${scanBatch.find((p) => p.pageIndex === scanBatchActive)?.pageLabel ?? ""}`
                      : ""}
                  </p>
                  <p className="text-lg font-bold text-[var(--foreground)]">
                    {scanResult.score.obtained} / {scanResult.score.maximum}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    {scanResult.paper.title}
                    {scanResult.studentName ? ` · Name ${scanResult.studentName}` : ""}
                    {scanResult.rollNumber ? ` · Roll ${scanResult.rollNumber}` : ""}
                  </p>
                  {scanResult.rollDigits && scanResult.rollDigits.length > 0 ? (
                    <p className="mt-1 font-mono text-[11px] text-[var(--muted)]">
                      Roll grid (column → digit):{" "}
                      {scanResult.rollDigits
                        .map((d) => `P${d.position}→${d.digit ?? "—"}`)
                        .join(" · ")}
                    </p>
                  ) : null}
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
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
                </div>
                {scanResult.matchedStudent &&
                (scanSavedMsg ||
                  scanBatch.find((p) => p.pageIndex === scanBatchActive)?.savedMsg) ? (
                  <div className="rounded-md border border-[var(--border)] bg-[var(--card)] p-3">
                    <p className="text-xs font-semibold text-[var(--foreground)]">
                      Saved to student profile
                    </p>
                    {scanSaving ? (
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        Saving analysis notes to {scanResult.matchedStudent.name}…
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-emerald-700">
                        {scanSavedMsg ??
                          scanBatch.find((p) => p.pageIndex === scanBatchActive)?.savedMsg}
                      </p>
                    )}
                  </div>
                ) : scanResult.matchedStudent &&
                  !scanBatch.find((p) => p.pageIndex === scanBatchActive)?.savedMsg ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                    <p className="text-xs font-semibold text-amber-900">
                      Matched {scanResult.matchedStudent.name}
                      {scanResult.matchedStudent.matchedBy === "name"
                        ? " by name"
                        : " by roll"}
                      , but not saved yet.
                    </p>
                    <button
                      type="button"
                      className={`${dashBtnPrimary} mt-3 w-full`}
                      disabled={scanSaving}
                      onClick={() =>
                        void saveScoreToStudent(scanResult, scanResult.matchedStudent!.id)
                      }
                    >
                      {scanSaving ? "Saving…" : "Save score to matched student"}
                    </button>
                  </div>
                ) : (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                    <p className="text-xs font-semibold text-amber-900">
                      {scanResult.studentName
                        ? `No student profile matches the detected name "${scanResult.studentName}".`
                        : scanResult.rollNumber
                          ? `No student profile matches the detected roll number "${scanResult.rollNumber}".`
                          : "Could not detect a student name or roll number on this sheet."}
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
                  <summary className="cursor-pointer text-sm font-medium">
                    Question-wise evaluation
                  </summary>
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
                </p>
              </div>
            ) : scanResultOpen &&
              scanBatch.length > 0 &&
              scanBatch.find((p) => p.pageIndex === scanBatchActive)?.error ? (
              <p className="text-xs text-red-600">
                {scanBatch.find((p) => p.pageIndex === scanBatchActive)?.error}
              </p>
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
