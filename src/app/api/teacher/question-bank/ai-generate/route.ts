import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";

type GeneratedQuestion = {
  questionText: string;
  options: string[];
  correctAnswer: "A" | "B" | "C" | "D";
  chapter: string | null;
  difficulty: "easy" | "medium" | "hard";
};

function getApiKey(): string | null {
  return process.env.OPENAI_API_KEY?.trim() || null;
}

export async function POST(request: Request) {
  const { session, response } = await requireRoles(["TEACHER"]);
  if (response) return response;
  const _unused = session;

  const apiKey = getApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: "AI generation needs OPENAI_API_KEY in .env." }, { status: 503 });
  }

  let body: {
    category?: "JEE" | "NEET";
    subject?: string;
    chapter?: string;
    difficulty?: "easy" | "medium" | "hard";
    count?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const category = body.category;
  const subject = body.subject?.trim();
  const chapter = body.chapter?.trim() || "";
  const difficulty = body.difficulty;
  const count = Math.min(Math.max(Number(body.count ?? 3), 1), 10);
  if (!category || !subject || !difficulty) {
    return NextResponse.json({ error: "category, subject, and difficulty are required" }, { status: 400 });
  }

  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["questions"],
    properties: {
      questions: {
        type: "array",
        minItems: count,
        maxItems: count,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["questionText", "options", "correctAnswer", "chapter", "difficulty"],
          properties: {
            questionText: { type: "string" },
            options: { type: "array", minItems: 4, maxItems: 4, items: { type: "string" } },
            correctAnswer: { type: "string", enum: ["A", "B", "C", "D"] },
            chapter: { type: ["string", "null"] },
            difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
          },
        },
      },
    },
  };

  const responseAi = await fetch(`${process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      temperature: 0.7,
      response_format: {
        type: "json_schema",
        json_schema: { name: "teacher_question_gen", strict: true, schema },
      },
      messages: [
        {
          role: "system",
          content:
            "Generate quality MCQ questions for Indian exam prep. Return strict JSON only. Provide exactly four options and one correct option.",
        },
        {
          role: "user",
          content: JSON.stringify({
            category,
            subject,
            chapter,
            difficulty,
            count,
            constraints:
              "Avoid duplicates in a batch; keep questions clear and exam-style; set correctAnswer as A/B/C/D based on option order.",
          }),
        },
      ],
    }),
  });

  if (!responseAi.ok) {
    const msg = await responseAi.text();
    return NextResponse.json({ error: `AI request failed (${responseAi.status}): ${msg}` }, { status: 400 });
  }

  const data = (await responseAi.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    return NextResponse.json({ error: "AI returned empty content" }, { status: 400 });
  }

  const parsed = JSON.parse(content) as { questions: GeneratedQuestion[] };
  return NextResponse.json({ questions: parsed.questions ?? [] });
}
