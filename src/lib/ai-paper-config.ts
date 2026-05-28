import type { Category } from "@/lib/types";
import { callOpenAiChatCompletion, getAiConfigError as getLlmAiConfigError } from "@/lib/openai-runtime";

export type DifficultyLevel = "easy" | "medium" | "hard";

export type ExamSection = {
  name: string;
  questionCount: number;
  marksPerQuestion: number;
  negativeMarks: number;
  topicFocus?: string[];
  difficulty: DifficultyLevel;
  difficultyMix?: {
    easy: number;
    medium: number;
    hard: number;
  };
};

export type ExamProfile = "JEE_MAINS" | "JEE_ADVANCE" | "NEET";

export type PaperBlueprint = {
  category: Category;
  subject: string;
  durationMinutes: number;
  totalQuestions: number;
  totalMarks: number;
  instructions: string[];
  sections: ExamSection[];
  examProfile?: ExamProfile;
  advanceStructure?: {
    examDurationHours: number;
    questionsPerSubject: number;
    subjects: Array<{
      subject: string;
      sectionCounts: { section1: number; section2: number; section3: number };
    }>;
  };
};

export type ComposeInput = {
  title: string;
  category: Category;
  blueprint: PaperBlueprint;
  additionalConstraints?: string;
};

type OpenAiResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

export async function getAiConfigError(): Promise<string | null> {
  return getLlmAiConfigError();
}

async function callJsonModel<T>(schemaName: string, schema: object, system: string, user: string): Promise<T> {
  const response = await callOpenAiChatCompletion({
    temperature: 0.3,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: schemaName,
        strict: true,
        schema,
      },
    },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  if (!response.ok) {
    const msg = await response.text();
    throw new Error(`AI request failed (${response.status}): ${msg}`);
  }

  const data = (await response.json()) as OpenAiResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("AI returned empty content");
  }
  return JSON.parse(content) as T;
}

function hasAbbreviationMarkers(text: string): boolean {
  const lowered = text.toLowerCase();
  if (/\[\s*\d+\s+more/i.test(text)) return true;
  if (/\.\.\./.test(text)) return true;
  if (lowered.includes("more questions")) return true;
  if (lowered.includes("remaining questions")) return true;
  if (lowered.includes("truncated")) return true;
  return false;
}

function countQuestionsInSection(content: string, sectionName: string): number {
  const heading = `## ${sectionName}`;
  const start = content.indexOf(heading);
  if (start < 0) return 0;
  const rest = content.slice(start + heading.length);
  const nextHeadingPos = rest.indexOf("\n## ");
  const sectionBody = nextHeadingPos >= 0 ? rest.slice(0, nextHeadingPos) : rest;
  const matches = sectionBody.match(/(?:^|\n)Q\d+\./g);
  return matches ? matches.length : 0;
}

function validateComposedCounts(
  blueprint: PaperBlueprint,
  questionContent: string,
  keyContent: string
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const section of blueprint.sections) {
    const actual = countQuestionsInSection(questionContent, section.name);
    if (actual !== section.questionCount) {
      errors.push(
        `${section.name}: expected ${section.questionCount} questions, found ${actual}`
      );
    }
  }

  const totalExpected = blueprint.sections.reduce((sum, s) => sum + s.questionCount, 0);
  const totalQuestions = (questionContent.match(/(?:^|\n)Q\d+\./g) ?? []).length;
  if (totalQuestions !== totalExpected) {
    errors.push(`Total questions mismatch: expected ${totalExpected}, found ${totalQuestions}`);
  }

  let totalKey = 0;
  for (const section of blueprint.sections) {
    const heading = `## ${section.name}`;
    const start = keyContent.indexOf(heading);
    if (start < 0) {
      errors.push(`Answer key missing section heading: ${section.name}`);
      continue;
    }
    const rest = keyContent.slice(start + heading.length);
    const nextHeadingPos = rest.indexOf("\n## ");
    const sectionBody = nextHeadingPos >= 0 ? rest.slice(0, nextHeadingPos) : rest;
    const entries = sectionBody.match(/(?:^|\n)[^\n]+Q\d+:\s*/g) ?? [];
    totalKey += entries.length;
    if (entries.length !== section.questionCount) {
      errors.push(
        `Answer key ${section.name}: expected ${section.questionCount} entries, found ${entries.length}`
      );
    }
  }
  if (totalKey !== totalExpected) {
    errors.push(`Answer key entries mismatch: expected ${totalExpected}, found ${totalKey}`);
  }

  return { ok: errors.length === 0, errors };
}

const BLUEPRINT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["category", "subject", "durationMinutes", "totalQuestions", "totalMarks", "instructions", "sections"],
  properties: {
    category: { type: "string", enum: ["JEE", "NEET"] },
    subject: { type: "string" },
    durationMinutes: { type: "integer", minimum: 1, maximum: 480 },
    totalQuestions: { type: "integer", minimum: 1, maximum: 300 },
    totalMarks: { type: "integer", minimum: 1, maximum: 1000 },
    instructions: { type: "array", items: { type: "string" } },
    sections: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "questionCount", "marksPerQuestion", "negativeMarks", "topicFocus", "difficulty", "difficultyMix"],
        properties: {
          name: { type: "string" },
          questionCount: { type: "integer", minimum: 1, maximum: 200 },
          marksPerQuestion: { type: "number", minimum: 0 },
          negativeMarks: { type: "number", minimum: 0 },
          topicFocus: { type: "array", items: { type: "string" } },
          difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
          difficultyMix: {
            type: "object",
            additionalProperties: false,
            required: ["easy", "medium", "hard"],
            properties: {
              easy: { type: "number", minimum: 0, maximum: 100 },
              medium: { type: "number", minimum: 0, maximum: 100 },
              hard: { type: "number", minimum: 0, maximum: 100 },
            },
          },
        },
      },
    },
  },
};

const COMPOSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["questionContent", "keyContent", "warnings"],
  properties: {
    questionContent: { type: "string" },
    keyContent: { type: "string" },
    warnings: { type: "array", items: { type: "string" } },
  },
};

export async function generateBlueprint(input: {
  category: Category;
  durationMinutes: number;
  difficultyDistribution?: string;
  extraInstructions?: string;
}): Promise<PaperBlueprint> {
  const system = `
You are an assessment designer for Indian competitive exams.
Return only strict JSON matching the schema.

For category = JEE, enforce this structure exactly:
- Subject set must be Mathematics, Physics, Chemistry (all three mandatory).
- Total questions = 75.
- 25 questions per subject.
- 2 sections per subject:
  - Section 1: 20 single-correct MCQs
  - Section 2: 5 numerical questions, each with options and only one correct option
- Marking: +4 correct, 0 unattempted, -1 wrong.
- Include instruction that decimal numerical answers should be rounded to nearest integer.
- Difficulty distribution should be applied across generated sections/questions using the provided distribution text.
`;
  const user = JSON.stringify({
    ...input,
    jeeRequiredPattern:
      "PCM only; 75 total; each subject 25 with Section 1 = 20 MCQ(single correct), Section 2 = 5 numerical questions with options and one correct option; +4/0/-1 marking.",
  });
  return callJsonModel<PaperBlueprint>("paper_blueprint", BLUEPRINT_SCHEMA, system, user);
}

function composeSystemPrompt(blueprint: PaperBlueprint): string {
  const base =
    "You write high-quality exam papers from a blueprint. Match counts and marks exactly. For each section, distribute question difficulties according to section.difficultyMix (apply the same mix within that section). IMPORTANT: Do not abbreviate, summarize, truncate, or use placeholders like '... [N more questions]'. Output the FULL paper and FULL answer key with all questions explicitly listed. Format rules: questionContent must contain each section with exact heading '## <section name>' in blueprint order. Under each section, list questions as 'Q1.', 'Q2.' ... local to that section. keyContent must be section-wise with exact heading '## <section name>' for every section and answers in that section as '<section name> Q1: <answer>' ... '<section name> QN: <answer>'. Return only strict JSON.";

  if (blueprint.examProfile === "JEE_ADVANCE") {
    return `${base}
For JEE Advance:
- Section I (Single Correct): exactly 4 options (1)-(4), only one correct.
- Section II (One or More Correct): 4+ options; one or more may be correct; mark partial scoring in solutions if needed.
- Section III (Numerical Value): no options; answer is a numeric value (decimals allowed; nearest integer where stated).
- Do not merge sections. Follow blueprint section names exactly.`;
  }

  return `${base} Every question, including numerical section questions, must have options with only one correct option.`;
}

export async function composeQuestionPaper(input: ComposeInput): Promise<{
  questionContent: string;
  keyContent: string;
  warnings: string[];
}> {
  const system = composeSystemPrompt(input.blueprint);
  const user = JSON.stringify(input);
  const first = await callJsonModel<{
    questionContent: string;
    keyContent: string;
    warnings: string[];
  }>("paper_compose", COMPOSE_SCHEMA, system, user);

  const firstCounts = validateComposedCounts(input.blueprint, first.questionContent, first.keyContent);
  if (
    !hasAbbreviationMarkers(first.questionContent) &&
    !hasAbbreviationMarkers(first.keyContent) &&
    firstCounts.ok
  ) {
    return first;
  }

  const retrySystem =
    `${system} This is a retry because your previous output was abbreviated or had count mismatch. You MUST output every question and every answer entry with no omissions, and exact section counts.`;
  const second = await callJsonModel<{
    questionContent: string;
    keyContent: string;
    warnings: string[];
  }>("paper_compose", COMPOSE_SCHEMA, retrySystem, user);

  const secondCounts = validateComposedCounts(input.blueprint, second.questionContent, second.keyContent);
  if (
    hasAbbreviationMarkers(second.questionContent) ||
    hasAbbreviationMarkers(second.keyContent) ||
    !secondCounts.ok
  ) {
    throw new Error(
      `Compose output invalid. ${secondCounts.errors.join("; ") || "Abbreviated output detected."}`
    );
  }
  return second;
}

export async function validateQuestionPaper(input: {
  blueprint: PaperBlueprint;
  questionContent: string;
  keyContent?: string;
}): Promise<{ issues: string[]; passes: string[] }> {
  const issues: string[] = [];
  const passes: string[] = [];

  function getSectionBody(content: string, sectionName: string): string | null {
    const heading = `## ${sectionName}`;
    const start = content.indexOf(heading);
    if (start < 0) return null;
    const rest = content.slice(start + heading.length);
    const nextHeadingPos = rest.indexOf("\n## ");
    return nextHeadingPos >= 0 ? rest.slice(0, nextHeadingPos) : rest;
  }

  function getDifficultyCountsFromSection(sectionBody: string): {
    counts: Record<DifficultyLevel, number>;
    totalQuestions: number;
    inferredQuestions: number;
  } {
    const questionRegex = /(?:^|\n)(Q\d+\.[\s\S]*?)(?=(?:\nQ\d+\.|\n## |\s*$))/g;
    const matches = [...sectionBody.matchAll(questionRegex)];
    const counts: Record<DifficultyLevel, number> = { easy: 0, medium: 0, hard: 0 };
    let inferredQuestions = 0;

    for (const m of matches) {
      const block = m[1]?.toLowerCase() ?? "";
      const isEasy = /\b(?:difficulty\s*[:=-]?\s*easy|easy\s*level|\[easy\]|\(easy\))\b/i.test(block);
      const isMedium = /\b(?:difficulty\s*[:=-]?\s*medium|medium\s*level|\[medium\]|\(medium\))\b/i.test(block);
      const isHard = /\b(?:difficulty\s*[:=-]?\s*hard|hard\s*level|\[hard\]|\(hard\))\b/i.test(block);
      const hitCount = Number(isEasy) + Number(isMedium) + Number(isHard);
      if (hitCount === 1) {
        inferredQuestions += 1;
        if (isEasy) counts.easy += 1;
        else if (isMedium) counts.medium += 1;
        else counts.hard += 1;
      }
    }

    return { counts, totalQuestions: matches.length, inferredQuestions };
  }

  function expectedDifficultyCounts(questionCount: number, mix: { easy: number; medium: number; hard: number }) {
    const raw = {
      easy: (questionCount * mix.easy) / 100,
      medium: (questionCount * mix.medium) / 100,
      hard: (questionCount * mix.hard) / 100,
    };
    const base: Record<DifficultyLevel, number> = {
      easy: Math.floor(raw.easy),
      medium: Math.floor(raw.medium),
      hard: Math.floor(raw.hard),
    };
    let assigned = base.easy + base.medium + base.hard;
    let remaining = questionCount - assigned;
    if (remaining > 0) {
      const order: Array<{ level: DifficultyLevel; remainder: number; weight: number }> = [
        { level: "easy" as DifficultyLevel, remainder: raw.easy - base.easy, weight: mix.easy },
        { level: "medium" as DifficultyLevel, remainder: raw.medium - base.medium, weight: mix.medium },
        { level: "hard" as DifficultyLevel, remainder: raw.hard - base.hard, weight: mix.hard },
      ].sort((a, b) => {
        if (b.remainder !== a.remainder) return b.remainder - a.remainder;
        return b.weight - a.weight;
      });
      let i = 0;
      while (remaining > 0) {
        const level = order[i % order.length].level;
        base[level] += 1;
        remaining -= 1;
        i += 1;
      }
      assigned = base.easy + base.medium + base.hard;
    }
    if (assigned !== questionCount) {
      base.hard += questionCount - assigned;
    }
    return base;
  }

  const bySubjectExpected = new Map<string, number>();
  const bySubjectActual = new Map<string, number>();
  for (const section of input.blueprint.sections) {
    const sectionBody = getSectionBody(input.questionContent, section.name);
    if (!sectionBody) {
      issues.push(`${section.name}: Section heading not found in paper.`);
      continue;
    }

    const actualCount = (sectionBody.match(/(?:^|\n)Q\d+\./g) ?? []).length;
    if (actualCount !== section.questionCount) {
      issues.push(
        `${section.name}: expected ${section.questionCount} questions, found ${actualCount}.`
      );
    } else {
      passes.push(`${section.name}: question count matches expected ${section.questionCount}.`);
    }

    const subject = section.name.split(" - ")[0]?.trim();
    if (subject) {
      bySubjectExpected.set(subject, (bySubjectExpected.get(subject) ?? 0) + section.questionCount);
      bySubjectActual.set(subject, (bySubjectActual.get(subject) ?? 0) + actualCount);
    }

    if (section.difficultyMix) {
      const { counts, totalQuestions, inferredQuestions } = getDifficultyCountsFromSection(sectionBody);
      const expected = expectedDifficultyCounts(section.questionCount, section.difficultyMix);
      if (totalQuestions !== section.questionCount) {
        continue;
      }
      if (inferredQuestions !== totalQuestions) {
        passes.push(
          `${section.name}: difficulty mix check skipped because explicit per-question difficulty labels were not found for all questions.`
        );
        continue;
      }
      if (
        counts.easy !== expected.easy ||
        counts.medium !== expected.medium ||
        counts.hard !== expected.hard
      ) {
        issues.push(
          `Difficulty mix mismatch in ${section.name}: expected Easy ${expected.easy}, Medium ${expected.medium}, Hard ${expected.hard}; found Easy ${counts.easy}, Medium ${counts.medium}, Hard ${counts.hard}.`
        );
      } else {
        passes.push(
          `${section.name}: difficulty mix matches expected Easy ${expected.easy}, Medium ${expected.medium}, Hard ${expected.hard}.`
        );
      }
    }
  }

  for (const [subject, expected] of bySubjectExpected.entries()) {
    const actual = bySubjectActual.get(subject) ?? 0;
    if (actual !== expected) {
      issues.push(
        `Total questions per subject mismatch in ${subject}: expected ${expected}, found ${actual}.`
      );
    } else {
      passes.push(`${subject}: total questions match expected ${expected}.`);
    }
  }

  const totalExpected = input.blueprint.sections.reduce((sum, s) => sum + s.questionCount, 0);
  const totalActual = (input.questionContent.match(/(?:^|\n)Q\d+\./g) ?? []).length;
  if (totalActual !== totalExpected) {
    issues.push(`Total questions mismatch: expected ${totalExpected}, found ${totalActual}.`);
  } else {
    passes.push(`Total questions match expected ${totalExpected}.`);
  }

  if (input.keyContent) {
    const keyValidation = validateComposedCounts(input.blueprint, input.questionContent, input.keyContent);
    if (!keyValidation.ok) {
      issues.push(...keyValidation.errors);
    } else {
      passes.push("Answer key sections and entry counts match the blueprint.");
    }
  }

  return { issues, passes };
}
