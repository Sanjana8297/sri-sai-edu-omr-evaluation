import type { Category } from "@/lib/types";

export type DifficultyLevel = "easy" | "medium" | "hard";

export type ExamSection = {
  name: string;
  questionCount: number;
  marksPerQuestion: number;
  negativeMarks: number;
  topicFocus?: string[];
  difficulty: DifficultyLevel;
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
        required: ["name", "questionCount", "marksPerQuestion", "negativeMarks", "topicFocus", "difficulty"],
        properties: {
          name: { type: "string" },
          questionCount: { type: "integer", minimum: 1, maximum: 200 },
          marksPerQuestion: { type: "number", minimum: 0 },
          negativeMarks: { type: "number", minimum: 0 },
          topicFocus: { type: "array", items: { type: "string" } },
          difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
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
  subject: string;
  durationMinutes: number;
  totalQuestions: number;
  difficultyDistribution?: string;
  extraInstructions?: string;
}): Promise<PaperBlueprint> {
  const system = "You are an assessment designer for Indian competitive exams. Return only strict JSON.";
  const user = JSON.stringify(input);
  return callJsonModel<PaperBlueprint>("paper_blueprint", BLUEPRINT_SCHEMA, system, user);
}

export async function composeQuestionPaper(input: ComposeInput): Promise<{
  questionContent: string;
  keyContent: string;
  warnings: string[];
}> {
  const system =
    "You write high-quality exam papers from a blueprint. Match counts, marks, and difficulty. Return only strict JSON.";
  const user = JSON.stringify(input);
  return callJsonModel("paper_compose", COMPOSE_SCHEMA, system, user);
}

export async function validateQuestionPaper(input: {
  blueprint: PaperBlueprint;
  questionContent: string;
  keyContent?: string;
}): Promise<{ issues: string[]; passes: string[] }> {
  const system =
    "You validate an exam paper against the blueprint. Report only concrete mismatches and concise pass checks. Return strict JSON.";
  const user = JSON.stringify(input);
  return callJsonModel("paper_validate", VALIDATE_SCHEMA, system, user);
}
