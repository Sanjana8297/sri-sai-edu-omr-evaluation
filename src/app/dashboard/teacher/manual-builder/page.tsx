"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { teacherNavItems } from "@/lib/dashboard-nav";

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

export default function TeacherManualBuilderPage() {
  const [track, setTrack] = useState<"JEE" | "NEET">("JEE");
  const [title, setTitle] = useState("");
  const [questionContent, setQuestionContent] = useState("");
  const [keyContent, setKeyContent] = useState("");
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
  const [bankItems, setBankItems] = useState<QuestionBankItem[]>([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<number[]>([]);
  const [bankOffset, setBankOffset] = useState(0);
  const [bankTotal, setBankTotal] = useState(0);
  const pageSize = 40;

  const loadMe = useCallback(async () => {
    const u = await fetch("/api/me").then((r) => r.json());
    if (u.user?.category) setTrack(u.user.category);
  }, []);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  const loadQuestionBank = useCallback(async () => {
    setBankLoading(true);
    try {
      const params = new URLSearchParams();
      if (bankSubject !== "All") params.set("subject", bankSubject);
      if (bankDifficulty !== "All") params.set("difficulty", bankDifficulty);
      if (bankImportantOnly) params.set("important", "true");
      if (bankRepeatedOnly) params.set("repeated", "true");
      if (bankYear.trim()) params.set("year", bankYear.trim());
      if (bankChapter.trim()) params.set("chapter", bankChapter.trim());
      if (bankSearch.trim()) params.set("search", bankSearch.trim());
      params.set("limit", String(pageSize));
      params.set("offset", String(bankOffset));
      const res = await fetch(`/api/teacher/question-bank?${params.toString()}`);
      const j = await res.json();
      if (!res.ok) {
        setErr(j.error ?? "Could not load question bank");
        return;
      }
      setBankItems(j.questions ?? []);
      setBankTotal(Number(j.total ?? 0));
    } finally {
      setBankLoading(false);
    }
  }, [bankChapter, bankDifficulty, bankImportantOnly, bankOffset, bankRepeatedOnly, bankSearch, bankSubject, bankYear]);

  useEffect(() => {
    void loadQuestionBank();
  }, [loadQuestionBank]);

  useEffect(() => {
    setBankOffset(0);
  }, [bankSubject, bankDifficulty, bankImportantOnly, bankRepeatedOnly, bankYear, bankChapter, bankSearch]);

  const streamSubjects: Record<"JEE" | "NEET", string[]> = {
    JEE: ["Maths", "Physics", "Chemistry"],
    NEET: ["Physics", "Chemistry", "Biology"],
  };

  function toggleQuestionSelection(id: number) {
    setSelectedQuestionIds((prev) =>
      prev.includes(id) ? prev.filter((existingId) => existingId !== id) : [...prev, id]
    );
  }

  function toggleSelectAllCurrentPage() {
    const pageIds = bankItems.map((item) => item.id);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedQuestionIds.includes(id));
    if (allSelected) {
      setSelectedQuestionIds((prev) => prev.filter((id) => !pageIds.includes(id)));
      return;
    }
    setSelectedQuestionIds((prev) => Array.from(new Set([...prev, ...pageIds])));
  }

  function buildContentFromSelected(items: QuestionBankItem[]): { questionContent: string; keyContent: string } {
    const selected = items.filter((item) => selectedQuestionIds.includes(item.id));
    const questionBlocks = selected.map((item, idx) => {
      const optionsBlock =
        item.options && item.options.length
          ? `\n${item.options.map((option, optionIdx) => `(${String.fromCharCode(65 + optionIdx)}) ${option}`).join("\n")}`
          : "";
      return `Q${idx + 1}. ${item.question_text}${optionsBlock}`;
    });
    const keyBlocks = selected.map((item, idx) => `Q${idx + 1}: ${item.correct_answer ?? "N/A"}`);
    return {
      questionContent: questionBlocks.join("\n\n"),
      keyContent: keyBlocks.join("\n"),
    };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    const trimmed = questionContent.trim();
    const { questionContent: generatedQuestionContent, keyContent: generatedKeyContent } =
      selectedQuestionIds.length > 0 ? buildContentFromSelected(bankItems) : { questionContent: "", keyContent: "" };
    const finalQuestionContent = trimmed || generatedQuestionContent;
    const finalKeyContent = keyContent.trim() || generatedKeyContent;
    if (!finalQuestionContent && !questionFile) {
      setErr("Add question text and/or upload a question paper file.");
      return;
    }

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
    setTitle("");
    setQuestionContent("");
    setKeyContent("");
    setQuestionFile(null);
    setSelectedQuestionIds([]);
    setMsg("Question paper saved.");
  }

  return (
    <DashboardShell
      badge="Teacher"
      title="Manual Builder"
      subtitle="Select from question bank with filters and create papers manually."
      navItems={teacherNavItems}
    >
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
        <div className="mb-6 rounded-lg border border-[var(--border)] bg-[var(--background)] p-4">
          <p className="text-sm font-semibold">Manual Builder</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Fetch online-imported question bank and select questions for your paper.
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-4">
            <select className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" value={bankSubject} onChange={(e) => setBankSubject(e.target.value)}>
              <option>All</option>
              {streamSubjects[track].map((subject) => (
                <option key={subject}>{subject}</option>
              ))}
            </select>
            <select className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" value={bankDifficulty} onChange={(e) => setBankDifficulty(e.target.value)}>
              <option>All</option>
              <option>easy</option>
              <option>medium</option>
              <option>hard</option>
            </select>
            <input className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" placeholder="Year (optional)" value={bankYear} onChange={(e) => setBankYear(e.target.value)} />
            <input className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" placeholder="Chapter (optional)" value={bankChapter} onChange={(e) => setBankChapter(e.target.value)} />
          </div>
          <input className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" placeholder="Search keywords" value={bankSearch} onChange={(e) => setBankSearch(e.target.value)} />
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
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
              {bankItems.length > 0 && bankItems.every((item) => selectedQuestionIds.includes(item.id)) ? "Unselect all on page" : "Select all on page"}
            </button>
          </div>
          <div className="mt-3 max-h-80 space-y-2 overflow-auto">
            {bankItems.map((item) => (
              <div key={item.id} className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <label className="inline-flex items-center gap-2">
                    <input type="checkbox" checked={selectedQuestionIds.includes(item.id)} onChange={() => toggleQuestionSelection(item.id)} />
                    Select
                  </label>
                  <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5">{item.subject}</span>
                  {item.year ? <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5">{item.year}</span> : null}
                  {item.chapter ? <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5">{item.chapter}</span> : null}
                  {item.difficulty ? <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5">{item.difficulty}</span> : null}
                  {item.is_important ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">important</span> : null}
                  {item.is_repeated ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">repeated x{item.repetition_count}</span> : null}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm">{item.question_text}</p>
              </div>
            ))}
            {!bankLoading && bankItems.length === 0 ? <p className="text-sm text-[var(--muted)]">No questions match these filters.</p> : null}
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">Selected questions: {selectedQuestionIds.length}. Clicking Save paper will create the paper from these selected questions if the text box is empty.</p>
          <div className="mt-2 flex items-center justify-between text-xs text-[var(--muted)]">
            <p>
              Showing {bankItems.length === 0 ? 0 : bankOffset + 1}-{Math.min(bankOffset + bankItems.length, bankTotal)} of {bankTotal}
            </p>
            <div className="flex items-center gap-2">
              <button type="button" className="rounded-lg border border-[var(--border)] px-2 py-1 disabled:opacity-50" disabled={bankOffset === 0 || bankLoading} onClick={() => setBankOffset((old) => Math.max(old - pageSize, 0))}>
                Prev
              </button>
              <button type="button" className="rounded-lg border border-[var(--border)] px-2 py-1 disabled:opacity-50" disabled={bankLoading || bankOffset + pageSize >= bankTotal} onClick={() => setBankOffset((old) => old + pageSize)}>
                Next
              </button>
            </div>
          </div>
        </div>

        <form className="space-y-3" onSubmit={submit}>
          <input className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2" placeholder="Paper title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <input className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2" value={track} disabled />
          <label className="block text-sm text-[var(--muted)]">
            Question paper file
            <input className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm file:mr-3" type="file" accept=".pdf,.docx,image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setQuestionFile(e.target.files?.[0] ?? null)} />
          </label>
          <textarea className="min-h-[220px] w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2" placeholder="Paste/type the complete question paper here (optional if you upload a file)..." value={questionContent} onChange={(e) => setQuestionContent(e.target.value)} required={!questionFile} />
          <textarea className="min-h-[140px] w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2" placeholder="Answer key (optional)" value={keyContent} onChange={(e) => setKeyContent(e.target.value)} />
          <button className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white" type="submit">
            Save paper
          </button>
        </form>
        {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}
        {msg ? <p className="mt-2 text-sm text-green-700">{msg}</p> : null}
      </div>
    </DashboardShell>
  );
}
