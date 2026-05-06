import type { Category } from "@/lib/types";

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

export type PaperBlueprint = {
  category: Category;
  subject: string;
  durationMinutes: number;
  totalQuestions: number;
  totalMarks: number;
  instructions: string[];
  sections: ExamSection[];
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

const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";

function getApiKey(): string | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  return key ? key : null;
}

export function getAiConfigError(): string | null {
  if (!getApiKey()) {
    return "AI generation needs OPENAI_API_KEY in .env.";
  }
  return null;
}

async function callJsonModel<T>(schemaName: string, schema: object, system: string, user: string): Promise<T> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
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
    }),
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

const VALIDATE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["issues", "passes"],
  properties: {
    issues: { type: "array", items: { type: "string" } },
    passes: { type: "array", items: { type: "string" } },
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

export async function composeQuestionPaper(input: ComposeInput): Promise<{
  questionContent: string;
  keyContent: string;
  warnings: string[];
}> {
  const system =
    "You write high-quality exam papers from a blueprint. Match counts and marks exactly. For each section, distribute question difficulties according to section.difficultyMix (apply the same mix within that section). Every question, including numerical section questions, must have options with only one correct option. IMPORTANT: Do not abbreviate, summarize, truncate, or use placeholders like '... [N more questions]'. Output the FULL paper and FULL answer key with all questions explicitly listed. Format rules: questionContent must contain each section with exact heading '## <section name>' in blueprint order. Under each section, list questions as 'Q1.', 'Q2.' ... local to that section. keyContent must be section-wise with exact heading '## <section name>' for every section and answers in that section as '<section name> Q1: <answer>' ... '<section name> QN: <answer>'. Return only strict JSON.";
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
  const system =
    "You validate an exam paper against the blueprint. Report concrete mismatches including whether each section follows its difficultyMix distribution. Return concise pass checks and strict JSON.";
  const user = JSON.stringify(input);
  return callJsonModel("paper_validate", VALIDATE_SCHEMA, system, user);
}
