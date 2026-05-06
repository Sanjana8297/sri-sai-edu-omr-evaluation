export type ParsedQuestion = {
  id: string;
  section: string;
  indexInSection: number;
  prompt: string;
  options: string[];
};

function normalizeLabel(value: string): string {
  return value.trim().toUpperCase();
}

export function parseQuestionPaperContent(content: string): {
  sections: Array<{ name: string; questions: ParsedQuestion[] }>;
  flatQuestions: ParsedQuestion[];
} {
  const sections: Array<{ name: string; questions: ParsedQuestion[] }> = [];
  let currentSection: { name: string; questions: ParsedQuestion[] } | null = null;
  let currentQuestion: ParsedQuestion | null = null;

  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const sectionMatch = line.match(/^##\s+(.+)$/);
    if (sectionMatch) {
      if (currentQuestion && currentSection) currentSection.questions.push(currentQuestion);
      currentQuestion = null;
      currentSection = { name: sectionMatch[1].trim(), questions: [] };
      sections.push(currentSection);
      continue;
    }

    const questionMatch = line.match(/^Q(\d+)\.\s*(.+)$/);
    if (questionMatch && currentSection) {
      if (currentQuestion) currentSection.questions.push(currentQuestion);
      currentQuestion = {
        id: `${currentSection.name}::${questionMatch[1]}`,
        section: currentSection.name,
        indexInSection: Number(questionMatch[1]),
        prompt: questionMatch[2].trim(),
        options: [],
      };
      continue;
    }

    const optionMatch = line.match(/^\(([A-D])\)\s*(.+)$/i);
    if (optionMatch && currentQuestion) {
      currentQuestion.options.push(`${normalizeLabel(optionMatch[1])}. ${optionMatch[2].trim()}`);
      continue;
    }

    if (currentQuestion && line.trim()) {
      currentQuestion.prompt = `${currentQuestion.prompt}\n${line.trim()}`.trim();
    }
  }

  if (currentQuestion && currentSection) currentSection.questions.push(currentQuestion);
  const flatQuestions = sections.flatMap((s) => s.questions);
  return { sections, flatQuestions };
}

export function parseAnswerKeyByQuestion(content: string): Record<string, string> {
  const map: Record<string, string> = {};
  let currentSection = "";
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    const sectionMatch = line.match(/^##\s+(.+)$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      continue;
    }

    const answerMatch = line.match(/Q(\d+)\s*:\s*(.+)$/i);
    if (answerMatch && currentSection) {
      map[`${currentSection}::${answerMatch[1]}`] = answerMatch[2].trim();
    }
  }
  return map;
}
