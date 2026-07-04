import { fetchOpenAiWebSearchSnippets } from "@/lib/openai-web-search-snippets";

export type SearchSnippet = {
  title: string;
  url: string;
  snippet: string;
};

export type SearchSnippetSource = "openai" | "brave" | "wikipedia" | "duckduckgo";

export type SearchFetchResult = {
  snippets: SearchSnippet[];
  source: SearchSnippetSource | null;
};

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

const JSON_HEADERS: Record<string, string> = {
  Accept: "application/json",
  "User-Agent": "jee-neet-coaching/1.0 (question-bank-ai-fetch)",
};

const FETCH_TIMEOUT_MS = 20_000;
const MAX_SNIPPETS = 8;

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

function wikiPageUrl(title: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
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

/** Optional — set BRAVE_SEARCH_API_KEY on Vercel for full web search (free tier available). */
async function fetchBraveSearch(query: string): Promise<SearchSnippet[]> {
  const key = process.env.BRAVE_SEARCH_API_KEY?.trim();
  if (!key) return [];

  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(MAX_SNIPPETS));

  const response = await fetchWithTimeout(url.toString(), {
    headers: {
      ...JSON_HEADERS,
      "X-Subscription-Token": key,
    },
  });
  if (!response.ok) return [];

  const data = (await response.json()) as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
  };
  const rows = data.web?.results ?? [];
  return rows
    .map((row) => ({
      title: row.title?.trim() ?? "",
      url: row.url?.trim() ?? "",
      snippet: row.description?.trim() ?? "",
    }))
    .filter((row) => row.title && row.url)
    .slice(0, MAX_SNIPPETS);
}

/** Wikipedia — reliable from serverless / datacenter IPs (no API key). */
async function fetchWikipediaSnippets(query: string): Promise<SearchSnippet[]> {
  const searchUrl = new URL("https://en.wikipedia.org/w/api.php");
  searchUrl.searchParams.set("action", "query");
  searchUrl.searchParams.set("list", "search");
  searchUrl.searchParams.set("srsearch", query);
  searchUrl.searchParams.set("format", "json");
  searchUrl.searchParams.set("srlimit", String(Math.min(MAX_SNIPPETS, 5)));
  searchUrl.searchParams.set("origin", "*");

  const searchRes = await fetchWithTimeout(searchUrl.toString(), { headers: JSON_HEADERS });
  if (!searchRes.ok) return [];

  const searchData = (await searchRes.json()) as {
    query?: { search?: Array<{ title: string; snippet: string; pageid: number }> };
  };
  const hits = searchData.query?.search ?? [];
  if (hits.length === 0) return [];

  const titles = hits.map((h) => h.title).join("|");
  const extractUrl = new URL("https://en.wikipedia.org/w/api.php");
  extractUrl.searchParams.set("action", "query");
  extractUrl.searchParams.set("prop", "extracts");
  extractUrl.searchParams.set("explaintext", "1");
  extractUrl.searchParams.set("exintro", "1");
  extractUrl.searchParams.set("exchars", "600");
  extractUrl.searchParams.set("titles", titles);
  extractUrl.searchParams.set("format", "json");
  extractUrl.searchParams.set("origin", "*");

  const extractRes = await fetchWithTimeout(extractUrl.toString(), { headers: JSON_HEADERS });
  const extractData = extractRes.ok
    ? ((await extractRes.json()) as {
        query?: { pages?: Record<string, { extract?: string }> };
      })
    : null;
  const pages = extractData?.query?.pages ?? {};

  return hits.map((hit) => {
    const page = pages[String(hit.pageid)];
    const extract = typeof page?.extract === "string" ? page.extract.trim() : "";
    return {
      title: hit.title,
      url: wikiPageUrl(hit.title),
      snippet: extract || stripTags(hit.snippet),
    };
  });
}

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
    if (results.length >= MAX_SNIPPETS) break;
  }
  return results;
}

function parseDuckDuckGoHtml(html: string): SearchSnippet[] {
  const results: SearchSnippet[] = [];
  const blocks = html.split('class="result"');
  for (const block of blocks) {
    const linkMatch = block.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const snippetMatch =
      block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i) ??
      block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/div>/i);
    if (!linkMatch) continue;
    const href = decodeDuckDuckGoRedirect(linkMatch[1]!);
    const title = stripTags(linkMatch[2]!);
    const snippet = snippetMatch ? stripTags(snippetMatch[1]!) : "";
    if (title && href) {
      results.push({ title, url: href, snippet });
    }
    if (results.length >= MAX_SNIPPETS) break;
  }
  return results;
}

async function fetchDuckDuckGoHtmlPost(query: string): Promise<SearchSnippet[]> {
  const response = await fetchWithTimeout("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: {
      ...BROWSER_HEADERS,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ q: query, b: "" }).toString(),
  });
  if (!response.ok) return [];
  return parseDuckDuckGoHtml(await response.text());
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
  return parseDuckDuckGoLiteHtml(await response.text());
}

async function fetchDuckDuckGoHtmlGet(query: string): Promise<SearchSnippet[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await fetchWithTimeout(url, { headers: BROWSER_HEADERS });
  if (!response.ok) return [];
  return parseDuckDuckGoHtml(await response.text());
}

type SearchStrategy = {
  source: SearchSnippetSource;
  run: (query: string) => Promise<SearchSnippet[]>;
};

const SEARCH_STRATEGIES: SearchStrategy[] = [
  { source: "openai", run: fetchOpenAiWebSearchSnippets },
  { source: "brave", run: fetchBraveSearch },
  { source: "wikipedia", run: fetchWikipediaSnippets },
  { source: "duckduckgo", run: fetchDuckDuckGoHtmlPost },
  { source: "duckduckgo", run: fetchDuckDuckGoLite },
  { source: "duckduckgo", run: fetchDuckDuckGoHtmlGet },
];

/**
 * Fetch reference snippets for AI question drafting.
 * OpenAI web search uses the same API key as LLM Settings (no extra key).
 * Wikipedia / DuckDuckGo are fallbacks when OpenAI search is unavailable.
 * Optional BRAVE_SEARCH_API_KEY enables Brave as an additional provider.
 */
export async function fetchSearchSnippets(query: string): Promise<SearchFetchResult> {
  const trimmed = query.trim();
  if (!trimmed) return { snippets: [], source: null };

  for (const strategy of SEARCH_STRATEGIES) {
    try {
      const snippets = await strategy.run(trimmed);
      if (snippets.length > 0) {
        return { snippets, source: strategy.source };
      }
    } catch {
      /* try next strategy */
    }
  }

  return { snippets: [], source: null };
}
