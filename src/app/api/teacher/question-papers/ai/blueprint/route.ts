import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { getAiConfigError, generateBlueprint } from "@/lib/ai-paper-config";
import { prisma } from "@/lib/prisma";

type DifficultyLevel = "easy" | "medium" | "hard";

function parseDifficultyPercentages(input: string | undefined): Record<DifficultyLevel, number> | null {
  if (!input) return null;
  const text = input.toLowerCase();
  const levels: DifficultyLevel[] = ["easy", "medium", "hard"];
  const result: Record<DifficultyLevel, number> = { easy: 0, medium: 0, hard: 0 };

  for (const level of levels) {
    const before = new RegExp(`(\\d{1,3})\\s*%\\s*${level}`);
    const after = new RegExp(`${level}\\s*[:=-]?\\s*(\\d{1,3})\\s*%?`);
    const match = text.match(before) ?? text.match(after);
    if (match?.[1]) result[level] = Math.max(0, Math.min(100, Number(match[1])));
  }

  const total = result.easy + result.medium + result.hard;
  if (total <= 0) return null;
  return result;
}

function buildDifficultyMix(
  distributionText: string | undefined,
  aiSections: Array<{ difficulty?: string }> | undefined
): Record<DifficultyLevel, number> {
  const parsed = parseDifficultyPercentages(distributionText);
  if (parsed) {
    const total = parsed.easy + parsed.medium + parsed.hard;
    if (total > 0) {
      return {
        easy: Number(((parsed.easy / total) * 100).toFixed(2)),
        medium: Number(((parsed.medium / total) * 100).toFixed(2)),
        hard: Number((100 - ((parsed.easy / total) * 100 + (parsed.medium / total) * 100)).toFixed(2)),
      };
    }
  }

  const aiLevels = (aiSections ?? [])
    .map((s) => s.difficulty)
    .filter((d): d is DifficultyLevel => d === "easy" || d === "medium" || d === "hard");
  if (aiLevels.length > 0) {
    const counts: Record<DifficultyLevel, number> = { easy: 0, medium: 0, hard: 0 };
    for (const d of aiLevels) counts[d] += 1;
    const total = aiLevels.length;
    return {
      easy: Number(((counts.easy / total) * 100).toFixed(2)),
      medium: Number(((counts.medium / total) * 100).toFixed(2)),
      hard: Number((100 - ((counts.easy / total) * 100 + (counts.medium / total) * 100)).toFixed(2)),
    };
  }

  return { easy: 30, medium: 40, hard: 30 };
}

export async function POST(request: Request) {
  const { session, response } = await requireRoles(["TEACHER"]);
  if (response) return response;

  const aiConfigError = getAiConfigError();
  if (aiConfigError) return NextResponse.json({ error: aiConfigError }, { status: 503 });

  let body: {
    durationMinutes?: number;
    difficultyDistribution?: string;
    extraInstructions?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const durationMinutes = body.durationMinutes;
  if (typeof durationMinutes !== "number") {
    return NextResponse.json({ error: "durationMinutes is required" }, { status: 400 });
  }

  const me = await prisma.teacher.findUnique({
    where: { id: session.sub },
    select: { category: true },
  });
  if (!me) return NextResponse.json({ error: "Invalid teacher profile" }, { status: 400 });

  try {
    const isJee = me.category === "JEE";
    const blueprint = await generateBlueprint({
      category: me.category as "JEE" | "NEET",
      durationMinutes,
      difficultyDistribution: body.difficultyDistribution?.trim(),
      extraInstructions: body.extraInstructions?.trim(),
    });

    if (isJee) {
      const difficultyMix = buildDifficultyMix(
        body.difficultyDistribution?.trim(),
        blueprint.sections
      );
      blueprint.subject = "Mathematics, Physics, Chemistry";
      blueprint.totalQuestions = 75;
      blueprint.totalMarks = 300;
      blueprint.instructions = [
        "This paper has 3 parts: Mathematics, Physics, and Chemistry.",
        "Each subject has 25 questions split into two sections.",
        "Section 1 has 20 MCQs with one correct option.",
        "Section 2 has 5 numerical questions, each with options and only one correct option.",
        "Marking scheme: +4 for correct, 0 for unattempted, -1 for incorrect.",
        `Within each section, keep difficulty mix as Easy ${difficultyMix.easy}%, Medium ${difficultyMix.medium}%, Hard ${difficultyMix.hard}%.`,
        "For decimal numerical answers, use the nearest integer.",
      ];
      blueprint.sections = [
        { name: "Mathematics - Section 1 (MCQ)", questionCount: 20, marksPerQuestion: 4, negativeMarks: 1, topicFocus: ["Mathematics"], difficulty: "medium", difficultyMix },
        { name: "Mathematics - Section 2 (Numerical with options)", questionCount: 5, marksPerQuestion: 4, negativeMarks: 1, topicFocus: ["Mathematics"], difficulty: "medium", difficultyMix },
        { name: "Physics - Section 1 (MCQ)", questionCount: 20, marksPerQuestion: 4, negativeMarks: 1, topicFocus: ["Physics"], difficulty: "medium", difficultyMix },
        { name: "Physics - Section 2 (Numerical with options)", questionCount: 5, marksPerQuestion: 4, negativeMarks: 1, topicFocus: ["Physics"], difficulty: "medium", difficultyMix },
        { name: "Chemistry - Section 1 (MCQ)", questionCount: 20, marksPerQuestion: 4, negativeMarks: 1, topicFocus: ["Chemistry"], difficulty: "medium", difficultyMix },
        { name: "Chemistry - Section 2 (Numerical with options)", questionCount: 5, marksPerQuestion: 4, negativeMarks: 1, topicFocus: ["Chemistry"], difficulty: "medium", difficultyMix },
      ];
    }

    return NextResponse.json({ blueprint });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not generate blueprint";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
