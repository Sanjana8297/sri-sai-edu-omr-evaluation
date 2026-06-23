import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { getAiConfigError, generateBlueprint, type PaperBlueprint } from "@/lib/ai-paper-config";
import { neetBlueprintInstructionLines } from "@/lib/neet-exam-structure";
import { jeeMainsBlueprintInstructionLines } from "@/lib/jee-mains-exam-structure";
import {
  buildDefaultAdvanceSubjects,
  validateSubjectSectionCounts,
} from "@/lib/jee-advance-exam-structure";
import { buildJeeAdvanceBlueprintPayload } from "@/lib/jee-advance-paper-builder";
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

export const maxDuration = 60;

export async function POST(request: Request) {
  const { session, response } = await requireRoles(["TEACHER"]);
  if (response) return response;

  const aiConfigError = await getAiConfigError();
  if (aiConfigError) return NextResponse.json({ error: aiConfigError }, { status: 503 });

  let body: {
    durationMinutes?: number;
    difficultyDistribution?: string;
    extraInstructions?: string;
    examProfile?: "JEE" | "JEE ADV" | "NEET";
    advanceSubjects?: Array<{
      subject: string;
      sectionCounts: { section1: number; section2: number; section3: number };
    }>;
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
  if (!me) {
    return NextResponse.json({ error: "Invalid teacher profile" }, { status: 400 });
  }

  try {
    const requestedProfile = body.examProfile;
    const targetCategory =
      requestedProfile === "NEET" ? "NEET" : "JEE";
    const isJee = targetCategory === "JEE";
    const isJeeAdvance = requestedProfile === "JEE ADV";
    const isNeet = targetCategory === "NEET";

    if (isNeet && me.category !== "NEET") {
      return NextResponse.json({ error: "NEET papers are only available on the NEET track" }, { status: 403 });
    }
    if (isJee && me.category !== "JEE") {
      return NextResponse.json({ error: "JEE papers are only available on the JEE track" }, { status: 403 });
    }

    if (isJeeAdvance) {
      const subjects =
        Array.isArray(body.advanceSubjects) && body.advanceSubjects.length > 0
          ? body.advanceSubjects
          : buildDefaultAdvanceSubjects();
      for (const s of subjects) {
        const err = validateSubjectSectionCounts(s.sectionCounts);
        if (err) {
          return NextResponse.json({ error: `${s.subject}: ${err}` }, { status: 400 });
        }
      }
      const difficultyMix = buildDifficultyMix(body.difficultyDistribution?.trim(), undefined);
      const blueprint = buildJeeAdvanceBlueprintPayload(subjects, difficultyMix) as PaperBlueprint;
      if (body.extraInstructions?.trim()) {
        blueprint.instructions.push(body.extraInstructions.trim());
      }
      return NextResponse.json({ blueprint });
    }

    const blueprint = await generateBlueprint({
      category: targetCategory,
      durationMinutes,
      difficultyDistribution: body.difficultyDistribution?.trim(),
      extraInstructions: body.extraInstructions?.trim(),
    });
    blueprint.category = targetCategory;
    blueprint.examProfile = isJee ? "JEE_MAINS" : "NEET";

    if (isJee) {
      const difficultyMix = buildDifficultyMix(
        body.difficultyDistribution?.trim(),
        blueprint.sections
      );
      blueprint.subject = "Mathematics, Physics, Chemistry";
      blueprint.totalQuestions = 75;
      blueprint.totalMarks = 300;
      blueprint.instructions = [
        ...jeeMainsBlueprintInstructionLines(),
        `Within each section, keep difficulty mix as Easy ${difficultyMix.easy}%, Medium ${difficultyMix.medium}%, Hard ${difficultyMix.hard}%.`,
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

    if (isNeet) {
      blueprint.examProfile = "NEET";
      const difficultyMix = buildDifficultyMix(
        body.difficultyDistribution?.trim(),
        blueprint.sections
      );
      blueprint.subject = "Botany, Zoology, Physics, Chemistry";
      blueprint.durationMinutes = 180;
      blueprint.totalQuestions = 180;
      blueprint.totalMarks = 720;
      blueprint.instructions = [
        ...neetBlueprintInstructionLines(),
        `Within each section, keep difficulty mix as Easy ${difficultyMix.easy}%, Medium ${difficultyMix.medium}%, Hard ${difficultyMix.hard}%.`,
      ];
      blueprint.sections = [
        { name: "Part 1 - Botany", questionCount: 45, marksPerQuestion: 4, negativeMarks: 1, topicFocus: ["Botany"], difficulty: "medium", difficultyMix },
        { name: "Part 2 - Zoology", questionCount: 45, marksPerQuestion: 4, negativeMarks: 1, topicFocus: ["Zoology"], difficulty: "medium", difficultyMix },
        { name: "Part 3 - Physics", questionCount: 45, marksPerQuestion: 4, negativeMarks: 1, topicFocus: ["Physics"], difficulty: "medium", difficultyMix },
        { name: "Part 4 - Chemistry", questionCount: 45, marksPerQuestion: 4, negativeMarks: 1, topicFocus: ["Chemistry"], difficulty: "medium", difficultyMix },
      ];
    }

    return NextResponse.json({ blueprint });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not generate blueprint";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
