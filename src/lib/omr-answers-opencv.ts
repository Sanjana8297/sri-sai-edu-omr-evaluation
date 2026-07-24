import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type OpencvDetectedAnswer = {
  question: number;
  answer: "A" | "B" | "C" | "D" | null;
  confidence: number;
  flagged: boolean;
  /** Multi-mark or outside-circle — keep unanswered; do not let AI invent a letter. */
  lockUnanswered?: boolean;
  status?: "marked" | "blank" | "ambiguous" | "outside";
};

export type OpencvAnswersResult = {
  answers: OpencvDetectedAnswer[];
  issues: string[];
  source: "opencv";
  /** Cropped responses region for focused AI fill-in. */
  cropDataUrl?: string;
};

type PythonAnswerJson = {
  ok?: boolean;
  answers?: Array<{
    question?: number;
    answer?: string | null;
    status?: string;
    confidence?: number;
    flagged?: boolean;
    lockUnanswered?: boolean;
  }>;
  issues?: string[];
  error?: string;
};

function mimeExtension(mime: string): string {
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  return ".jpg";
}

function resolvePythonBin(): string {
  return process.env.OMR_PYTHON?.trim() || process.env.PYTHON?.trim() || "python";
}

function resolveScriptPath(): string {
  return join(process.cwd(), "scripts", "omr_answers_reader.py");
}

function runPython(
  args: string[],
  timeoutMs = 60_000
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const bin = resolvePythonBin();
  return new Promise((resolve) => {
    const child = spawn(bin, ["-u", ...args], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve({ code: null, stdout, stderr: stderr || "OpenCV answers reader timed out." });
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

function parsePythonJson(stdout: string): PythonAnswerJson | null {
  const text = stdout.trim().replace(/^\uFEFF/, "");
  if (!text) return null;
  const start = text.lastIndexOf('{"ok"');
  const from = start >= 0 ? start : text.lastIndexOf("{");
  const end = text.lastIndexOf("}");
  if (from < 0 || end <= from) return null;
  try {
    return JSON.parse(text.slice(from, end + 1)) as PythonAnswerJson;
  } catch {
    try {
      return JSON.parse(text) as PythonAnswerJson;
    } catch {
      return null;
    }
  }
}

function mapAnswers(
  raw: PythonAnswerJson["answers"],
  questionCount: number
): OpencvDetectedAnswer[] {
  const byQ = new Map<number, OpencvDetectedAnswer>();
  for (const item of raw ?? []) {
    const question = Number(item.question);
    if (!Number.isInteger(question) || question < 1 || question > questionCount) continue;
    const letter = item.answer == null ? null : String(item.answer).trim().toUpperCase();
    const answer =
      letter === "A" || letter === "B" || letter === "C" || letter === "D" ? letter : null;
    const confidence =
      typeof item.confidence === "number" && Number.isFinite(item.confidence)
        ? Math.min(1, Math.max(0, item.confidence))
        : 0;
    const statusRaw = typeof item.status === "string" ? item.status.toLowerCase() : "";
    const status =
      statusRaw === "marked" ||
      statusRaw === "blank" ||
      statusRaw === "ambiguous" ||
      statusRaw === "outside"
        ? statusRaw
        : undefined;
    const lockUnanswered =
      Boolean(item.lockUnanswered) || status === "ambiguous" || status === "outside";
    const flagged =
      Boolean(item.flagged) ||
      status === "blank" ||
      status === "ambiguous" ||
      status === "outside" ||
      answer == null ||
      confidence < 0.5 ||
      lockUnanswered;
    byQ.set(question, {
      question,
      answer: lockUnanswered ? null : answer,
      confidence: lockUnanswered ? 0 : confidence,
      flagged,
      lockUnanswered,
      status,
    });
  }

  return Array.from({ length: questionCount }, (_, i) => {
    const question = i + 1;
    return (
      byQ.get(question) ?? {
        question,
        answer: null,
        confidence: 0,
        flagged: true,
      }
    );
  });
}

/**
 * Deterministic A–D bubble decode from the uploaded OMR image via OpenCV.
 * Returns null when Python/OpenCV is unavailable or the grid cannot be fit.
 */
export async function readAnswersFromUploadedImage(input: {
  imageBytes: Buffer;
  imageMime: string;
  columns: number;
  rows: number;
  questionCount: number;
  sensitivity: number;
}): Promise<OpencvAnswersResult | null> {
  const script = resolveScriptPath();
  if (!existsSync(script)) return null;

  const columns = Math.min(6, Math.max(1, input.columns));
  const rows = Math.max(1, input.rows);
  const questionCount = Math.max(1, input.questionCount);
  const sensitivity = Math.min(100, Math.max(40, Math.round(input.sensitivity)));

  const dir = await mkdtemp(join(tmpdir(), "omr-answers-"));
  const imagePath = join(dir, `upload-${randomUUID()}${mimeExtension(input.imageMime)}`);
  const cropPath = join(dir, `answers-crop-${randomUUID()}.jpg`);

  try {
    await writeFile(imagePath, input.imageBytes);
    const { code, stdout, stderr } = await runPython([
      script,
      imagePath,
      "--json",
      "--columns",
      String(columns),
      "--rows",
      String(rows),
      "--questions",
      String(questionCount),
      "--sensitivity",
      String(sensitivity),
      "--crop-out",
      cropPath,
    ]);

    const parsed = parsePythonJson(stdout);
    if (!parsed || parsed.ok === false) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "[omr-answers-opencv]",
          parsed?.error ||
            stderr?.slice(0, 400) ||
            `python exited ${code}; stdout=${stdout.slice(0, 240)}`
        );
      }
      return null;
    }

    const answers = mapAnswers(parsed.answers, questionCount);
    const issues = Array.isArray(parsed.issues)
      ? parsed.issues.filter((item): item is string => typeof item === "string").slice(0, 12)
      : [];

    let cropDataUrl: string | undefined;
    if (existsSync(cropPath)) {
      try {
        const cropBytes = await readFile(cropPath);
        cropDataUrl = `data:image/jpeg;base64,${cropBytes.toString("base64")}`;
      } catch {
        cropDataUrl = undefined;
      }
    }

    return { answers, issues, source: "opencv", cropDataUrl };
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[omr-answers-opencv]", error);
    }
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
