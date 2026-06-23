"use client";

import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { QuestionBankPagination } from "@/components/question-bank/QuestionBankPagination";
import { JeeAdvanceStructurePanel } from "@/components/omr/JeeAdvanceStructurePanel";
import { teacherNavItems } from "@/lib/dashboard-nav";
import {
  JEE_ADVANCE_EXAM_DURATION_HOURS,
  buildDefaultAdvanceSubjects,
  totalExamMarksFromSubjects,
  type JeeAdvanceSubjectConfig,
} from "@/lib/jee-advance-exam-structure";
import {
  buildJeeAdvancePaperContent,
  getJeeAdvanceTotalQuestions,
  type AdvancePaperSlotItem,
} from "@/lib/jee-advance-paper-builder";
import { formatQuestionTextForDisplay } from "@/lib/question-text";
import { ensureFourOptionsForQuestion, parseLetterAnswer } from "@/lib/question-bank-display";
import { prepareQuestionForPaperBlock } from "@/lib/exam-paper-parser";
import { NeetInstructionsPanel } from "@/components/exam/NeetInstructionsPanel";
import { JeeMainsInstructionsPanel } from "@/components/exam/JeeMainsInstructionsPanel";
import { NEET_EXAM_DURATION_MINUTES, NEET_MAX_MARKS } from "@/lib/neet-exam-structure";
import { JEE_MAINS_EXAM_DURATION_MINUTES, JEE_MAINS_MAX_MARKS } from "@/lib/jee-mains-exam-structure";
import { buildQuestionsSearchParams } from "@/hooks/questions/fetch-questions-page";
import { QUESTION_BANK_PAGE_SIZE } from "@/hooks/questions/use-question-bank-paged";
import { useDebouncedValue } from "@/hooks/questions/use-debounced-value";
import type { QuestionBankFilters as QuestionBankQueryFilters } from "@/lib/questions/types";

type QuestionBankItem = {
  id: number;
  subject: string;
  year: number | null;
  chapter: string | null;
  difficulty: "easy" | "medium" | "hard" | null;
  question_text: string;
  options: string[] | null;
  correct_answer: string | null;
  repetition_count: number;
  is_repeated: boolean;
  is_important: boolean;
};

type PaperSlot =
  | { kind: "bank"; id: number }
  | {
      kind: "custom";
      key: string;
      question_text: string;
      options: string[] | null;
      correct_answer: string | null;
    };

function formatOptionsBlock(options: string[] | null): string {
  if (!options || options.length === 0) return "";
  return `\n${options.map((option, optionIdx) => `(${String.fromCharCode(65 + optionIdx)}) ${option}`).join("\n")}`;
}

function resolveSlotOptions(
  questionText: string,
  options: string[] | null,
  correctAnswer: string | null,
  seedId: number
): { options: string[]; correctAnswer: string | null } {
  const ensured = ensureFourOptionsForQuestion({
    questionText,
    options,
    correctAnswer,
    seedId,
  });
  const letter = parseLetterAnswer(ensured.correctAnswer);
  return {
    options: ensured.options,
    correctAnswer: letter ?? ensured.correctAnswer ?? correctAnswer,
  };
}

type WorkflowStep = 0 | 1 | 2 | 3;

function CorrectAnswerBlock({
  correctAnswer,
  options,
}: {
  correctAnswer: string;
  options: string[] | null;
}) {
  const trimmed = correctAnswer.trim();
  const letter = trimmed.toUpperCase();
  const idx =
    letter.length === 1 && letter >= "A" && letter <= "Z" ? letter.charCodeAt(0) - 65 : -1;
  const optionText =
    options && idx >= 0 && idx < options.length ? options[idx] : null;

  return (
    <div className="mt-2 text-xs text-[var(--muted)]">
      <p>
        Correct answer: <strong className="text-[var(--foreground)]">{trimmed}</strong>
      </p>
      {optionText ? (
        <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--foreground)]">
          {formatQuestionTextForDisplay(optionText)}
        </p>
      ) : null}
    </div>
  );
}

function RoadmapNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs text-[var(--muted)]">
      {children}
    </p>
  );
}

/** Highest Q index found in paper body (Q1., Q2:, etc.). */
function countQuestionsInBody(body: string): number {
  if (!body.trim()) return 0;
  let max = 0;
  const re = /\bQ\s*(\d+)\s*[.:]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const n = parseInt(m[1], 10);
    if (!Number.isNaN(n)) max = Math.max(max, n);
  }
  return max;
}

type PostSaveSnapshot = {
  title: string;
  questionBody: string;
  savedAnswerKey: string;
  expectedQuestionCount: number;
  paperId?: string;
};

function TeacherManualBuilderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>(0);

  const goToWorkflowStep = useCallback(
    (step: WorkflowStep) => {
      setWorkflowStep(step);
      const url =
        step === 0 ? "/dashboard/teacher/manual-builder" : `/dashboard/teacher/manual-builder?step=${step}`;
      router.push(url, { scroll: false });
    },
    [router]
  );

  useEffect(() => {
    const stepParam = searchParams.get("step");
    if (stepParam === "1") setWorkflowStep(1);
    else if (stepParam === "2") setWorkflowStep(2);
    else if (stepParam === "3") setWorkflowStep(3);
    else router.replace("/dashboard/teacher/manual-builder?step=1");
  }, [searchParams, router]);
  const [track, setTrack] = useState<"JEE" | "NEET">("JEE");
  const [title, setTitle] = useState("");
  const [questionContent, setQuestionContent] = useState("");
  const [keyContent, setKeyContent] = useState("");
  const [solutionNotes, setSolutionNotes] = useState("");
  const [questionFile, setQuestionFile] = useState<File | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [bankSubject, setBankSubject] = useState("All");
  const [bankDifficulty, setBankDifficulty] = useState("All");
  const [bankImportantOnly, setBankImportantOnly] = useState(true);
  const [bankRepeatedOnly, setBankRepeatedOnly] = useState(false);
  const [bankYear, setBankYear] = useState("");
  const [bankChapter, setBankChapter] = useState("");
  const [bankSearch, setBankSearch] = useState("");
  const [bankExamType, setBankExamType] = useState<"All" | "mains" | "advanced">("All");
  const [bankQuestionType, setBankQuestionType] = useState<"All" | "MCQ" | "Numerical">("All");
  const [bankItems, setBankItems] = useState<QuestionBankItem[]>([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [paperSlots, setPaperSlots] = useState<PaperSlot[]>([]);
  const [selectionDetails, setSelectionDetails] = useState<Map<number, QuestionBankItem>>(() => new Map());
  const [bankPage, setBankPage] = useState(1);
  const bankListTopRef = useRef<HTMLDivElement>(null);
  const [bankTotal, setBankTotal] = useState(0);
  const [dragPaperIndex, setDragPaperIndex] = useState<number | null>(null);

  const [typedQuestionDraft, setTypedQuestionDraft] = useState("");
  const [typedMatchSubject, setTypedMatchSubject] = useState("Physics");
  const [typedLookupLoading, setTypedLookupLoading] = useState(false);
  const [typedLookupError, setTypedLookupError] = useState<string | null>(null);
  const [typedLookupFound, setTypedLookupFound] = useState<QuestionBankItem | null>(null);
  const [typedLookupCompleted, setTypedLookupCompleted] = useState(false);
  const [customAddSaving, setCustomAddSaving] = useState(false);
  const [customOptionsLines, setCustomOptionsLines] = useState("");
  const [customCorrectAnswer, setCustomCorrectAnswer] = useState("");
  const [section1Tab, setSection1Tab] = useState<"bank" | "typed">("bank");
  const [paperPreviewReady, setPaperPreviewReady] = useState(false);

  /** After a successful save, used to show what was stored in section 3. */
  const [postSaveSnapshot, setPostSaveSnapshot] = useState<PostSaveSnapshot | null>(null);

  const [sectionLayout, setSectionLayout] = useState<"single" | "neet_abc" | "jee_adv_abc">("single");
  const [advanceSubjects, setAdvanceSubjects] = useState<JeeAdvanceSubjectConfig[]>(
    buildDefaultAdvanceSubjects
  );
  const [paperDurationMin, setPaperDurationMin] = useState("");
  const [paperMaxMarks, setPaperMaxMarks] = useState("");
  const [langEn, setLangEn] = useState(true);
  const [langTe, setLangTe] = useState(false);
  const [langHi, setLangHi] = useState(false);
  const [headerLogo, setHeaderLogo] = useState(false);
  const [headerDate, setHeaderDate] = useState(true);
  const [headerRollField, setHeaderRollField] = useState(true);
  const [paperSetVariant, setPaperSetVariant] = useState<"none" | "A" | "B" | "C" | "D">("none");

  const pageSize = QUESTION_BANK_PAGE_SIZE;
  const debouncedBankSearch = useDebouncedValue(bankSearch, 300);

  useEffect(() => {
    const bankIds = paperSlots
      .filter((s): s is { kind: "bank"; id: number } => s.kind === "bank")
      .map((s) => s.id);
    setSelectionDetails((prev) => {
      const m = new Map(prev);
      for (const q of bankItems) {
        if (bankIds.includes(q.id)) m.set(q.id, q);
      }
      for (const id of [...m.keys()]) {
        if (!bankIds.includes(id)) m.delete(id);
      }
      return m;
    });
  }, [bankItems, paperSlots]);

  const loadMe = useCallback(async () => {
    const u = await fetch("/api/me").then((r) => r.json());
    if (u.user?.category) setTrack(u.user.category);
  }, []);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  useEffect(() => {
    if (track === "JEE" && sectionLayout === "jee_adv_abc") {
      setPaperDurationMin(String(JEE_ADVANCE_EXAM_DURATION_HOURS * 60));
      setPaperMaxMarks(String(totalExamMarksFromSubjects(advanceSubjects)));
    }
    if (track === "NEET") {
      setPaperDurationMin(String(NEET_EXAM_DURATION_MINUTES));
      setPaperMaxMarks(String(NEET_MAX_MARKS));
    }
    if (track === "JEE" && sectionLayout !== "jee_adv_abc") {
      setPaperDurationMin(String(JEE_MAINS_EXAM_DURATION_MINUTES));
      setPaperMaxMarks(String(JEE_MAINS_MAX_MARKS));
    }
  }, [track, sectionLayout, advanceSubjects]);

  const loadQuestionBank = useCallback(async () => {
    setBankLoading(true);
    try {
      const filters: QuestionBankQueryFilters = { exam: track };
      if (bankSubject !== "All") filters.subject = bankSubject;
      if (bankDifficulty !== "All") filters.difficulty = bankDifficulty as "easy" | "medium" | "hard";
      if (bankImportantOnly) filters.important = true;
      if (bankRepeatedOnly) filters.repeated = true;
      const yearNum = Number(bankYear);
      if (bankYear.trim() && !Number.isNaN(yearNum)) filters.year = yearNum;
      if (bankChapter.trim()) filters.chapter = bankChapter.trim();
      if (debouncedBankSearch.trim()) filters.search = debouncedBankSearch.trim();
      if (track === "JEE" && bankExamType !== "All") filters.jeeExamType = bankExamType;
      if (bankQuestionType === "MCQ") filters.questionType = "mcq";
      if (bankQuestionType === "Numerical") filters.questionType = "numerical";

      const params = buildQuestionsSearchParams(filters, {
        limit: pageSize,
        offset: (bankPage - 1) * pageSize,
        includeTotal: true,
        fullRows: true,
      });
      const res = await fetch(`/api/questions?${params.toString()}`);
      const j = await res.json();
      if (!res.ok) {
        setErr(j.error ?? "Could not load question bank");
        return;
      }
      setBankItems(j.questions ?? []);
      setBankTotal(typeof j.total === "number" ? j.total : 0);
    } finally {
      setBankLoading(false);
    }
  }, [
    bankChapter,
    bankDifficulty,
    bankImportantOnly,
    bankPage,
    bankRepeatedOnly,
    debouncedBankSearch,
    bankSubject,
    bankYear,
    bankExamType,
    bankQuestionType,
    pageSize,
    track,
  ]);

  useEffect(() => {
    void loadQuestionBank();
  }, [loadQuestionBank]);

  useEffect(() => {
    if (workflowStep !== 3 || paperSlots.length === 0) return;
    const missingBank = paperSlots.filter(
      (s): s is { kind: "bank"; id: number } => s.kind === "bank" && !selectionDetails.has(s.id)
    );
    if (missingBank.length > 0) return;
    setKeyContent(buildContentFromSelected().keyContent);
  }, [workflowStep, paperSlots, selectionDetails]);

  useEffect(() => {
    setBankPage(1);
  }, [bankSubject, bankDifficulty, bankImportantOnly, bankRepeatedOnly, bankYear, bankChapter, debouncedBankSearch, bankExamType, bankQuestionType, track]);

  const bankTotalPages = Math.max(1, Math.ceil(bankTotal / pageSize));

  useEffect(() => {
    if (bankPage > bankTotalPages) {
      setBankPage(bankTotalPages);
    }
  }, [bankPage, bankTotalPages]);

  const goToBankPage = useCallback((nextPage: number) => {
    setBankPage(nextPage);
    bankListTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const streamSubjects: Record<"JEE" | "NEET", string[]> = {
    JEE: ["Maths", "Physics", "Chemistry"],
    NEET: ["Physics", "Chemistry", "Botany", "Zoology"],
  };

  useEffect(() => {
    setTypedMatchSubject((s) => (streamSubjects[track].includes(s) ? s : streamSubjects[track][0]));
  }, [track]);

  function toggleQuestionSelection(id: number) {
    const item = bankItems.find((q) => q.id === id);
    setPaperSlots((prev) => {
      const exists = prev.some((s) => s.kind === "bank" && s.id === id);
      if (exists) return prev.filter((s) => !(s.kind === "bank" && s.id === id));
      return [...prev, { kind: "bank", id }];
    });
    if (item) {
      setSelectionDetails((prev) => new Map(prev).set(id, item));
    }
    setPaperPreviewReady(false);
  }

  function toggleSelectAllCurrentPage() {
    const pageIds = bankItems.map((item) => item.id);
    const inPaper = (id: number) => paperSlots.some((s) => s.kind === "bank" && s.id === id);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => inPaper(id));
    if (allSelected) {
      setPaperSlots((prev) => prev.filter((s) => !(s.kind === "bank" && pageIds.includes(s.id))));
      return;
    }
    setPaperSlots((prev) => {
      const without = prev.filter((s) => !(s.kind === "bank" && pageIds.includes(s.id)));
      const existing = new Set(without.filter((s): s is { kind: "bank"; id: number } => s.kind === "bank").map((s) => s.id));
      const additions = pageIds.filter((id) => !existing.has(id)).map((id) => ({ kind: "bank" as const, id }));
      return [...without, ...additions];
    });
    setSelectionDetails((prev) => {
      const m = new Map(prev);
      for (const item of bankItems) {
        if (pageIds.includes(item.id)) m.set(item.id, item);
      }
      return m;
    });
    setPaperPreviewReady(false);
  }

  function deselectAllQuestions() {
    setPaperSlots([]);
    setPaperPreviewReady(false);
  }

  function removePaperSlot(index: number) {
    setPaperSlots((prev) => prev.filter((_, i) => i !== index));
    setPaperPreviewReady(false);
  }

  function movePaperQuestion(from: number, to: number) {
    if (to < 0 || to >= paperSlots.length) return;
    setPaperSlots((prev) => {
      const next = [...prev];
      const [removed] = next.splice(from, 1);
      next.splice(to, 0, removed);
      return next;
    });
    setPaperPreviewReady(false);
  }

  function addBankQuestionToPaper(item: QuestionBankItem) {
    setSelectionDetails((prev) => new Map(prev).set(item.id, item));
    setPaperSlots((prev) => {
      if (prev.some((s) => s.kind === "bank" && s.id === item.id)) return prev;
      return [...prev, { kind: "bank", id: item.id }];
    });
    setPaperPreviewReady(false);
    setMsg(`Added question #${item.id} from the bank to your paper.`);
  }

  function parseCustomOptionsFromLines(text: string): string[] | null {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return null;
    return lines;
  }

  async function addCustomQuestionToPaper() {
    const stem = typedQuestionDraft.trim();
    if (!stem) {
      setErr("Enter the question text before adding a custom question.");
      return;
    }
    setErr(null);
    setCustomAddSaving(true);
    try {
      const rawOpts = parseCustomOptionsFromLines(customOptionsLines) ?? [];
      const optionsPayload = rawOpts.slice(0, 20);
      const correctRaw = customCorrectAnswer.trim();

      const res = await fetch("/api/teacher/question-bank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flexible: true,
          subject: typedMatchSubject,
          questionText: stem,
          options: optionsPayload,
          ...(correctRaw ? { correctAnswer: correctRaw } : {}),
        }),
      });
      const j = (await res.json()) as { id?: number; error?: string; alreadyExisted?: boolean };
      if (!res.ok) {
        setErr(j.error ?? "Could not save this question to the question bank");
        return;
      }
      const id = Number(j.id);
      if (!Number.isFinite(id)) {
        setErr("Unexpected response from server.");
        return;
      }

      const optionsForItem = optionsPayload.length > 0 ? optionsPayload : null;
      let correctStored: string | null = correctRaw.length > 0 ? correctRaw : null;
      if (correctStored && optionsForItem && optionsForItem.length === 4 && /^[a-d]$/i.test(correctStored)) {
        correctStored = correctStored.toUpperCase();
      }

      const newItem: QuestionBankItem = {
        id,
        subject: typedMatchSubject,
        year: null,
        chapter: null,
        difficulty: null,
        question_text: stem,
        options: optionsForItem,
        correct_answer: correctStored,
        repetition_count: 1,
        is_repeated: false,
        is_important: true,
      };
      setSelectionDetails((prev) => new Map(prev).set(id, newItem));
      setPaperSlots((prev) => {
        if (prev.some((s) => s.kind === "bank" && s.id === id)) return prev;
        return [...prev, { kind: "bank", id }];
      });
      setPaperPreviewReady(false);
      setMsg(
        j.alreadyExisted
          ? `That question was already in the bank (#${id}); it has been added to your paper.`
          : `Saved the new question to the question bank (#${id}) and added it to your paper.`
      );
    } finally {
      setCustomAddSaving(false);
    }
  }

  async function runTypedQuestionLookup() {
    setTypedLookupError(null);
    setErr(null);
    setTypedLookupCompleted(false);
    setTypedLookupFound(null);
    const text = typedQuestionDraft.trim();
    if (text.length < 8) {
      setTypedLookupError("Enter at least 8 characters of the question text to check the bank.");
      return;
    }
    setTypedLookupLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("matchText", text);
      params.set("matchSubject", typedMatchSubject);
      const res = await fetch(`/api/teacher/question-bank?${params.toString()}`);
      const j = await res.json();
      if (!res.ok) {
        setTypedLookupError(j.error ?? "Could not check the bank");
        return;
      }
      if (j.match) {
        setTypedLookupFound(j.match as QuestionBankItem);
      } else {
        setTypedLookupFound(null);
      }
      setTypedLookupCompleted(true);
    } finally {
      setTypedLookupLoading(false);
    }
  }

  function collectSlotItems(): AdvancePaperSlotItem[] {
    const items: AdvancePaperSlotItem[] = [];
    for (const slot of paperSlots) {
      if (slot.kind === "bank") {
        const item = selectionDetails.get(slot.id);
        if (!item) continue;
        items.push({
          question_text: item.question_text,
          options: item.options,
          correct_answer: item.correct_answer,
        });
      } else {
        items.push({
          question_text: slot.question_text,
          options: slot.options,
          correct_answer: slot.correct_answer,
        });
      }
    }
    return items;
  }

  const isJeeAdvanceLayout = track === "JEE" && sectionLayout === "jee_adv_abc";
  const jeeAdvanceExpectedCount = getJeeAdvanceTotalQuestions(advanceSubjects);
  const jeeAdvanceTotalMarks = totalExamMarksFromSubjects(advanceSubjects);

  function buildContentFromSelected(): { questionContent: string; keyContent: string; error?: string } {
    if (isJeeAdvanceLayout) {
      return buildJeeAdvancePaperContent(collectSlotItems(), advanceSubjects, formatOptionsBlock);
    }
    const questionBlocks: string[] = [];
    const keyBlocks: string[] = [];
    let idx = 0;
    for (const slot of paperSlots) {
      if (slot.kind === "bank") {
        const item = selectionDetails.get(slot.id);
        if (!item) continue;
        idx += 1;
        const { questionBlock, correctAnswer } = prepareQuestionForPaperBlock({
          questionText: item.question_text,
          options: item.options,
          correctAnswer: item.correct_answer,
          seedId: item.id,
          formatOptionsBlock,
        });
        questionBlocks.push(`Q${idx}. ${questionBlock}`);
        keyBlocks.push(`Q${idx}: ${correctAnswer ?? "N/A"}`);
      } else {
        idx += 1;
        const { questionBlock, correctAnswer } = prepareQuestionForPaperBlock({
          questionText: slot.question_text,
          options: slot.options,
          correctAnswer: slot.correct_answer,
          seedId: idx,
          formatOptionsBlock,
        });
        questionBlocks.push(`Q${idx}. ${questionBlock}`);
        keyBlocks.push(`Q${idx}: ${correctAnswer ?? "N/A"}`);
      }
    }
    return {
      questionContent: questionBlocks.join("\n\n"),
      keyContent: keyBlocks.join("\n"),
    };
  }

  function generateQuestionPaperFromSlots(): boolean {
    setErr(null);
    setMsg(null);
    if (paperSlots.length === 0) {
      setErr("Add at least one question before generating the paper.");
      return false;
    }
    const missingBank = paperSlots.filter(
      (s): s is { kind: "bank"; id: number } => s.kind === "bank" && !selectionDetails.has(s.id)
    );
    if (missingBank.length > 0) {
      setErr(
        `Could not load details for bank question(s) #${missingBank.map((s) => s.id).join(", ")}. Re-select them from the bank list or refresh.`
      );
      return false;
    }
    const built = buildContentFromSelected();
    if (built.error) {
      setErr(built.error);
      return false;
    }
    setQuestionContent(built.questionContent);
    setKeyContent(built.keyContent);
    setPaperPreviewReady(true);
    setMsg(
      isJeeAdvanceLayout
        ? `JEE Advance paper generated (${jeeAdvanceExpectedCount} questions, ${jeeAdvanceTotalMarks} marks). Review the preview below.`
        : `Question paper generated with ${paperSlots.length} question(s). Review the preview below.`
    );
    return true;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    const trimmed = questionContent.trim();
    const { questionContent: generatedQuestionContent, keyContent: generatedKeyContent } =
      paperSlots.length > 0 ? buildContentFromSelected() : { questionContent: "", keyContent: "" };
    const langs = [
      langEn ? "EN" : null,
      langTe ? "Telugu" : null,
      langHi ? "Hindi" : null,
    ]
      .filter(Boolean)
      .join(", ");
    const composerLines = [
      sectionLayout !== "single" ? `Section layout: ${sectionLayout}` : null,
      isJeeAdvanceLayout
        ? `JEE Advance structure: ${JSON.stringify(advanceSubjects.map((s) => ({ subject: s.subject, sections: s.sectionCounts })))}`
        : null,
      paperDurationMin.trim() ? `Duration (min): ${paperDurationMin.trim()}` : null,
      paperMaxMarks.trim() ? `Max marks: ${paperMaxMarks.trim()}` : null,
      langs ? `Languages: ${langs}` : null,
      `Header — logo: ${headerLogo ? "yes" : "no"}, date: ${headerDate ? "yes" : "no"}, roll no. field: ${headerRollField ? "yes" : "no"}`,
      paperSetVariant !== "none" ? `Paper set: ${paperSetVariant}` : null,
    ].filter(Boolean);
    const composerAppend =
      composerLines.length > 0 ? `\n\n--- Paper composer (workflow) ---\n${composerLines.join("\n")}` : "";
    const bodyCore = trimmed || generatedQuestionContent;
    if (!bodyCore) {
      setErr("Add questions in section 1, then generate the paper in section 2 before saving.");
      return;
    }
    const finalQuestionContent = bodyCore + composerAppend;
    const extraKey = solutionNotes.trim() ? `\n\n--- Solutions / notes ---\n${solutionNotes.trim()}` : "";
    const finalKeyContent = generatedKeyContent + extraKey;

    let res: Response;
    if (questionFile) {
      const fd = new FormData();
      fd.append("title", title.trim());
      fd.append("category", track);
      fd.append("questionContent", finalQuestionContent);
      fd.append("keyContent", finalKeyContent);
      fd.append("isAiGenerated", "false");
      fd.append("questionPaperFile", questionFile);
      res = await fetch("/api/teacher/question-papers", { method: "POST", body: fd });
    } else {
      res = await fetch("/api/teacher/question-papers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          questionContent: finalQuestionContent,
          keyContent: finalKeyContent,
          category: track,
          isAiGenerated: false,
        }),
      });
    }
    const j = await res.json();
    if (!res.ok) {
      setErr(j.error ?? "Could not save paper");
      return;
    }

    const rawPaperId = j.paper?.id;
    const paperId = rawPaperId != null && String(rawPaperId).length > 0 ? String(rawPaperId) : undefined;
    const inferredQuestionCount =
      paperSlots.length > 0 ? paperSlots.length : countQuestionsInBody(bodyCore);

    setPostSaveSnapshot({
      title: title.trim(),
      questionBody: bodyCore,
      savedAnswerKey: finalKeyContent,
      expectedQuestionCount: inferredQuestionCount,
      paperId,
    });
    setKeyContent(finalKeyContent);
    goToWorkflowStep(3);

    setTitle(title.trim());
    setQuestionContent(bodyCore);
    setSolutionNotes("");
    setQuestionFile(null);
    setPaperSlots([]);
    setSelectionDetails(new Map());
    setMsg(
      inferredQuestionCount > 0
        ? `Question paper saved with ${inferredQuestionCount} question(s) and an auto-generated answer key.`
        : "Question paper saved with an auto-generated answer key."
    );
  }

  const fullPageSection = workflowStep >= 1;

  return (
    <DashboardShell
      badge="Teacher"
      title="Manual Question Paper Generator"
      subtitle={
        workflowStep === 1
          ? "Select from question bank"
          : workflowStep === 2
            ? "Paper composer"
            : workflowStep === 3
              ? "Answer key & solutions"
              : undefined
      }
      navItems={teacherNavItems}
      fullWidthContent={fullPageSection}
    >
      <div
        className={
          fullPageSection
            ? "flex min-h-0 flex-1 flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm sm:p-6 lg:min-h-[calc(100dvh-10rem)]"
            : "rounded-xl border border-[var(--border)] bg-[var(--card)] p-6"
        }
      >

        {workflowStep === 0 ? (
          <p className="text-sm text-[var(--muted)]">Loading section…</p>
        ) : (
          <div className="mb-6 flex flex-wrap items-center gap-3 border-b border-[var(--border)] pb-4">
            <span className="text-sm text-[var(--muted)]">
              {workflowStep === 1 ? "Section 1 · Questions" : workflowStep === 2 ? "Section 2 · Paper composer" : "Section 3 · Answer key & solutions"}
            </span>
            <span className="text-xs text-[var(--muted)]">Use the sidebar to switch sections.</span>
          </div>
        )}

        {workflowStep === 1 ? (
          <section className="mb-8 space-y-4 rounded-lg border border-[var(--border)] bg-[var(--background)] p-4" aria-labelledby="step1-heading">
            <h2 id="step1-heading" className="text-sm font-semibold">
              1) Add questions to your paper
            </h2>
            <ul className="list-inside list-disc text-xs text-[var(--muted)]">
              <li>Use the bar below to browse the bank or type your own question</li>
              <li>Filters, search, bulk select, and drag-to-reorder in the paper preview</li>
            </ul>

            <div
              className="flex rounded-lg border border-[var(--border)] bg-[var(--card)] p-0.5 text-sm shadow-sm"
              role="tablist"
              aria-label="How to add questions"
            >
              <button
                type="button"
                role="tab"
                aria-selected={section1Tab === "bank"}
                className={`flex-1 rounded-md px-3 py-2 font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--card)] ${
                  section1Tab === "bank"
                    ? "bg-[var(--background)] text-[var(--foreground)] shadow-sm"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
                onClick={() => setSection1Tab("bank")}
              >
                Choose from bank
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={section1Tab === "typed"}
                className={`flex-1 rounded-md px-3 py-2 font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--card)] ${
                  section1Tab === "typed"
                    ? "bg-[var(--background)] text-[var(--foreground)] shadow-sm"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
                onClick={() => setSection1Tab("typed")}
              >
                Type a question
              </button>
            </div>

            {section1Tab === "bank" ? (
            <>
            <div className="mt-3 grid gap-2 md:grid-cols-3 lg:grid-cols-6">
              <select className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" value={bankSubject} onChange={(e) => setBankSubject(e.target.value)}>
                <option>All</option>
                {streamSubjects[track].map((subject) => (
                  <option key={subject}>{subject}</option>
                ))}
              </select>
              {track === "JEE" ? (
                <select
                  className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                  value={bankExamType}
                  onChange={(e) => setBankExamType(e.target.value as "All" | "mains" | "advanced")}
                >
                  <option value="All">All exam types</option>
                  <option value="mains">JEE Mains</option>
                  <option value="advanced">JEE Advanced</option>
                </select>
              ) : (
                <span className="hidden lg:block" />
              )}
              <select
                className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                value={bankQuestionType}
                onChange={(e) => setBankQuestionType(e.target.value as "All" | "MCQ" | "Numerical")}
                title="MCQ: four options or tagged MCQ. Numericals: tagged numerical / fill-in style or fewer than four options with blanks."
              >
                <option value="All">All question types</option>
                <option value="MCQ">MCQ</option>
                <option value="Numerical">Numericals</option>
              </select>
              <select className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" value={bankDifficulty} onChange={(e) => setBankDifficulty(e.target.value)}>
                <option>All</option>
                <option>easy</option>
                <option>medium</option>
                <option>hard</option>
              </select>
              <input className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" placeholder="Year (optional)" value={bankYear} onChange={(e) => setBankYear(e.target.value)} />
              <input className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" placeholder="Chapter (optional)" value={bankChapter} onChange={(e) => setBankChapter(e.target.value)} />
            </div>
            <input className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" placeholder="Search keywords" value={bankSearch} onChange={(e) => setBankSearch(e.target.value)} />
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={bankImportantOnly} onChange={(e) => setBankImportantOnly(e.target.checked)} />
                Important only
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={bankRepeatedOnly} onChange={(e) => setBankRepeatedOnly(e.target.checked)} />
                Repeated only
              </label>
              <button type="button" className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-white" onClick={loadQuestionBank} disabled={bankLoading}>
                {bankLoading ? "Loading..." : "Refresh"}
              </button>
              <button type="button" className="rounded-lg border border-[var(--border)] px-3 py-1.5" onClick={toggleSelectAllCurrentPage} disabled={bankLoading || bankItems.length === 0}>
                {bankItems.length > 0 && bankItems.every((item) => paperSlots.some((s) => s.kind === "bank" && s.id === item.id))
                  ? "Unselect all on page"
                  : "Select all on page"}
              </button>
              <button
                type="button"
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 disabled:opacity-50"
                onClick={deselectAllQuestions}
                disabled={paperSlots.length === 0}
              >
                Deselect all ({paperSlots.length})
              </button>
            </div>

            <div ref={bankListTopRef} className="mt-3 text-sm text-[var(--muted)]">
              {bankLoading && bankItems.length === 0 ? (
                <p>Loading questions…</p>
              ) : bankTotal === 0 ? (
                <p>No questions match these filters for your {track} track.</p>
              ) : (
                <p>
                  Page {bankPage} of {bankTotalPages} · Showing{" "}
                  {(bankPage - 1) * pageSize + 1}–{Math.min(bankPage * pageSize, bankTotal)} of {bankTotal}{" "}
                  question{bankTotal === 1 ? "" : "s"}
                </p>
              )}
            </div>

            <div
              className={`${fullPageSection ? "max-h-[min(68vh,52rem)]" : "max-h-80"} space-y-2 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--card)] p-2`}
            >
              {bankItems.map((item) => {
                const isSelected = paperSlots.some((s) => s.kind === "bank" && s.id === item.id);
                return (
                <div
                  key={item.id}
                  role="checkbox"
                  aria-checked={isSelected}
                  tabIndex={0}
                  onClick={() => toggleQuestionSelection(item.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleQuestionSelection(item.id);
                    }
                  }}
                  className={`rounded-lg border bg-[var(--background)] p-3 outline-none transition hover:bg-[var(--card)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--card)] ${
                    isSelected ? "cursor-pointer border-[var(--accent)] ring-1 ring-[var(--accent)]" : "cursor-pointer border-[var(--border)]"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex select-none items-center gap-2 text-[var(--muted)]">
                      <input
                        type="checkbox"
                        tabIndex={-1}
                        aria-hidden
                        checked={isSelected}
                        onChange={() => {}}
                        className="pointer-events-none accent-[var(--accent)]"
                      />
                      Tap to select
                    </span>
                    <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5">{item.subject}</span>
                    {item.year ? <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5">{item.year}</span> : null}
                    {item.chapter ? <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5">{item.chapter}</span> : null}
                    {item.difficulty ? <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5">{item.difficulty}</span> : null}
                    {item.is_important ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">important</span> : null}
                    {item.is_repeated ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">repeated x{item.repetition_count}</span> : null}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm">{formatQuestionTextForDisplay(item.question_text)}</p>
                  {(() => {
                    const resolved = resolveSlotOptions(
                      item.question_text,
                      item.options,
                      item.correct_answer,
                      item.id
                    );
                    return (
                      <>
                        {resolved.options.length > 0 ? (
                          <ul className="mt-2 list-none space-y-1 text-sm">
                            {resolved.options.map((option, optionIdx) => (
                              <li key={optionIdx} className="whitespace-pre-wrap">
                                <span className="font-medium text-[var(--muted)]">({String.fromCharCode(65 + optionIdx)}) </span>
                                {formatQuestionTextForDisplay(option)}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {resolved.correctAnswer ? (
                          <CorrectAnswerBlock correctAnswer={resolved.correctAnswer} options={resolved.options} />
                        ) : null}
                      </>
                    );
                  })()}
                </div>
              );
              })}
              {!bankLoading && bankItems.length === 0 ? <p className="p-3 text-sm text-[var(--muted)]">No questions match these filters.</p> : null}
            </div>

            {bankTotal > 0 ? (
              <QuestionBankPagination
                page={bankPage}
                totalPages={bankTotalPages}
                onPageChange={goToBankPage}
                disabled={bankLoading}
              />
            ) : null}
            </>
            ) : (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 space-y-3">
              <p className="text-sm font-semibold">Type a question</p>
              <p className="text-xs text-[var(--muted)]">
                Duplicate detection uses the same normalized fingerprint as the database (subject + question text). Pick the subject this item belongs under, paste the full stem, then check the bank. If a row exists, add it from the bank; if not, save it to the bank and add it to your paper with optional options and an answer.
              </p>
              <div className="grid gap-2 md:max-w-md">
                <label className="block text-xs font-medium text-[var(--muted)]">
                  Subject for duplicate check
                  <select
                    className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                    value={typedMatchSubject}
                    onChange={(e) => {
                      setTypedMatchSubject(e.target.value);
                      setTypedLookupCompleted(false);
                      setTypedLookupFound(null);
                    }}
                  >
                    {streamSubjects[track].map((subject) => (
                      <option key={subject} value={subject}>
                        {subject}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block text-xs font-medium text-[var(--muted)]">
                Question text
                <textarea
                  className="mt-1 min-h-[120px] w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                  placeholder="Paste or type the full question stem (LaTeX/HTML is fine)…"
                  value={typedQuestionDraft}
                  onChange={(e) => {
                    setTypedQuestionDraft(e.target.value);
                    setTypedLookupCompleted(false);
                    setTypedLookupFound(null);
                  }}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  onClick={() => void runTypedQuestionLookup()}
                  disabled={typedLookupLoading}
                >
                  {typedLookupLoading ? "Checking…" : "Check question bank"}
                </button>
              </div>
              {typedLookupError ? <p className="text-sm text-red-600">{typedLookupError}</p> : null}
              {typedLookupCompleted && typedLookupFound ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50/90 p-3 text-[var(--foreground)] dark:border-emerald-900 dark:bg-emerald-950/40">
                  <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-100">Found in question bank</p>
                  <div className="mt-2 rounded-md border border-[var(--border)] bg-[var(--background)] p-3 text-sm">
                    <div className="flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                      <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5">{typedLookupFound.subject}</span>
                      {typedLookupFound.year ? (
                        <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5">{typedLookupFound.year}</span>
                      ) : null}
                      {typedLookupFound.chapter ? (
                        <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5">{typedLookupFound.chapter}</span>
                      ) : null}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm">{formatQuestionTextForDisplay(typedLookupFound.question_text)}</p>
                    {(() => {
                      const resolved = resolveSlotOptions(
                        typedLookupFound.question_text,
                        typedLookupFound.options,
                        typedLookupFound.correct_answer,
                        typedLookupFound.id
                      );
                      return (
                        <>
                          {resolved.options.length > 0 ? (
                            <ul className="mt-2 list-none space-y-1 text-sm">
                              {resolved.options.map((option, optionIdx) => (
                                <li key={optionIdx} className="whitespace-pre-wrap">
                                  <span className="font-medium text-[var(--muted)]">({String.fromCharCode(65 + optionIdx)}) </span>
                                  {formatQuestionTextForDisplay(option)}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                          {resolved.correctAnswer ? (
                            <CorrectAnswerBlock correctAnswer={resolved.correctAnswer} options={resolved.options} />
                          ) : null}
                        </>
                      );
                    })()}
                  </div>
                  <button
                    type="button"
                    className="mt-3 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white"
                    onClick={() => addBankQuestionToPaper(typedLookupFound)}
                  >
                    Add this bank question to paper
                  </button>
                </div>
              ) : null}
              {typedLookupCompleted && !typedLookupFound ? (
                <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50/90 p-3 dark:border-amber-900 dark:bg-amber-950/40">
                  <p className="text-xs font-semibold text-amber-950 dark:text-amber-100">No matching bank row</p>
                  <p className="text-xs text-[var(--muted)]">
                    This exact question (under {typedMatchSubject}) is not stored with the same fingerprint. Add options and an answer if you have them, then save to the <strong>question bank</strong> and add it to your paper in one step.
                  </p>
                  <label className="block text-xs font-medium text-[var(--muted)]">
                    Options (optional, one per line — up to 4 lines for A–D)
                    <textarea
                      className="mt-1 min-h-[88px] w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                      placeholder={"Line 1 → (A)\nLine 2 → (B)\n…"}
                      value={customOptionsLines}
                      onChange={(e) => setCustomOptionsLines(e.target.value)}
                    />
                  </label>
                  <label className="block text-xs font-medium text-[var(--muted)]">
                    Answer for this question (key line)
                    <input
                      className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                      placeholder="e.g. A, B, 42, 2.5, N/A"
                      value={customCorrectAnswer}
                      onChange={(e) => setCustomCorrectAnswer(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                    disabled={customAddSaving}
                    onClick={() => void addCustomQuestionToPaper()}
                  >
                    {customAddSaving ? "Saving…" : "Save to question bank & add to paper"}
                  </button>
                </div>
              ) : null}
            </div>
            )}

            <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
              <p className="text-sm font-medium">Preview — questions in paper order ({paperSlots.length})</p>
              <p className="mt-1 text-xs text-[var(--muted)]">Drag a row by the handle, or use ↑ / ↓. Generate the full paper in section 2 (Paper composer).</p>
              {paperSlots.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--muted)]">No questions in the paper yet.</p>
              ) : (
                <ul className="mt-2 space-y-3">
                  {paperSlots.map((slot, paperIdx) => {
                    const listKey = slot.kind === "bank" ? `bank-${slot.id}` : `custom-${slot.key}`;
                    const bankItem = slot.kind === "bank" ? selectionDetails.get(slot.id) : null;
                    const questionText =
                      slot.kind === "custom" ? slot.question_text : bankItem?.question_text ?? null;
                    const rawOptions = slot.kind === "custom" ? slot.options : bankItem?.options ?? null;
                    const rawCorrect =
                      slot.kind === "custom" ? slot.correct_answer : bankItem?.correct_answer ?? null;
                    const seedId = slot.kind === "bank" ? slot.id : paperIdx + 1;
                    const resolved =
                      questionText != null
                        ? resolveSlotOptions(questionText, rawOptions, rawCorrect, seedId)
                        : null;
                    const options = resolved?.options ?? rawOptions;
                    const displayCorrect = resolved?.correctAnswer ?? rawCorrect;
                    const subject = slot.kind === "bank" ? bankItem?.subject : null;

                    return (
                      <li
                        key={listKey}
                        draggable
                        onDragStart={() => setDragPaperIndex(paperIdx)}
                        onDragOver={(ev) => ev.preventDefault()}
                        onDrop={() => {
                          if (dragPaperIndex === null || dragPaperIndex === paperIdx) return;
                          movePaperQuestion(dragPaperIndex, paperIdx);
                          setDragPaperIndex(null);
                        }}
                        onDragEnd={() => setDragPaperIndex(null)}
                        className="rounded-md border border-[var(--border)] bg-[var(--background)] p-3"
                      >
                        <div className="flex items-start gap-2">
                          <span className="cursor-grab select-none pt-0.5 text-[var(--muted)]" title="Drag to reorder">
                            ::
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-semibold text-[var(--muted)]">Q{paperIdx + 1}</span>
                              {slot.kind === "custom" ? (
                                <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-violet-800 dark:bg-violet-950 dark:text-violet-200">
                                  custom
                                </span>
                              ) : subject ? (
                                <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px]">{subject}</span>
                              ) : null}
                              {slot.kind === "bank" && !bankItem ? (
                                <span className="text-[10px] text-amber-700 dark:text-amber-300">Bank #{slot.id} — refresh list to load text</span>
                              ) : null}
                            </div>
                            {questionText ? (
                              <p className="mt-2 whitespace-pre-wrap text-sm">{formatQuestionTextForDisplay(questionText)}</p>
                            ) : null}
                            {options && options.length > 0 ? (
                              <ul className="mt-2 list-none space-y-1 text-sm">
                                {options.map((option, optionIdx) => (
                                  <li key={optionIdx} className="whitespace-pre-wrap">
                                    <span className="font-medium text-[var(--muted)]">({String.fromCharCode(65 + optionIdx)}) </span>
                                    {formatQuestionTextForDisplay(option)}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                            {displayCorrect ? (
                              <CorrectAnswerBlock correctAnswer={displayCorrect} options={options} />
                            ) : null}
                          </div>
                          <span className="flex shrink-0 flex-col gap-0.5">
                            <button type="button" className="rounded border border-[var(--border)] px-1.5 text-xs" disabled={paperIdx === 0} onClick={() => movePaperQuestion(paperIdx, paperIdx - 1)} aria-label="Move up">
                              ↑
                            </button>
                            <button
                              type="button"
                              className="rounded border border-[var(--border)] px-1.5 text-xs"
                              disabled={paperIdx >= paperSlots.length - 1}
                              onClick={() => movePaperQuestion(paperIdx, paperIdx + 1)}
                              aria-label="Move down"
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              className="rounded border border-red-200 px-1.5 text-xs text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
                              onClick={() => removePaperSlot(paperIdx)}
                              aria-label="Remove from paper"
                            >
                              ×
                            </button>
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                disabled={paperSlots.length === 0}
                onClick={() => goToWorkflowStep(2)}
              >
                Next: Paper composer
              </button>
            </div>
          </section>
        ) : null}

        {workflowStep === 2 ? (
          <section className="mb-8 space-y-4 rounded-lg border border-[var(--border)] bg-[var(--background)] p-4" aria-labelledby="step2-heading">
            <h2 id="step2-heading" className="text-sm font-semibold">
              2) Paper composer
            </h2>
            <ul className="list-inside list-disc text-xs text-[var(--muted)]">
              <li>Structure and section builder</li>
              <li>Section A / B / C (NEET / JEE Advanced)</li>
              <li>Duration and max-marks config</li>
              <li>Bilingual (EN / Telugu / Hindi)</li>
              <li>Header: logo, date, roll no. field</li>
              <li>Set A / B / C / D paper shuffling</li>
              <li>Print-ready PDF export</li>
            </ul>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-xs font-medium text-[var(--muted)]">
                Section layout
                <select
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                  value={sectionLayout}
                  onChange={(e) => setSectionLayout(e.target.value as typeof sectionLayout)}
                >
                  <option value="single">Single section (default)</option>
                  {track === "NEET" ? <option value="neet_abc">NEET-style A / B / C</option> : null}
                  {track === "JEE" ? (
                    <option value="jee_adv_abc">JEE Advance (Section I / II / III per subject)</option>
                  ) : null}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs font-medium text-[var(--muted)]">
                  Duration (min)
                  <input
                    className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm disabled:opacity-60"
                    inputMode="numeric"
                    placeholder="e.g. 180"
                    value={paperDurationMin}
                    onChange={(e) => setPaperDurationMin(e.target.value)}
                    disabled={isJeeAdvanceLayout}
                  />
                </label>
                <label className="block text-xs font-medium text-[var(--muted)]">
                  Max marks
                  <input
                    className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm disabled:opacity-60"
                    inputMode="numeric"
                    placeholder="e.g. 300"
                    value={paperMaxMarks}
                    onChange={(e) => setPaperMaxMarks(e.target.value)}
                    disabled={isJeeAdvanceLayout}
                  />
                </label>
              </div>
            </div>

            {track === "NEET" ? (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
                <p className="text-sm font-semibold">NEET (UG) exam instructions</p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Official template — shown before questions in the live exam and in exported PDFs.
                </p>
                <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--background)] p-4">
                  <NeetInstructionsPanel showSummary />
                </div>
              </div>
            ) : null}

            {track === "JEE" && !isJeeAdvanceLayout ? (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
                <p className="text-sm font-semibold">JEE Main exam instructions</p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Official template — shown before questions in the live exam and in exported PDFs.
                </p>
                <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--background)] p-4">
                  <JeeMainsInstructionsPanel showSummary />
                </div>
              </div>
            ) : null}

            {isJeeAdvanceLayout ? (
              <div className="space-y-3">
                <JeeAdvanceStructurePanel subjects={advanceSubjects} onChange={setAdvanceSubjects} />
                <p className="text-xs text-[var(--muted)]">
                  Add exactly <strong>{jeeAdvanceExpectedCount}</strong> questions in section 1, in exam order:
                  Mathematics (Section I → II → III), then Physics, then Chemistry. Current selection:{" "}
                  <strong>{paperSlots.length}</strong>.
                </p>
              </div>
            ) : null}

            <div>
              <p className="text-xs font-medium text-[var(--muted)]">Bilingual paper</p>
              <div className="mt-1 flex flex-wrap gap-3 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={langEn} onChange={(e) => setLangEn(e.target.checked)} />
                  English
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={langTe} onChange={(e) => setLangTe(e.target.checked)} />
                  Telugu
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={langHi} onChange={(e) => setLangHi(e.target.checked)} />
                  Hindi
                </label>
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-[var(--muted)]">Header</p>
              <div className="mt-1 flex flex-wrap gap-3 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={headerLogo} onChange={(e) => setHeaderLogo(e.target.checked)} />
                  Logo placeholder
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={headerDate} onChange={(e) => setHeaderDate(e.target.checked)} />
                  Date line
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={headerRollField} onChange={(e) => setHeaderRollField(e.target.checked)} />
                  Roll no. field
                </label>
              </div>
            </div>

            <label className="block text-xs font-medium text-[var(--muted)]">
              Set-wise shuffling (paper code)
              <select className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" value={paperSetVariant} onChange={(e) => setPaperSetVariant(e.target.value as typeof paperSetVariant)}>
                <option value="none">No set label</option>
                <option value="A">Set A</option>
                <option value="B">Set B</option>
                <option value="C">Set C</option>
                <option value="D">Set D</option>
              </select>
            </label>

            <RoadmapNote>
              Section layout, timing, languages, header blocks, and set codes are saved with your paper metadata. Questions come from section 1—use Generate Question Paper below before continuing.
            </RoadmapNote>

            {paperSlots.length > 0 ? (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
                <p className="text-sm font-medium">Paper title</p>
                <input
                  className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                  placeholder="e.g. Physics Unit Test — March 2026"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <p className="mt-2 text-xs text-[var(--muted)]">
                  {paperSlots.length} question(s) from section 1
                  {paperPreviewReady ? " · paper generated" : " · click Generate Question Paper below"}
                </p>
              </div>
            ) : (
              <p className="text-xs text-amber-800 dark:text-amber-200">
                Add questions in section 1, then return here to set layout and generate the paper.
              </p>
            )}

            {paperPreviewReady && questionContent.trim() ? (
              <div className="rounded-lg border-2 border-[var(--accent)] bg-[var(--card)] p-4">
                <p className="text-sm font-semibold">Generated question paper preview</p>
                <p className="mt-1 text-xs text-[var(--muted)]">{paperSlots.length} question(s) in exam order</p>
                {track === "NEET" ? (
                  <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--background)] p-4">
                    <NeetInstructionsPanel />
                  </div>
                ) : null}
                {track === "JEE" && !isJeeAdvanceLayout ? (
                  <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--background)] p-4">
                    <JeeMainsInstructionsPanel />
                  </div>
                ) : null}
                <div className="mt-3 max-h-80 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                    {formatQuestionTextForDisplay(questionContent)}
                  </pre>
                </div>
                {keyContent.trim() ? (
                  <>
                    <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Answer key preview</p>
                    <div className="mt-2 max-h-40 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
                      <pre className="whitespace-pre-wrap font-mono text-xs">{keyContent}</pre>
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <button type="button" className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm" onClick={() => goToWorkflowStep(1)}>
                Back
              </button>
              <button
                type="button"
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                disabled={paperSlots.length === 0}
                onClick={() => generateQuestionPaperFromSlots()}
              >
                Generate Question Paper
              </button>
              <button
                type="button"
                className="rounded-lg border border-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent)] disabled:opacity-50"
                disabled={paperSlots.length === 0 || !paperPreviewReady}
                onClick={() => goToWorkflowStep(3)}
              >
                Next: Answer key & solutions
              </button>
              <button type="button" className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm opacity-60" disabled title="Coming soon">
                Export PDF
              </button>
            </div>
          </section>
        ) : null}

        {workflowStep !== 0 ? (
        <form className="space-y-4" onSubmit={submit}>
          {workflowStep === 2 || workflowStep === 3 ? (
            <>
              {workflowStep === 3 ? (
                <section className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--background)] p-4" aria-labelledby="step3-heading">
                  <h2 id="step3-heading" className="text-sm font-semibold">
                    3) Answer key & solutions
                  </h2>
                  <ul className="list-inside list-disc text-xs text-[var(--muted)]">
                    <li>Answer key is built automatically from your selected questions</li>
                    <li>Add optional worked solutions before saving</li>
                  </ul>

                  {postSaveSnapshot ? (
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--accent-soft)] px-3 py-2 text-sm">
                      <p className="font-medium text-[var(--foreground)]">Last saved on this page</p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        Title: <span className="text-[var(--foreground)]">{postSaveSnapshot.title}</span>
                        {postSaveSnapshot.paperId ? (
                          <span className="ml-2 font-mono text-[var(--muted)]">({postSaveSnapshot.paperId})</span>
                        ) : null}
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        Questions:{" "}
                        {postSaveSnapshot.expectedQuestionCount > 0 ? postSaveSnapshot.expectedQuestionCount : "—"}
                      </p>
                    </div>
                  ) : null}

                  {paperPreviewReady && keyContent.trim() ? (
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
                      <p className="text-sm font-medium">Auto-generated answer key</p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        One line per question from bank answers ({paperSlots.length} question{paperSlots.length === 1 ? "" : "s"})
                      </p>
                      <div className="mt-2 max-h-48 overflow-auto rounded border border-[var(--border)] bg-[var(--background)] p-2">
                        <pre className="whitespace-pre-wrap font-mono text-xs">{keyContent}</pre>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-amber-800 dark:text-amber-200">
                      Generate the question paper in section 2 first—the answer key will appear here automatically.
                    </p>
                  )}

                  <label className="block text-sm text-[var(--muted)]">
                    Solutions / worked steps (appended to saved key block)
                    <textarea className="mt-1 min-h-[140px] w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2" placeholder="Optional step-by-step solutions…" value={solutionNotes} onChange={(e) => setSolutionNotes(e.target.value)} />
                  </label>

                  <RoadmapNote>
                    The answer key is generated from correct answers stored with each bank question. Questions without an answer are marked N/A in the key.
                  </RoadmapNote>

                  <label className="block text-sm font-medium text-[var(--foreground)]">
                    Paper title (required to save)
                    <input className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2" placeholder="Paper title" value={title} onChange={(e) => setTitle(e.target.value)} required />
                  </label>
                  {paperPreviewReady && questionContent.trim() ? (
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
                      <p className="text-xs font-medium text-[var(--foreground)]">Question paper ({paperSlots.length} questions)</p>
                      <div className="mt-2 max-h-48 overflow-auto rounded border border-[var(--border)] bg-[var(--background)] p-2">
                        <pre className="whitespace-pre-wrap text-xs">
                          {formatQuestionTextForDisplay(questionContent)}
                        </pre>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-amber-800 dark:text-amber-200">
                      Generate the paper in section 2 first ({paperSlots.length} question(s) selected).
                      <button type="button" className="ml-1 text-[var(--accent)] underline" onClick={() => goToWorkflowStep(1)}>
                        Go to section 1
                      </button>
                    </p>
                  )}
                  <button type="button" className="mt-1 text-xs text-[var(--accent)] underline" onClick={() => goToWorkflowStep(2)}>
                    Open paper composer
                  </button>

                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm" onClick={() => goToWorkflowStep(2)}>
                      Back: Paper composer
                    </button>
                    <button type="button" className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm" onClick={() => goToWorkflowStep(1)}>
                      Bank
                    </button>
                  </div>
                </section>
              ) : null}

              {workflowStep === 2 ? (
                <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
                  <button type="button" className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm" onClick={() => goToWorkflowStep(1)}>
                    Back: Question bank
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    disabled={paperSlots.length === 0 || !paperPreviewReady}
                    onClick={() => goToWorkflowStep(3)}
                  >
                    Continue to answer key
                  </button>
                </div>
              ) : null}

              {workflowStep === 3 ? (
                <button className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white" type="submit">
                  Save paper
                </button>
              ) : null}
            </>
          ) : null}

          {workflowStep === 1 ? (
            <p className="text-xs text-[var(--muted)]">
              Add questions in section 1, then use <strong>Generate Question Paper</strong> in <strong>Paper composer</strong> before saving in <strong>Answer key & solutions</strong>.
            </p>
          ) : null}
        </form>
        ) : null}

        {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}
        {msg ? <p className="mt-2 text-sm text-green-700">{msg}</p> : null}
      </div>
    </DashboardShell>
  );
}

export default function TeacherManualBuilderPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-[var(--muted)]">
          Loading…
        </div>
      }
    >
      <TeacherManualBuilderPage />
    </Suspense>
  );
}
