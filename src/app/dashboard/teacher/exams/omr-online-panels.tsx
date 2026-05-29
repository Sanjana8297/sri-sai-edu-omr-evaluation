"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { FeatureActivityHub, type ActivityFeature } from "@/components/FeatureActivityHub";
import { DEFAULT_CBT_SETTINGS, type BilingualMode, type CbtSettings } from "@/lib/cbt-settings";
import { JeeAdvanceStructurePanel } from "@/components/omr/JeeAdvanceStructurePanel";
import {
  JEE_ADVANCE_EXAM_DURATION_HOURS,
  JEE_ADVANCE_QUESTIONS_PER_SUBJECT,
  buildDefaultAdvanceSubjects,
  validateSubjectSectionCounts,
} from "@/lib/jee-advance-exam-structure";
import type { JeeAdvanceSubjectConfig, OmrExamPreset } from "@/lib/omr-template";
import {
  downloadOmrBundlePdf,
  downloadOmrSheetPdf,
  JEE_MAINS_SECTION_COPY,
  OMR_LAYOUT,
  type OmrTrack,
} from "@/lib/omr-pdf";

type Paper = { id: string; title: string; category: string };

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
  { id: "bilingual", title: "Bilingual question toggle", description: "English / Hindi stems during CBT" },
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
  const [examPreset, setExamPreset] = useState<ExamPreset>("NEET");
  const [rollDigits, setRollDigits] = useState(10);
  const [advanceSubjects, setAdvanceSubjects] = useState<JeeAdvanceSubjectConfig[]>(
    buildDefaultAdvanceSubjects
  );
  const [bundlePaper, setBundlePaper] = useState("");
  const [papers, setPapers] = useState<Paper[]>([]);
  const [scanName, setScanName] = useState<string | null>(null);
  const [sensitivity, setSensitivity] = useState(72);
  const [flagSmudge, setFlagSmudge] = useState(true);
  const [flagDoubleMark, setFlagDoubleMark] = useState(true);
  const [flagBlankRoll, setFlagBlankRoll] = useState(true);
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [bundleCopies, setBundleCopies] = useState(30);
  const [bundleLoading, setBundleLoading] = useState(false);
  const [bundleMsg, setBundleMsg] = useState<string | null>(null);
  const [bundleErr, setBundleErr] = useState<string | null>(null);
  const [templateLoading, setTemplateLoading] = useState(true);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateMsg, setTemplateMsg] = useState<string | null>(null);
  const [templateErr, setTemplateErr] = useState<string | null>(null);
  const [templateSavedForNextStep, setTemplateSavedForNextStep] = useState(false);

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
      advance:
        examPreset === "JEE_ADVANCE"
          ? {
              examDurationHours: JEE_ADVANCE_EXAM_DURATION_HOURS,
              questionsPerSubject: JEE_ADVANCE_QUESTIONS_PER_SUBJECT,
              subjects: advanceSubjects,
            }
          : undefined,
    }),
    [omrTrack, rollDigits, layout, bundleCopies, examPreset, advanceSubjects]
  );

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
      const res = await fetch(`/api/teacher/question-papers/${encodeURIComponent(bundlePaper)}`);
      const json = await res.json();
      if (!res.ok) {
        setBundleErr(json.error ?? "Could not load question paper");
        return;
      }
      const paper = json.paper as { title: string; questionContent: string; keyContent?: string | null; questionPaperUrl?: string | null };
      if (!paper.questionContent?.trim() && paper.questionPaperUrl) {
        setBundleErr(
          "This paper is stored as an uploaded file only. Add question text in the paper editor to include it in the bundle, or download the file from Completed Exam Papers."
        );
        return;
      }
      if (!paper.questionContent?.trim()) {
        setBundleErr("This question paper has no text content to bundle.");
        return;
      }
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
  }, [bundlePaper, buildOmrOpts]);

  useEffect(() => {
    void fetch("/api/teacher/question-papers")
      .then((res) => res.json())
      .then((json) => {
        if (json.papers) setPapers(json.papers);
      });
  }, []);

  useEffect(() => {
    void (async () => {
      setTemplateLoading(true);
      setTemplateErr(null);
      try {
        const res = await fetch("/api/teacher/omr-template");
        const json = await res.json();
        if (!res.ok) {
          setTemplateErr(json.error ?? "Could not load saved template");
          return;
        }
        const s = json.settings as {
          track?: string;
          rollDigits?: number;
          examPreset?: ExamPreset;
          advance?: { subjects?: JeeAdvanceSubjectConfig[] };
        };
        setExamPreset(trackToPreset(s.examPreset ?? s.track));
        if (typeof s.rollDigits === "number" && !Number.isNaN(s.rollDigits)) {
          setRollDigits(Math.min(12, Math.max(6, s.rollDigits)));
        }
        if (Array.isArray(s.advance?.subjects) && s.advance.subjects.length > 0) {
          setAdvanceSubjects(s.advance.subjects);
        }
      } catch {
        setTemplateErr("Could not load saved template.");
      } finally {
        setTemplateLoading(false);
      }
    })();
  }, []);

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

  function runDetection() {
    if (!scanName) {
      setScanStatus("Upload or capture an OMR sheet first.");
      return;
    }
    setScanStatus(
      `Scan queued at ${sensitivity}% sensitivity — review flagged bubbles after processing.`,
    );
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
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              >
                <option value="NEET">NEET</option>
                <option value="JEE_MAINS">JEE Main</option>
                <option value="JEE_ADVANCE">JEE Advance</option>
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
            ) : examPreset === "JEE_MAINS" ? (
              <div className="rounded-lg border-2 border-black bg-white p-4 text-[11px] text-black shadow-sm">
                <p className="mb-2 font-medium">Template preview</p>
                <div className="flex items-start justify-between gap-4 border-2 border-black p-3">
                  <div className="w-[240px] max-w-full">
                    <Image
                      src="/images/Sri-Sai-logo.png"
                      alt="Sri Sai Educational Institutions"
                      width={240}
                      height={85}
                      className="h-auto w-full object-contain"
                    />
                  </div>
                  <div className="flex-1 text-right font-semibold">
                    <p>JEE MAINS MODEL</p>
                    <p>Max. Marks: 300</p>
                    <p>Roll grid: {rollDigits} columns</p>
                  </div>
                </div>
                <div className="mt-3 space-y-3 border border-black p-3">
                  <div className="border-y border-black py-2 text-center">
                    <p className="font-bold">{JEE_MAINS_SECTION_COPY.section1.title}</p>
                    <p className="font-bold">{JEE_MAINS_SECTION_COPY.section1.subtitle}</p>
                  </div>
                  {JEE_MAINS_SECTION_COPY.section1.lines.map((line) => (
                    <p key={line} className="leading-5">
                      {line}
                    </p>
                  ))}
                  <div className="border-y border-black py-2 text-center">
                    <p className="font-bold">{JEE_MAINS_SECTION_COPY.section2.title}</p>
                    <p className="font-bold">{JEE_MAINS_SECTION_COPY.section2.subtitle}</p>
                  </div>
                  {JEE_MAINS_SECTION_COPY.section2.lines.map((line) => (
                    <p key={line} className="leading-5">
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--background)] p-4 text-xs text-[var(--muted)]">
                <p className="font-medium text-[var(--foreground)]">Template preview</p>
                <p className="mt-2">
                  {layout.questions} bubbles - {layout.sections}
                </p>
                <p className="mt-1">Roll grid: {rollDigits} columns - OMR blocks A-D</p>
              </div>
            )}
            <button
              type="button"
              className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              disabled={templateLoading || templateSaving}
              onClick={() => void saveOmrTemplate()}
            >
              {templateSaving ? "Saving…" : "Save template"}
            </button>
            <button
              type="button"
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-[var(--background)] disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => {
                if (!templateSavedForNextStep) {
                  setTemplateErr("Save the Template first");
                  return;
                }
                actions.openFeature("bundle");
              }}
              disabled={!templateSavedForNextStep}
            >
              Print-ready OMR + paper bundle
            </button>
            {!templateSavedForNextStep ? (
              <p className="text-xs text-red-600">Save the Template first</p>
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
                    setExamPreset(trackToPreset(paper.category));
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
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              />
            </label>
            <p className="text-xs text-[var(--muted)]">
              Uses track & roll columns from OMR template designer ({omrTrack}, {rollDigits} digits).
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                disabled={!bundlePaper || bundleLoading}
                onClick={() => void downloadOmrOnly()}
              >
                Download OMR PDF
              </button>
              <button
                type="button"
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-50"
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
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--background)] px-4 py-8 text-center text-sm text-[var(--muted)] hover:border-[var(--accent)]">
              <span className="font-medium text-[var(--foreground)]">Drop image or PDF</span>
              <span className="mt-1 text-xs">JPG, PNG, or multi-page PDF</span>
              <input
                type="file"
                accept="image/*,.pdf"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  setScanName(file?.name ?? null);
                  setScanStatus(null);
                }}
              />
            </label>
            {scanName ? <p className="text-xs text-[var(--muted)]">Selected: {scanName}</p> : null}
            <button
              type="button"
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              onClick={() => setScanName("webcam-capture-preview.jpg")}
            >
              Open camera capture
            </button>
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
                className="mt-3 w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white"
                onClick={runDetection}
              >
                Run bubble detection
              </button>
              {scanStatus ? <p className="mt-3 text-xs text-[var(--muted)]">{scanStatus}</p> : null}
            </div>
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

  return <FeatureActivityHub features={OMR_ACTIVITIES} renderFeature={renderFeature} resetKey={resetKey} />;
}

export function OnlineExamModulePanel({ resetKey: _resetKey }: { resetKey?: string }) {
  const [settings, setSettings] = useState<CbtSettings | null>(null);
  const [savedSettings, setSavedSettings] = useState<CbtSettings | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/teacher/cbt-settings");
        const text = await res.text();
        if (!text) {
          const defaults = { ...DEFAULT_CBT_SETTINGS };
          setSettings(defaults);
          setSavedSettings(defaults);
          return;
        }
        const json = JSON.parse(text) as { settings?: CbtSettings };
        const loaded = json.settings ?? { ...DEFAULT_CBT_SETTINGS };
        setSettings(loaded);
        setSavedSettings(loaded);
      } catch {
        const defaults = { ...DEFAULT_CBT_SETTINGS };
        setSettings(defaults);
        setSavedSettings(defaults);
      }
    })();
  }, []);

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
      case "bilingual":
        return (
          <>
            <label className="block text-xs text-[var(--muted)]">
              Default language mode
              <select
                value={cbt.bilingualMode}
                onChange={(e) => update({ bilingualMode: e.target.value as BilingualMode })}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              >
                <option value="en">English only</option>
                <option value="hi">Hindi only</option>
                <option value="both">Bilingual (toggle per question)</option>
              </select>
            </label>
            <p className="mt-3 text-xs text-[var(--muted)]">
              Format stems as <span className="font-mono text-[11px]">English | Hindi</span> in your question paper.
            </p>
          </>
        );
      default:
        return null;
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--muted)]">
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
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 sm:p-6"
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
            className="rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
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
