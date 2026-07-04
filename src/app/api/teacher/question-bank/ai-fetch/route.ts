import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  filterQuestionsNotInBank,
  loadExistingContentHashesForSubject,
} from "@/lib/question-bank-duplicate-filter";
import { fetchSearchSnippets } from "@/lib/internet-search-snippets";
import { callOpenAiChatCompletion, getAiConfigError } from "@/lib/openai-runtime";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

type InternetQuestion = {
  questionText: string;
  options: string[];
  correctAnswer: "A" | "B" | "C" | "D";
  chapter: string | null;
  difficulty: "easy" | "medium" | "hard";
  sourceName: string;
  sourceUrl: string;
};

export async function POST(request: Request) {
  const { session, response } = await requireRoles(["TEACHER"]);
  if (response) return response;

  const me = await prisma.teacher.findUnique({
    where: { id: session.sub },
    select: { category: true },
  });
  if (!me || (me.category !== "JEE" && me.category !== "NEET")) {
    return NextResponse.json({ error: "Invalid teacher profile" }, { status: 400 });
  }

  const aiConfigError = await getAiConfigError();
  if (aiConfigError) {
    return NextResponse.json({ error: aiConfigError }, { status: 503 });
  }

  let body: {
    category?: "JEE" | "NEET";
    subject?: string;
    year?: number;
    topic?: string;
    count?: number;
    difficulty?: "easy" | "medium" | "hard";
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const category = body.category;
  const subject = body.subject?.trim();
  const year = Number(body.year);
  const topic = body.topic?.trim() || "";
  const count = Math.min(Math.max(Number(body.count ?? 5), 1), 15);
  const difficulty = body.difficulty ?? "medium";
  if (!category || !subject || Number.isNaN(year)) {
    return NextResponse.json({ error: "category, subject, and year are required" }, { status: 400 });
  }
  if (category !== me.category) {
    return NextResponse.json({ error: "category does not match your track" }, { status: 400 });
  }

  const allowedSubjects =
    me.category === "JEE"
      ? new Set(["Maths", "Physics", "Chemistry"])
      : new Set(["Physics", "Chemistry", "Botany", "Zoology"]);
  if (!allowedSubjects.has(subject)) {
    return NextResponse.json({ error: "Invalid subject for your track" }, { status: 400 });
  }

  const exam = me.category as "JEE" | "NEET";

  const query = `${category} ${subject} ${year} entrance exam MCQ ${topic}`.trim();
  const snippets = await fetchSearchSnippets(query);
  const searchUnavailable = snippets.length === 0;

  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["questions"],
    properties: {
      questions: {
        type: "array",
        minItems: 1,
        maxItems: count,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "questionText",
            "options",
            "correctAnswer",
            "chapter",
            "difficulty",
            "sourceName",
            "sourceUrl",
          ],
          properties: {
            questionText: { type: "string" },
            options: { type: "array", minItems: 4, maxItems: 4, items: { type: "string" } },
            correctAnswer: { type: "string", enum: ["A", "B", "C", "D"] },
            chapter: { type: ["string", "null"] },
            difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
            sourceName: { type: "string" },
            sourceUrl: { type: "string" },
          },
        },
      },
    },
  };

  const responseAi = await callOpenAiChatCompletion({
    temperature: 0.4,
    response_format: {
      type: "json_schema",
      json_schema: { name: "teacher_internet_fetch_questions", strict: true, schema },
    },
    messages: [
      {
        role: "system",
        content: searchUnavailable
          ? "Web search was unavailable on this server. Generate original exam-style MCQ questions using your knowledge of the given category and subject. Keep one correct option and four options total. Set sourceName to a plausible public study resource name and sourceUrl to a well-known education site homepage (https URL). Do not repeat the same question stem within the batch."
          : "Use only provided internet snippets to draft exam-style MCQ questions. Keep one correct option, four options total, and attach best sourceName/sourceUrl from snippets. Do not repeat the same question stem within the batch.",
      },
      {
        role: "user",
        content: JSON.stringify({
          category,
          subject,
          year,
          topic,
          count,
          difficulty,
          snippets: searchUnavailable ? [] : snippets,
          searchUnavailable,
        }),
      },
    ],
  });

  if (!responseAi.ok) {
    const msg = await responseAi.text();
    return NextResponse.json({ error: `AI request failed (${responseAi.status}): ${msg}` }, { status: 400 });
  }

  const data = (await responseAi.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) return NextResponse.json({ error: "AI returned empty content" }, { status: 400 });

  const parsed = JSON.parse(content) as { questions: InternetQuestion[] };
  const rawQuestions = parsed.questions ?? [];

  const existingHashes = await loadExistingContentHashesForSubject(
    prisma,
    exam,
    subject,
    rawQuestions.map((q) => q.questionText)
  );
  const { kept, skippedDuplicateInBank, skippedDuplicateInBatch } = filterQuestionsNotInBank(
    exam,
    subject,
    rawQuestions,
    existingHashes
  );

  return NextResponse.json({
    questions: kept,
    snippets,
    skippedDuplicateInBank,
    skippedDuplicateInBatch,
    fetchedFromAi: rawQuestions.length,
    searchUnavailable,
  });
}
