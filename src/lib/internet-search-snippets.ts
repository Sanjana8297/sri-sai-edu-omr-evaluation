export type SearchSnippet = {
  title: string;
  url: string;
  snippet: string;
};

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

const FETCH_TIMEOUT_MS = 20_000;

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeDuckDuckGoRedirect(href: string): string {
  try {
    if (href.includes("uddg=")) {
      const url = new URL(href, "https://duckduckgo.com");
      const uddg = url.searchParams.get("uddg");
      if (uddg) return decodeURIComponent(uddg);
    }
  } catch {
    /* use raw href */
  }
  return href;
}

/** DuckDuckGo Lite — works reliably from serverless/datacenter IPs. */
function parseDuckDuckGoLiteHtml(html: string): SearchSnippet[] {
  const results: SearchSnippet[] = [];
  const linkRe =
    /<a rel="nofollow" href="([^"]+)" class=['"]result-link['"]>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(html)) !== null) {
    const href = decodeDuckDuckGoRedirect(match[1]!);
    const title = stripTags(match[2]!);
    if (!title || !href) continue;

    const after = html.slice(match.index, match.index + 2500);
    const snippetMatch = after.match(/class=['"]result-snippet['"]>\s*([\s\S]*?)\s*<\/td>/i);
    const snippet = snippetMatch ? stripTags(snippetMatch[1]!) : "";

    results.push({ title, url: href, snippet });
    if (results.length >= 8) break;
  }
  return results;
}

/** Legacy html.duckduckgo.com parser (works on some residential IPs). */
function parseDuckDuckGoHtml(html: string): SearchSnippet[] {
  const results: SearchSnippet[] = [];
  const blocks = html.split('class="result"');
  for (const block of blocks) {
    const linkMatch = block.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;
    const href = decodeDuckDuckGoRedirect(linkMatch[1]!);
    const title = stripTags(linkMatch[2]!);
    const snippet = snippetMatch ? stripTags(snippetMatch[1]!) : "";
    if (title && href) {
      results.push({ title, url: href, snippet });
    }
    if (results.length >= 8) break;
  }
  return results;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchDuckDuckGoLite(query: string): Promise<SearchSnippet[]> {
  const response = await fetchWithTimeout("https://lite.duckduckgo.com/lite/", {
    method: "POST",
    headers: {
      ...BROWSER_HEADERS,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ q: query }).toString(),
  });
  if (!response.ok) return [];
  const html = await response.text();
  return parseDuckDuckGoLiteHtml(html);
}

async function fetchDuckDuckGoHtml(query: string): Promise<SearchSnippet[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await fetchWithTimeout(url, { headers: BROWSER_HEADERS });
  if (!response.ok) return [];
  const html = await response.text();
  return parseDuckDuckGoHtml(html);
}

/**
 * Fetch web search snippets for AI question drafting.
 * Tries DuckDuckGo Lite first (serverless-friendly), then legacy HTML.
 */
export async function fetchSearchSnippets(query: string): Promise<SearchSnippet[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const strategies = [fetchDuckDuckGoLite, fetchDuckDuckGoHtml];
  for (const strategy of strategies) {
    try {
      const results = await strategy(trimmed);
      if (results.length > 0) return results;
    } catch {
      /* try next strategy */
    }
  }
  return [];
}
