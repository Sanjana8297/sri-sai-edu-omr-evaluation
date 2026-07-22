import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type OpencvRollDigit = {
  position: number;
  digit: number | null;
  confidence: number;
  flagged: boolean;
};

export type OpencvRollResult = {
  rollNumber: string | null;
  digits: OpencvRollDigit[];
  issues: string[];
  source: "opencv";
  /** Cropped ROLL NUMBER region as a data URL for a focused AI fallback. */
  cropDataUrl?: string;
};

type PythonRollJson = {
  ok?: boolean;
  valid?: boolean;
  rollNumber?: string | null;
  digits?: Array<{
    position?: number;
    columnLabel?: number;
    digit?: number | null;
    rowLabel?: number | null;
    status?: string;
    confidence?: number;
    flagged?: boolean;
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
  return join(process.cwd(), "scripts", "omr_roll_reader.py");
}

function runPython(
  args: string[],
  timeoutMs = 45_000
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
      resolve({ code: null, stdout, stderr: stderr || "OpenCV roll reader timed out." });
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

function parsePythonJson(stdout: string): PythonRollJson | null {
  const text = stdout.trim().replace(/^\uFEFF/, "");
  if (!text) return null;
  // Prefer the last complete JSON object (ignore OpenCV warnings if any leaked).
  const start = text.lastIndexOf('{"ok"');
  const from = start >= 0 ? start : text.lastIndexOf("{");
  const end = text.lastIndexOf("}");
  if (from < 0 || end <= from) return null;
  try {
    return JSON.parse(text.slice(from, end + 1)) as PythonRollJson;
  } catch {
    try {
      return JSON.parse(text) as PythonRollJson;
    } catch {
      return null;
    }
  }
}

function mapDigits(raw: PythonRollJson["digits"], columns: number): OpencvRollDigit[] {
  const byPosition = new Map<number, OpencvRollDigit>();
  for (const item of raw ?? []) {
    const position = Number(item.columnLabel ?? item.position);
    if (!Number.isInteger(position) || position < 1 || position > columns) continue;
    const detectedRowLabel = item.rowLabel ?? item.digit;
    const digit =
      detectedRowLabel == null
        ? null
        : Number.isInteger(detectedRowLabel) &&
            detectedRowLabel >= 0 &&
            detectedRowLabel <= 9
          ? detectedRowLabel
          : null;
    const confidence =
      typeof item.confidence === "number" && Number.isFinite(item.confidence)
        ? Math.min(1, Math.max(0, item.confidence))
        : 0;
    const flagged =
      Boolean(item.flagged) ||
      item.status === "blank" ||
      item.status === "ambiguous" ||
      confidence < 0.5;
    byPosition.set(position, { position, digit, confidence, flagged });
  }

  return Array.from({ length: columns }, (_, index) => {
    const position = index + 1;
    return (
      byPosition.get(position) ?? {
        position,
        digit: null,
        confidence: 0,
        flagged: true,
      }
    );
  });
}

/**
 * Decode the ROLL NUMBER grid from the same image bytes uploaded in
 * OMR Sheet Management → AI bubble detection. Writes a temp file only for
 * the Python OpenCV process — no fixed sheet path is required.
 */
export async function readRollFromUploadedImage(input: {
  imageBytes: Buffer;
  imageMime: string;
  columns: number;
}): Promise<OpencvRollResult | null> {
  const script = resolveScriptPath();
  if (!existsSync(script)) return null;

  const columns = Math.min(12, Math.max(5, input.columns));
  const dir = await mkdtemp(join(tmpdir(), "omr-roll-"));
  const imagePath = join(dir, `upload-${randomUUID()}${mimeExtension(input.imageMime)}`);
  const cropPath = join(dir, `roll-crop-${randomUUID()}.jpg`);

  try {
    await writeFile(imagePath, input.imageBytes);
    const { code, stdout, stderr } = await runPython([
      script,
      imagePath,
      "--auto",
      "--json",
      "--columns",
      String(columns),
      "--crop-out",
      cropPath,
    ]);

    const parsed = parsePythonJson(stdout);
    if (!parsed || parsed.ok === false) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "[omr-roll-opencv]",
          parsed?.error ||
            stderr?.slice(0, 400) ||
            `python exited ${code}; stdout=${stdout.slice(0, 240)}`
        );
      }
      return null;
    }

    // Accept partial grids (some columns blank) so callers can keep good left digits
    // and only re-read missing positions.
    const digits = mapDigits(parsed.digits, columns);
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

    return {
      rollNumber:
        typeof parsed.rollNumber === "string" && parsed.rollNumber.trim()
          ? parsed.rollNumber.trim()
          : null,
      digits,
      issues,
      source: "opencv",
      cropDataUrl,
    };
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[omr-roll-opencv]", error);
    }
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
