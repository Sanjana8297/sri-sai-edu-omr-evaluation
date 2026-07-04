import {
  callOpenAiChatCompletion,
  callOpenAiResponses,
  getLlmRuntimeConfig,
  openAiBaseUrlSupportsWebSearch,
  resolveOpenAiWebSearchModel,
} from "@/lib/openai-runtime";

type SearchSnippet = {
  title: string;
  url: string;
  snippet: string;
};

const MAX_SNIPPETS = 8;

type ResponsesAnnotation = {
  type?: string;
  url?: string;
  title?: string;
  start_index?: number;
  end_index?: number;
};

type ResponsesOutputItem = {
  type?: string;
  content?: Array<{
    type?: string;
    text?: string;
    annotations?: ResponsesAnnotation[];
  }>;
};

type OpenAiResponsesBody = {
  output?: ResponsesOutputItem[];
  output_text?: string;
};

function extractSnippetsFromResponses(data: OpenAiResponsesBody): SearchSnippet[] {
  const snippets: SearchSnippet[] = [];
  const seenUrls = new Set<string>();
  let fullText = data.output_text?.trim() ?? "";

  for (const item of data.output ?? []) {
    if (item.type !== "message") continue;
    for (const part of item.content ?? []) {
      const text = part.text?.trim() ?? "";
      if (text && !fullText) fullText = text;

      for (const ann of part.annotations ?? []) {
        if (ann.type !== "url_citation" || !ann.url || seenUrls.has(ann.url)) continue;
        seenUrls.add(ann.url);
        const excerpt =
          ann.start_index != null && ann.end_index != null && text
            ? text.slice(ann.start_index, ann.end_index).trim()
            : "";
        snippets.push({
          title: ann.title?.trim() || ann.url,
          url: ann.url,
          snippet: excerpt || text.slice(0, 500),
        });
      }
    }
  }

  if (snippets.length === 0 && fullText) {
    snippets.push({
      title: "OpenAI web search summary",
      url: "https://openai.com/",
      snippet: fullText.slice(0, 2500),
    });
  }

  return snippets.slice(0, MAX_SNIPPETS);
}

/** Responses API + hosted web_search tool (same OpenAI API key as LLM Settings). */
async function fetchViaResponsesApi(query: string, model: string): Promise<SearchSnippet[]> {
  const response = await callOpenAiResponses({
    model,
    tools: [{ type: "web_search", search_context_size: "medium" }],
    input: [
      `Search the web for Indian entrance exam MCQ study material about: ${query}.`,
      "Prioritize JEE/NEET practice sites, PYQ pages, and educational resources.",
    ].join(" "),
  });

  if (!response.ok) return [];
  const data = (await response.json()) as OpenAiResponsesBody;
  return extractSnippetsFromResponses(data);
}

/** Chat Completions search models (e.g. gpt-4o-mini-search-preview) — same API key. */
async function fetchViaChatSearchModel(query: string): Promise<SearchSnippet[]> {
  const chatSearchModel =
    process.env.OPENAI_WEB_SEARCH_MODEL?.trim() || "gpt-4o-mini-search-preview";

  const response = await callOpenAiChatCompletion({
    model: chatSearchModel,
    web_search_options: { search_context_size: "medium" },
    messages: [
      {
        role: "user",
        content: [
          `Search the web for: ${query}.`,
          "Summarize facts from JEE/NEET MCQ practice and study sites that would help write multiple-choice questions.",
          "Include specific concepts, formulas, or problem types where relevant.",
        ].join(" "),
      },
    ],
  });

  if (!response.ok) return [];
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) return [];

  return [
    {
      title: "OpenAI web search summary",
      url: "https://openai.com/",
      snippet: text.slice(0, 2500),
    },
  ];
}

/**
 * Web search via OpenAI (uses the same API key as Admin → LLM Settings).
 * Tries Responses API web_search first, then Chat Completions search models.
 */
export async function fetchOpenAiWebSearchSnippets(query: string): Promise<SearchSnippet[]> {
  const { apiKey, model, baseUrl } = await getLlmRuntimeConfig();
  if (!apiKey) return [];

  if (!openAiBaseUrlSupportsWebSearch(baseUrl)) {
    return [];
  }

  const searchModel = resolveOpenAiWebSearchModel(model);

  try {
    const fromResponses = await fetchViaResponsesApi(query, searchModel);
    if (fromResponses.length > 0) return fromResponses;
  } catch {
    /* fall through */
  }

  try {
    return await fetchViaChatSearchModel(query);
  } catch {
    return [];
  }
}
