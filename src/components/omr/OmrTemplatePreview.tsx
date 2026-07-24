"use client";

import { useMemo } from "react";
import type { OmrExamPreset } from "@/lib/omr-template";
import type { JeeAdvanceSubjectConfig } from "@/lib/jee-advance-exam-structure";
import { buildOmrSheetHtml } from "@/lib/omr-sheet-html";
import type { OmrTrack } from "@/lib/omr-pdf";

type OmrTemplatePreviewProps = {
  examPreset: OmrExamPreset;
  rollDigits: number;
  questionCount: number;
  sectionsLabel: string;
  advanceSubjects?: JeeAdvanceSubjectConfig[];
};

function presetToTrack(preset: OmrExamPreset): OmrTrack {
  if (preset === "NEET") return "NEET";
  if (preset === "JEE_ADVANCE") return "JEE_ADVANCE";
  return "JEE_MAINS";
}

export function OmrTemplatePreview({
  examPreset,
  questionCount,
  sectionsLabel,
}: OmrTemplatePreviewProps) {
  const track = presetToTrack(examPreset);
  const html = useMemo(
    () =>
      buildOmrSheetHtml({
        track,
        questionCount,
        paperTitle: "Template preview",
        copies: 1,
      }),
    [track, questionCount]
  );

  return (
    <div className="space-y-2">
      <p className="text-xs text-[var(--muted)]">
        OMR sheet preview · {questionCount} responses · {sectionsLabel}. Roll number and other
        header grids stay fixed; only answer rows follow the selected exam track.
      </p>
      <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-white shadow-sm">
        <iframe
          title="OMR sheet preview"
          srcDoc={html}
          className="h-[720px] w-full bg-white"
        />
      </div>
    </div>
  );
}
