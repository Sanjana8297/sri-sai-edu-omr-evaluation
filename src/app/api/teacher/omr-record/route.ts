import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { resolveTrackForPaper, scoreAnswersForTrack } from "@/lib/omr-scoring";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";

/** Title suffix marking an exam/attempt as produced by OMR scanning. */
const OMR_SUFFIX = "(OMR)";

export async function POST(request: Request) {
  const { session, response } = await requireRoles(["TEACHER"]);
  if (response) return response;

  let body: {
    paperId?: string;
    studentId?: string;
    submittedAnswers?: Record<string, string>;
    rollNumber?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const paperId = body.paperId?.trim();
  const studentId = body.studentId?.trim();
  const submittedAnswers = body.submittedAnswers ?? {};

  if (!paperId || !studentId) {
    return NextResponse.json({ error: "paperId and studentId are required." }, { status: 400 });
  }
  if (typeof submittedAnswers !== "object" || Array.isArray(submittedAnswers)) {
    return NextResponse.json({ error: "submittedAnswers must be an object." }, { status: 400 });
  }

  const paper = await prisma.questionPaper.findFirst({
    where: { id: paperId, teacherId: session.sub },
    select: { id: true, title: true, category: true, questionContent: true, keyContent: true },
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

  const student = await prisma.student.findFirst({
    where: { id: studentId, teacherId: session.sub },
    select: { id: true, name: true, category: true, rollNumber: true },
  });
  if (!student) {
    return NextResponse.json({ error: "Student not found under your account." }, { status: 404 });
  }
  if (student.category !== paper.category) {
    return NextResponse.json(
      {
        error: `This is a ${paper.category} paper but ${student.name} is a ${student.category} student. Pick a matching student.`,
      },
      { status: 400 }
    );
  }

  const track = resolveTrackForPaper(paper.category, paper.questionContent);
  const { obtained, scoreMax, correct, wrong, unanswered } = scoreAnswersForTrack({
    track,
    questionContent: paper.questionContent,
    keyContent: paper.keyContent,
    submittedAnswers,
  });

  if (scoreMax <= 0) {
    return NextResponse.json(
      { error: "No scorable questions were found for this paper." },
      { status: 400 }
    );
  }

  const now = new Date();
  const examTitle = `${paper.title} ${OMR_SUFFIX}`;
  const analysis =
    `OMR scan scored on ${now.toLocaleString()} — ${correct} correct, ${wrong} wrong, ` +
    `${unanswered} unanswered (${obtained}/${scoreMax}).` +
    (body.rollNumber?.trim() ? ` Detected roll: ${body.rollNumber.trim()}.` : "");

  const result = await prisma.$transaction(async (tx) => {
    // Reuse a dedicated OMR exam per question paper so re-scans update the same session.
    let exam = await tx.exam.findFirst({
      where: { teacherId: session.sub, questionPaperId: paper.id, title: examTitle },
      select: { id: true },
    });
    if (!exam) {
      exam = await tx.exam.create({
        data: {
          teacherId: session.sub,
          questionPaperId: paper.id,
          category: paper.category,
          title: examTitle,
          startTime: now,
          endTime: now,
          durationMinutes: 0,
          isPublished: false,
        },
        select: { id: true },
      });
    }

    const examSession = await tx.examSession.upsert({
      where: { examId_studentId: { examId: exam.id, studentId: student.id } },
      create: {
        examId: exam.id,
        studentId: student.id,
        startedAt: now,
        submittedAt: now,
        status: "SUBMITTED",
        submittedAnswers: submittedAnswers as Prisma.InputJsonValue,
        scoreObtained: obtained,
        scoreMax,
      },
      update: {
        submittedAt: now,
        status: "SUBMITTED",
        submittedAnswers: submittedAnswers as Prisma.InputJsonValue,
        scoreObtained: obtained,
        scoreMax,
      },
      select: { id: true },
    });

    // Replace any prior OMR attempt for this student+paper so re-scans don't duplicate.
    await tx.examAttempt.deleteMany({
      where: { studentId: student.id, title: examTitle },
    });
    await tx.examAttempt.create({
      data: {
        studentId: student.id,
        category: paper.category,
        title: examTitle,
        examDate: now,
        marksObtained: obtained,
        maxMarks: scoreMax,
        analysis,
      },
    });

    return { sessionId: examSession.id };
  });

  return NextResponse.json({
    ok: true,
    sessionId: result.sessionId,
    student: { id: student.id, name: student.name },
    score: { obtained, maximum: scoreMax, correct, wrong, unanswered },
  });
}
