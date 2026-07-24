import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import {
  compareExamAnswers,
  parseQuestionPaperContentWithOptions,
} from "@/lib/exam-paper-parser";
import { detectOmrBubbles } from "@/lib/omr-bubble-detect";
import { resolveTrackForPaper, scoreAnswersForTrack } from "@/lib/omr-scoring";
import { matchStudentForOmr } from "@/lib/omr-student-match";
import { getAiConfigError } from "@/lib/ai-paper-config";
import { getTeacherOmrTemplate } from "@/lib/omr-template-db";
import { OMR_SHEET_ROLL_COLUMNS } from "@/lib/omr-sheet-html";
import { OMR_LAYOUT, type OmrTrack } from "@/lib/omr-pdf";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function orderedQuestionIds(
  questionContent: string,
  keyContent: string
): { ids: string[]; answerKey: Record<string, string> } {
  const parsed = parseQuestionPaperContentWithOptions(questionContent, keyContent);
  const fromPaper = parsed.flatQuestions
    .map((question) => question.id)
    .filter((id) => Boolean(parsed.answerKey[id]));
  const seen = new Set(fromPaper);
  const remaining = Object.keys(parsed.answerKey).filter((id) => !seen.has(id));
  return { ids: [...fromPaper, ...remaining], answerKey: parsed.answerKey };
}

export async function POST(request: Request) {
  const { session, response } = await requireRoles(["TEACHER"]);
  if (response) return response;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
  }

  const paperId = String(form.get("paperId") ?? "").trim();
  const image = form.get("image");
  const requestedSensitivity = Number(form.get("sensitivity") ?? 72);
  const sensitivity = Number.isFinite(requestedSensitivity)
    ? Math.min(100, Math.max(40, Math.round(requestedSensitivity)))
    : 80;

  if (!paperId) {
    return NextResponse.json({ error: "Select a question paper." }, { status: 400 });
  }
  if (!(image instanceof File) || image.size === 0) {
    return NextResponse.json({ error: "Upload an OMR sheet image." }, { status: 400 });
  }
  if (!SUPPORTED_IMAGE_TYPES.has(image.type)) {
    return NextResponse.json(
      {
        error:
          "Upload a JPG, PNG, or WebP image. For multi-sheet PDFs, upload the PDF in the OMR Evaluation panel (pages are converted automatically).",
      },
      { status: 415 }
    );
  }
  if (image.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "The OMR image must be 15 MB or smaller." }, { status: 413 });
  }

  const paper = await prisma.questionPaper.findFirst({
    where: { id: paperId, teacherId: session.sub },
    select: {
      id: true,
      title: true,
      category: true,
      questionContent: true,
      keyContent: true,
    },
  });
  if (!paper) {
    return NextResponse.json({ error: "Question paper not found." }, { status: 404 });
  }
  if (!paper.keyContent.trim()) {
    return NextResponse.json(
      { error: "The selected question paper does not have an answer key." },
      { status: 400 }
    );
  }

  const { ids: questionIds, answerKey } = orderedQuestionIds(
    paper.questionContent,
    paper.keyContent
  );
  if (questionIds.length === 0) {
    return NextResponse.json(
      { error: "No scorable answers were found in the selected paper's answer key." },
      { status: 400 }
    );
  }

  const configError = await getAiConfigError();
  if (configError) {
    return NextResponse.json({ error: configError }, { status: 503 });
  }

  const columns = paper.category === "NEET" ? 4 : 3;
  const bytes = Buffer.from(await image.arrayBuffer());
  const omrTemplate = await getTeacherOmrTemplate(session.sub);
  const rollDigits = Math.min(
    12,
    Math.max(5, omrTemplate.rollDigits ?? OMR_SHEET_ROLL_COLUMNS)
  );

  // Detect against the printed sheet grid (fixed track layout), not just key length,
  // so column-major Q numbering matches the Sri Sai OMR template.
  const track = resolveTrackForPaper(paper.category, paper.questionContent);
  const layoutTrack: OmrTrack =
    track === "NEET" ? "NEET" : track === "JEE_ADVANCE" ? "JEE_ADVANCE" : "JEE_MAINS";
  const sheetQuestionCount = Math.max(
    questionIds.length,
    OMR_LAYOUT[layoutTrack].questions
  );

  let vision;
  try {
    vision = await detectOmrBubbles({
      imageBytes: bytes,
      imageMime: image.type,
      questionCount: sheetQuestionCount,
      columns,
      sensitivity,
      rollDigits,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AI bubble detection failed." },
      { status: 502 }
    );
  }

  const byQuestion = new Map(vision.answers.map((item) => [item.question, item]));

  const submittedAnswers: Record<string, string> = {};
  const breakdown = questionIds.map((questionId, index) => {
    const question = index + 1;
    const detected = byQuestion.get(question);
    const selected = detected?.answer ?? null;
    if (selected) submittedAnswers[questionId] = selected;
    const expected = answerKey[questionId];
    const status = !selected
      ? "unanswered"
      : compareExamAnswers(selected, expected)
        ? "correct"
        : "wrong";
    return {
      question,
      questionId,
      detected: selected,
      expected,
      status,
      confidence: detected?.confidence ?? 0,
      flagged: detected?.flagged ?? true,
    };
  });

  const { obtained, scoreMax } = scoreAnswersForTrack({
    track,
    questionContent: paper.questionContent,
    keyContent: paper.keyContent,
    submittedAnswers,
  });
  const correct = breakdown.filter((item) => item.status === "correct").length;
  const wrong = breakdown.filter((item) => item.status === "wrong").length;
  const unanswered = breakdown.filter((item) => item.status === "unanswered").length;
  const flagged = breakdown.filter((item) => item.flagged).length;

  const matchedStudent = await matchStudentForOmr(session.sub, {
    studentName: vision.studentName,
    rollNumber: vision.rollNumber,
  });

  return NextResponse.json({
    paper: { id: paper.id, title: paper.title },
    track,
    studentName: vision.studentName,
    rollNumber: vision.rollNumber,
    rollDigits: vision.rollDigits ?? [],
    matchedStudent,
    submittedAnswers,
    score: { obtained, maximum: scoreMax, correct, wrong, unanswered, flagged },
    issues: vision.issues,
    breakdown,
  });
}
