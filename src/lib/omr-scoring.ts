import { compareExamAnswers, parseQuestionPaperContentWithOptions } from "@/lib/exam-paper-parser";
import { NEET_MARKS_CORRECT, NEET_MARKS_WRONG } from "@/lib/neet-exam-structure";
import {
  JEE_MAINS_MARKS_CORRECT,
  JEE_MAINS_MARKS_WRONG,
  isJeeAdvancePaperContent,
} from "@/lib/jee-mains-exam-structure";
import { JEE_ADVANCE_SECTION_MARKS } from "@/lib/jee-advance-exam-structure";

export type ScoringTrack = "NEET" | "JEE" | "JEE_MAINS" | "JEE_ADVANCE";

/** Resolve the marking track from a paper's category and its content (JEE Advance vs JEE Main). */
export function resolveTrackForPaper(category: string, questionContent: string): ScoringTrack {
  if (category === "NEET") return "NEET";
  return isJeeAdvancePaperContent(questionContent) ? "JEE_ADVANCE" : "JEE_MAINS";
}

export type QuestionMarking = {
  correct: number;
  wrong: number;
};

/** Marks awarded per question, resolved from the track and (for JEE Advance) the section type. */
export function markingForQuestion(
  track: ScoringTrack,
  sectionName: string,
  isMcq: boolean
): QuestionMarking {
  if (track === "JEE_ADVANCE") {
    const kind = advanceSectionKind(sectionName, isMcq);
    const marks = JEE_ADVANCE_SECTION_MARKS[kind];
    return { correct: marks.correct, wrong: marks.wrong };
  }

  if (track === "NEET") {
    // Numerical NEET questions carry no negative marking.
    return { correct: NEET_MARKS_CORRECT, wrong: isMcq ? NEET_MARKS_WRONG : 0 };
  }

  // JEE Main / generic JEE: MCQ carries negative marking, numerical does not.
  return { correct: JEE_MAINS_MARKS_CORRECT, wrong: isMcq ? JEE_MAINS_MARKS_WRONG : 0 };
}

function advanceSectionKind(
  sectionName: string,
  isMcq: boolean
): "section1" | "section2" | "section3" {
  const lower = sectionName.toLowerCase();
  if (/section[\s-]*iii/.test(lower) || lower.includes("numerical")) return "section3";
  if (/section[\s-]*ii\b/.test(lower) || lower.includes("one or more") || lower.includes("multiple correct")) {
    return "section2";
  }
  if (/section[\s-]*i\b/.test(lower) || lower.includes("single correct")) return "section1";
  // Fall back on the answer format when the section name is ambiguous.
  return isMcq ? "section1" : "section3";
}

export type TrackScoreResult = {
  obtained: number;
  scoreMax: number;
  correct: number;
  wrong: number;
  unanswered: number;
};

/**
 * Score submitted answers using the marking scheme for the given track.
 * NEET / JEE Main use flat +4/−1 (numerical: no negative); JEE Advance uses
 * per-section marking (Section I +3/−1, Section II +4/−2, Section III +4/0).
 */
export function scoreAnswersForTrack(input: {
  track: ScoringTrack;
  questionContent: string;
  keyContent: string;
  submittedAnswers: Record<string, string>;
}): TrackScoreResult {
  const { sections, answerKey } = parseQuestionPaperContentWithOptions(
    input.questionContent,
    input.keyContent
  );

  let obtained = 0;
  let scoreMax = 0;
  let correct = 0;
  let wrong = 0;
  let unanswered = 0;

  const scoredKeys = new Set<string>();

  for (const section of sections) {
    for (const q of section.questions) {
      const key = `${section.name}::${q.indexInSection}`;
      const expected = answerKey[key];
      if (!expected) continue;
      scoredKeys.add(key);
      const isMcq = q.options.length > 0;
      const marking = markingForQuestion(input.track, section.name, isMcq);
      scoreMax += marking.correct;

      const selected = input.submittedAnswers[key];
      if (!selected) {
        unanswered += 1;
        continue;
      }
      if (compareExamAnswers(selected, expected)) {
        obtained += marking.correct;
        correct += 1;
      } else {
        obtained += marking.wrong;
        wrong += 1;
      }
    }
  }

  // Answer-key entries without a matching parsed question (e.g. key-only papers).
  for (const [key, expected] of Object.entries(answerKey)) {
    if (scoredKeys.has(key)) continue;
    const sectionName = key.split("::")[0] ?? "";
    const isMcq = /^[A-H]$/i.test(expected.trim()) || /^\(?\d\)?$/.test(expected.trim());
    const marking = markingForQuestion(input.track, sectionName, isMcq);
    scoreMax += marking.correct;

    const selected = input.submittedAnswers[key];
    if (!selected) {
      unanswered += 1;
      continue;
    }
    if (compareExamAnswers(selected, expected)) {
      obtained += marking.correct;
      correct += 1;
    } else {
      obtained += marking.wrong;
      wrong += 1;
    }
  }

  return { obtained, scoreMax, correct, wrong, unanswered };
}
