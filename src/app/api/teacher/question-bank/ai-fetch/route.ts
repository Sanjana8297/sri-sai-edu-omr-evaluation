import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";

type InternetQuestion = {
  questionText: string;
  options: string[];
  correctAnswer: "A" | "B" | "C" | "D";
  chapter: string | null;
  difficulty: "easy" | "medium" | "hard";
  sourceName: string;
  sourceUrl: string;
};

function getApiKey(): string | null {
  return process.env.OPENAI_API_KEY?.trim() || null;
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

async function fetchSearchSnippets(query: string): Promise<Array<{ title: string; url: string; snippet: string }>> {
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
  });
  if (!response.ok) return [];
  const html = await response.text();

  const results: Array<{ title: string; url: string; snippet: string }> = [];
  const blocks = html.split('class="result"');
  for (const block of blocks) {
    const linkMatch = block.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;
    const href = linkMatch[1];
    const title = stripTags(linkMatch[2]);
    const snippet = snippetMatch ? stripTags(snippetMatch[1]) : "";
    if (title && href) {
      results.push({ title, url: href, snippet });
    }
    if (results.length >= 8) break;
  }
  return results;
}

export async function POST(request: Request) {
  const { response } = await requireRoles(["TEACHER"]);
  if (response) return response;

  const apiKey = getApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: "AI fetch needs OPENAI_API_KEY in .env." }, { status: 503 });
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

  const query = `${category} ${subject} ${year} entrance exam MCQ ${topic}`.trim();
  const snippets = await fetchSearchSnippets(query);
  if (snippets.length === 0) {
    return NextResponse.json({ error: "No internet sources found for this query. Try a broader topic." }, { status: 404 });
  }

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

  const responseAi = await fetch(`${process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      temperature: 0.4,
      response_format: {
        type: "json_schema",
        json_schema: { name: "teacher_internet_fetch_questions", strict: true, schema },
      },
      messages: [
        {
          role: "system",
          content:
            "Use only provided internet snippets to draft exam-style MCQ questions. Keep one correct option, four options total, and attach best sourceName/sourceUrl from snippets.",
        },
        {
          role: "user",
          content: JSON.stringify({ category, subject, year, topic, count, difficulty, snippets }),
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
  if (!content) return NextResponse.json({ error: "AI returned empty content" }, { status: 400 });

  const parsed = JSON.parse(content) as { questions: InternetQuestion[] };
  return NextResponse.json({ questions: parsed.questions ?? [], snippets });
}
