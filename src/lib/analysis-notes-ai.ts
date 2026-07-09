import { callOpenAiChatCompletion } from "@/lib/openai-runtime";
import {
  collectIncorrectQuestions,
  formatExplanationSections,
  type WrongQuestionForAi,
} from "@/lib/analysis-notes-utils";

export { collectIncorrectQuestions, type WrongQuestionForAi } from "@/lib/analysis-notes-utils";

async function callAiForQuestions(
  category: string,
  questions: WrongQuestionForAi[]
): Promise<Array<{ key: string; steps: string[]; takeaway: string }>> {
  if (questions.length === 0) return [];

  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["explanations"],
    properties: {
      explanations: {
        type: "array",
        minItems: questions.length,
        maxItems: questions.length,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["key", "steps", "takeaway"],
          properties: {
            key: { type: "string" },
            steps: {
              type: "array",
              minItems: 2,
              maxItems: 8,
              items: { type: "string" },
            },
            takeaway: { type: "string" },
          },
        },
      },
    },
  };

  const response = await callOpenAiChatCompletion({
    temperature: 0.3,
    response_format: {
      type: "json_schema",
      json_schema: { name: "analysis_notes_explanations", strict: true, schema },
    },
    messages: [
      {
        role: "system",
        content:
          "You are an expert JEE/NEET tutor for Physics, Chemistry, Mathematics, and Biology. " +
          "For each question, return:\n" +
          "1) steps — An array of 3–6 clear solution steps (strings). Each step is one logical move: " +
          "write the formula or concept used, substitute values, simplify, and conclude why the correct option/answer follows. " +
          "For theory/biology, break reasoning into ordered steps. For numerical problems, show calculation steps separately. " +
          "Do not merge multiple steps into one string.\n" +
          "2) takeaway — One short line on what to remember next time.\n" +
          "Do not discuss the student's wrong choice or unanswered status. Focus only on teaching the correct solution. " +
          "Use simple language. Return strict JSON only.",
      },
      {
        role: "user",
        content: JSON.stringify({
          examCategory: category,
          questions: questions.map((q) => ({
            key: q.key,
            section: q.section,
            questionNumber: q.questionNumber,
            question: q.prompt,
            options: q.options.length > 0 ? q.options : undefined,
            studentAnswer: q.studentAnswer,
            studentOptionText: q.studentOptionText,
            correctAnswer: q.correctAnswer,
            correctOptionText: q.correctOptionText,
            wasUnanswered: q.wasUnanswered,
          })),
        }),
      },
    ],
  });

  if (!response.ok) {
    const msg = await response.text();
    throw new Error(`AI request failed (${response.status}): ${msg.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("AI returned empty content");
  }

  const parsed = JSON.parse(content) as {
    explanations: Array<{ key: string; steps: string[]; takeaway: string }>;
  };

  return parsed.explanations ?? [];
}

export async function generateSingleQuestionExplanation(
  category: string,
  question: WrongQuestionForAi
): Promise<string> {
  const items = await callAiForQuestions(category, [question]);
  const item = items.find((x) => x.key === question.key) ?? items[0];
  if ((!item?.steps || item.steps.length === 0) && !item?.takeaway?.trim()) {
    throw new Error("AI returned empty explanation");
  }
  return formatExplanationSections(question, item.steps ?? [], item.takeaway ?? "");
}

export async function generateWrongAnswerExplanations(input: {
  category: string;
  questionContent: string;
  keyContent: string;
  submittedAnswers: Record<string, string>;
  questionKey?: string;
}): Promise<Record<string, string>> {
  const wrongQuestions = collectIncorrectQuestions({
    questionContent: input.questionContent,
    keyContent: input.keyContent,
    submittedAnswers: input.submittedAnswers,
  });

  if (wrongQuestions.length === 0) {
    return {};
  }

  if (input.questionKey) {
    const question = wrongQuestions.find((q) => q.key === input.questionKey);
    if (!question) {
      throw new Error("Question not found or already correct");
    }
    const text = await generateSingleQuestionExplanation(input.category, question);
    return { [question.key]: text };
  }

  const explanations: Record<string, string> = {};
  for (const question of wrongQuestions) {
    explanations[question.key] = await generateSingleQuestionExplanation(input.category, question);
  }
  return explanations;
}
