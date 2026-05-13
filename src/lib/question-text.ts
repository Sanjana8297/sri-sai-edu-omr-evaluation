/** Decode common HTML entities (no DOM; safe on server and client). */
export function decodeHtmlEntities(input: string): string {
  let s = input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'");
  s = s.replace(/&#(\d+);/g, (_, n) => {
    const code = Number(n);
    return Number.isFinite(code) ? String.fromCodePoint(code) : _;
  });
  s = s.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
    const code = parseInt(h, 16);
    return Number.isFinite(code) ? String.fromCodePoint(code) : _;
  });
  return s;
}

/**
 * Convert HTML-heavy question strings (e.g. JEE Mains CSV) to readable plain text.
 * Handles &lt;sup&gt;, &lt;sub&gt;, &lt;p&gt;, lists, and strips remaining tags.
 */
export function stripHtmlToPlainText(html: string): string {
  if (!html) return "";
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");

  s = s.replace(/<sup[^>]*>([\s\S]*?)<\/sup>/gi, (_m, inner: string) => {
    const t = decodeHtmlEntities(inner.replace(/<[^>]+>/g, ""));
    return t ? `^(${t})` : "";
  });
  s = s.replace(/<sub[^>]*>([\s\S]*?)<\/sub>/gi, (_m, inner: string) => {
    const t = decodeHtmlEntities(inner.replace(/<[^>]+>/g, ""));
    return t ? `_${t}_` : "";
  });

  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/(p|div|h[1-6]|tr)\s*>/gi, "\n");
  s = s.replace(/<(p|div|h[1-6])[^>]*>/gi, "\n");
  s = s.replace(/<li[^>]*>/gi, "\n• ");
  s = s.replace(/<\/li>/gi, "");
  s = s.replace(/<\/(ul|ol)>/gi, "\n");
  s = s.replace(/<[^>]+>/g, "");

  s = decodeHtmlEntities(s);
  return s
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

const LATEX_SYMBOL_MAP: Array<[RegExp, string]> = [
  [/\\times\b/g, "x"],
  [/\\cdot\b/g, "·"],
  [/\\pm\b/g, "±"],
  [/\\mp\b/g, "∓"],
  [/\\neq\b/g, "!="],
  [/\\leq\b/g, "<="],
  [/\\geq\b/g, ">="],
  [/\\approx\b/g, "≈"],
  [/\\alpha\b/g, "alpha"],
  [/\\beta\b/g, "beta"],
  [/\\gamma\b/g, "gamma"],
  [/\\theta\b/g, "theta"],
  [/\\lambda\b/g, "lambda"],
  [/\\mu\b/g, "mu"],
  [/\\pi\b/g, "pi"],
  [/\\sigma\b/g, "sigma"],
  [/\\omega\b/g, "omega"],
];

function unwrapLatexDelimiters(text: string): string {
  return text
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\[/g, "[")
    .replace(/\\\]/g, "]")
    .replace(/\$/g, "");
}

function simplifyLatexCommands(text: string): string {
  let value = text;

  value = value.replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "($1)/($2)");
  value = value.replace(/\\sqrt\s*\{([^{}]+)\}/g, "sqrt($1)");
  value = value.replace(/\\text\s*\{([^{}]*)\}/g, "$1");
  value = value.replace(/\\left\b/g, "").replace(/\\right\b/g, "");

  for (const [pattern, replacement] of LATEX_SYMBOL_MAP) {
    value = value.replace(pattern, replacement);
  }

  value = value
    .replace(/\^\s*\{([^{}]+)\}/g, "^$1")
    .replace(/_\s*\{([^{}]+)\}/g, "_$1")
    .replace(/\\([A-Za-z]+)/g, "$1")
    .replace(/[{}]/g, "");

  return value;
}

function stripGeneratedPrefixes(text: string): string {
  return text
    .replace(/^(?:Maths|Physics|Chemistry)\s+Advanced\s+Top-up\s+Q\d+\s*:\s*/i, "")
    .replace(/^(?:Maths|Physics|Chemistry)\s+Mains\s+Top-up\s+Q\d+\s*:\s*/i, "")
    .replace(/^(?:Maths|Physics|Chemistry)\s*\([^)]+\)\s*Q\d+\s*:\s*/i, "");
}

export function formatQuestionTextForDisplay(input: string | null | undefined): string {
  if (!input) return "";

  const normalized = stripHtmlToPlainText(
    input
      .replace(/\r\n/g, "\n")
      .replace(/\u00a0/g, " ")
      .trim()
  );

  const cleaned = stripGeneratedPrefixes(simplifyLatexCommands(unwrapLatexDelimiters(normalized)));
  return cleaned
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
