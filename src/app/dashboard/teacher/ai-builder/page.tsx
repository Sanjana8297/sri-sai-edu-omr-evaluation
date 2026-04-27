"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { teacherNavItems } from "@/lib/dashboard-nav";

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
  const [track, setTrack] = useState<"JEE" | "NEET">("JEE");
  const [title, setTitle] = useState("");
  const [questionContent, setQuestionContent] = useState("");
  const [keyContent, setKeyContent] = useState("");
  const [questionFile, setQuestionFile] = useState<File | null>(null);
  const [aiSubject, setAiSubject] = useState("");
  const [aiDurationMinutes, setAiDurationMinutes] = useState(180);
  const [aiTotalQuestions, setAiTotalQuestions] = useState(90);
  const [aiDifficultyDistribution, setAiDifficultyDistribution] = useState("30% easy, 50% medium, 20% hard");
  const [aiExtraInstructions, setAiExtraInstructions] = useState("");
  const [blueprint, setBlueprint] = useState<PaperBlueprint | null>(null);
  const [aiWarnings, setAiWarnings] = useState<string[]>([]);
  const [aiValidationIssues, setAiValidationIssues] = useState<string[]>([]);
  const [aiValidationPasses, setAiValidationPasses] = useState<string[]>([]);
  const [aiComposed, setAiComposed] = useState(false);
  const [loadingBlueprint, setLoadingBlueprint] = useState(false);
  const [loadingCompose, setLoadingCompose] = useState(false);
  const [loadingValidate, setLoadingValidate] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadMe = useCallback(async () => {
    const u = await fetch("/api/me").then((r) => r.json());
    if (u.user?.category) setTrack(u.user.category);
  }, []);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  async function generateBlueprint() {
    setErr(null);
    setMsg(null);
    setLoadingBlueprint(true);
    try {
      const res = await fetch("/api/teacher/question-papers/ai/blueprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: aiSubject.trim(),
          durationMinutes: aiDurationMinutes,
          totalQuestions: aiTotalQuestions,
          difficultyDistribution: aiDifficultyDistribution.trim(),
          extraInstructions: aiExtraInstructions.trim(),
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
      const res = await fetch("/api/teacher/question-papers/ai/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || `${blueprint.subject} Mock Test`,
          blueprint,
          additionalConstraints: aiExtraInstructions.trim(),
          saveAsPaper: false,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setErr(j.error ?? "Could not compose paper");
        return;
      }
      const generated = j.generated as { questionContent: string; keyContent: string; warnings: string[] };
      setTitle((old) => old.trim() || `${blueprint.subject} Mock Test`);
      setQuestionContent(generated.questionContent);
      setKeyContent(generated.keyContent);
      setAiWarnings(generated.warnings ?? []);
      setAiComposed(true);
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
    if (!trimmed && !questionFile) {
      setErr("Add question text and/or upload a question paper file.");
      return;
    }

    let res: Response;
    if (questionFile) {
      const fd = new FormData();
      fd.append("title", title.trim());
      fd.append("category", track);
      fd.append("questionContent", trimmed);
      fd.append("keyContent", keyContent.trim());
      fd.append("isAiGenerated", aiComposed ? "true" : "false");
      fd.append("aiPromptVersion", aiComposed ? "v1" : "");
      if (blueprint) fd.append("aiConfig", JSON.stringify(blueprint));
      if (aiWarnings.length) fd.append("generationMeta", JSON.stringify({ warnings: aiWarnings }));
      fd.append("questionPaperFile", questionFile);
      res = await fetch("/api/teacher/question-papers", { method: "POST", body: fd });
    } else {
      res = await fetch("/api/teacher/question-papers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          questionContent: trimmed,
          keyContent: keyContent.trim(),
          category: track,
          isAiGenerated: aiComposed,
          aiPromptVersion: aiComposed ? "v1" : null,
          aiConfig: blueprint,
          generationMeta: aiWarnings.length ? { warnings: aiWarnings } : null,
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
    setAiComposed(false);
    setMsg("Question paper saved.");
  }

  return (
    <DashboardShell
      badge="Teacher"
      title="AI Builder Configuration"
      subtitle="Generate blueprint, compose paper, validate, and save."
      navItems={teacherNavItems}
    >
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
        <div className="mb-6 rounded-lg border border-[var(--border)] bg-[var(--background)] p-4">
          <p className="text-sm font-semibold">AI Paper Configuration</p>
          <p className="mt-1 text-xs text-[var(--muted)]">Generate blueprint, compose paper, then validate before saving.</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <input className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2" placeholder="Subject (e.g., Physics)" value={aiSubject} onChange={(e) => setAiSubject(e.target.value)} />
            <input className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2" value={track} disabled />
            <input className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2" type="number" min={1} max={480} value={aiDurationMinutes} onChange={(e) => setAiDurationMinutes(Number(e.target.value || 0))} placeholder="Duration minutes" />
            <input className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2" type="number" min={1} max={300} value={aiTotalQuestions} onChange={(e) => setAiTotalQuestions(Number(e.target.value || 0))} placeholder="Total questions" />
          </div>
          <textarea className="mt-3 min-h-[70px] w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" placeholder="Difficulty split (e.g., 30% easy, 50% medium, 20% hard)" value={aiDifficultyDistribution} onChange={(e) => setAiDifficultyDistribution(e.target.value)} />
          <textarea className="mt-3 min-h-[90px] w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" placeholder="Additional constraints (syllabus focus, question style, etc.)" value={aiExtraInstructions} onChange={(e) => setAiExtraInstructions(e.target.value)} />
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-medium text-white disabled:opacity-60" type="button" disabled={loadingBlueprint} onClick={generateBlueprint}>
              {loadingBlueprint ? "Generating blueprint..." : "1) Generate Blueprint"}
            </button>
            <button className="rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-medium text-white disabled:opacity-60" type="button" disabled={!blueprint || loadingCompose} onClick={composePaper}>
              {loadingCompose ? "Composing..." : "2) Compose Paper"}
            </button>
            <button className="rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-medium text-white disabled:opacity-60" type="button" disabled={!blueprint || loadingValidate} onClick={validatePaper}>
              {loadingValidate ? "Validating..." : "3) Validate"}
            </button>
          </div>
          {blueprint ? <pre className="mt-3 max-h-64 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 text-xs">{JSON.stringify(blueprint, null, 2)}</pre> : null}
          {aiWarnings.length ? <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900"><p className="font-semibold">AI warnings</p><ul className="mt-1 list-disc pl-5">{aiWarnings.map((warning, idx) => <li key={`${warning}-${idx}`}>{warning}</li>)}</ul></div> : null}
          {aiValidationIssues.length ? <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-900"><p className="font-semibold">Validation issues</p><ul className="mt-1 list-disc pl-5">{aiValidationIssues.map((issue, idx) => <li key={`${issue}-${idx}`}>{issue}</li>)}</ul></div> : null}
          {aiValidationPasses.length ? <div className="mt-3 rounded-lg border border-green-300 bg-green-50 p-3 text-xs text-green-900"><p className="font-semibold">Validation checks passed</p><ul className="mt-1 list-disc pl-5">{aiValidationPasses.map((pass, idx) => <li key={`${pass}-${idx}`}>{pass}</li>)}</ul></div> : null}
        </div>

        <form className="space-y-3" onSubmit={submit}>
          <input className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2" placeholder="Paper title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <input className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2" value={track} disabled />
          <label className="block text-sm text-[var(--muted)]">
            Question paper file
            <input className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm file:mr-3" type="file" accept=".pdf,.docx,image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setQuestionFile(e.target.files?.[0] ?? null)} />
          </label>
          <textarea className="min-h-[220px] w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2" placeholder="Paste/type the complete question paper here (optional if you upload a file)..." value={questionContent} onChange={(e) => setQuestionContent(e.target.value)} required={!questionFile} />
          <textarea className="min-h-[140px] w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2" placeholder="Answer key (optional, AI compose fills this for you)" value={keyContent} onChange={(e) => setKeyContent(e.target.value)} />
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
