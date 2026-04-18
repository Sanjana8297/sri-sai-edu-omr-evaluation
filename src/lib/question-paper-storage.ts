/**
 * Uploads file bytes to Supabase Storage (object storage). Postgres only stores the
 * returned public URL string on QuestionPaper — never file contents in the database.
 */
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const BUCKET = "question-papers";
const MAX_BYTES = 15 * 1024 * 1024;

const ALLOWED: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

export function assertAllowedUpload(file: File): { ext: string } {
  const ct = file.type || "application/octet-stream";
  const ext = ALLOWED[ct];
  if (!ext) {
    throw new Error("Unsupported file type. Use PDF, DOCX, or JPEG/PNG/WebP.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("File is too large (max 15 MB).");
  }
  if (file.size === 0) {
    throw new Error("Empty file.");
  }
  return { ext };
}

export async function uploadQuestionPaperFile(
  teacherId: string,
  paperId: string,
  kind: "question-paper" | "answer-sheet",
  file: File
): Promise<string> {
  const { ext } = assertAllowedUpload(file);
  const path = `${teacherId}/${paperId}/${kind}.${ext}`;
  const supabase = getSupabaseAdmin();
  const buf = Buffer.from(await file.arrayBuffer());
  const { error } = await supabase.storage.from(BUCKET).upload(path, buf, {
    contentType: file.type || "application/octet-stream",
    upsert: true,
  });
  if (error) {
    throw new Error(error.message || "Storage upload failed");
  }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
