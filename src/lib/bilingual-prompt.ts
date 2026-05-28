export type BilingualPrompt = {
  en: string;
  hi: string | null;
};

/** Split stems formatted as "English | Hindi" or plain single-language text. */
export function splitBilingualPrompt(prompt: string): BilingualPrompt {
  const pipeIdx = prompt.indexOf(" | ");
  if (pipeIdx >= 0) {
    return {
      en: prompt.slice(0, pipeIdx).trim(),
      hi: prompt.slice(pipeIdx + 3).trim() || null,
    };
  }
  const hasDevanagari = /[\u0900-\u097F]/.test(prompt);
  if (hasDevanagari) {
    return { en: "", hi: prompt.trim() };
  }
  return { en: prompt.trim(), hi: null };
}

export function displayPrompt(
  parts: BilingualPrompt,
  mode: "en" | "hi" | "both",
  questionLang: "en" | "hi",
): string {
  if (mode === "en") return parts.en || parts.hi || "";
  if (mode === "hi") return parts.hi || parts.en || "";
  if (questionLang === "hi") return parts.hi || parts.en || "";
  return parts.en || parts.hi || "";
}
