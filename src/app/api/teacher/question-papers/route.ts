import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/api-auth";
import { uploadQuestionPaperFile } from "@/lib/question-paper-storage";
import { getSupabaseStorageConfigError } from "@/lib/supabase-admin";
import type { Category } from "@/lib/types";

export async function GET() {
  const { session, response } = await requireRoles(["TEACHER"]);
  if (response) return response;

  const papers = await prisma.questionPaper.findMany({
    where: { teacherId: session.sub },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ papers });
}

function parseCategory(body: { category?: string }, meCategory: string): Category | null {
  const category = body.category as Category | undefined;
  if (category !== "JEE" && category !== "NEET") return null;
  if (category !== meCategory) return null;
  return category;
}

export async function POST(request: Request) {
  const { session, response } = await requireRoles(["TEACHER"]);
  if (response) return response;

  const me = await prisma.teacher.findUnique({ where: { id: session.sub } });
  if (!me) {
    return NextResponse.json({ error: "Invalid teacher profile" }, { status: 400 });
  }

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const storageCfg = getSupabaseStorageConfigError();
    if (storageCfg) {
      return NextResponse.json({ error: storageCfg }, { status: 503 });
    }
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
    }
    const title = String(form.get("title") ?? "").trim();
    const questionContent = String(form.get("questionContent") ?? "").trim();
    const keyContent = String(form.get("keyContent") ?? "").trim();
    const isAiGenerated = String(form.get("isAiGenerated") ?? "").trim() === "true";
    const aiPromptVersion = String(form.get("aiPromptVersion") ?? "").trim();
    const aiConfigRaw = String(form.get("aiConfig") ?? "").trim();
    const generationMetaRaw = String(form.get("generationMeta") ?? "").trim();
    const category = parseCategory({ category: String(form.get("category") ?? "") }, me.category);
    const file = form.get("questionPaperFile");

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    if (!category) {
      return NextResponse.json({ error: "Category must be JEE or NEET and match your assigned track" }, { status: 400 });
    }
    const hasFile = file instanceof File && file.size > 0;
    if (!questionContent && !hasFile) {
      return NextResponse.json(
        { error: "Provide question paper text and/or a question paper file." },
        { status: 400 }
      );
    }

    let aiConfig: unknown = null;
    let generationMeta: unknown = null;
    if (aiConfigRaw) {
      try {
        aiConfig = JSON.parse(aiConfigRaw);
      } catch {
        return NextResponse.json({ error: "Invalid aiConfig JSON" }, { status: 400 });
      }
    }
    if (generationMetaRaw) {
      try {
        generationMeta = JSON.parse(generationMetaRaw);
      } catch {
        return NextResponse.json({ error: "Invalid generationMeta JSON" }, { status: 400 });
      }
    }

    try {
      const paper = await prisma.questionPaper.create({
        data: {
          teacherId: session.sub,
          category,
          title,
          questionContent: questionContent || "",
          keyContent,
          isAiGenerated,
          aiPromptVersion: aiPromptVersion || null,
          aiConfig,
          generationMeta,
        },
      });

      if (hasFile) {
        try {
          const questionPaperUrl = await uploadQuestionPaperFile(session.sub, paper.id, "question-paper", file);
          const updated = await prisma.questionPaper.update({
            where: { id: paper.id },
            data: { questionPaperUrl },
          });
          return NextResponse.json({ paper: updated });
        } catch (e) {
          await prisma.questionPaper.delete({ where: { id: paper.id } }).catch(() => {});
          throw e;
        }
      }
      return NextResponse.json({ paper });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  let body: {
    title?: string;
    questionContent?: string;
    keyContent?: string;
    category?: string;
    isAiGenerated?: boolean;
    aiPromptVersion?: string;
    aiConfig?: unknown;
    generationMeta?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const title = body.title?.trim();
  const questionContent = body.questionContent?.trim();
  const keyContent = body.keyContent?.trim() ?? "";
  const category = parseCategory(body, me.category);
  if (!title || !questionContent) {
    return NextResponse.json({ error: "Title and question paper content are required" }, { status: 400 });
  }
  if (!category) {
    return NextResponse.json({ error: "Category must be JEE or NEET and match your assigned track" }, { status: 400 });
  }

  const paper = await prisma.questionPaper.create({
    data: {
      teacherId: session.sub,
      category,
      title,
      questionContent,
      keyContent,
      isAiGenerated: Boolean(body.isAiGenerated),
      aiPromptVersion: body.aiPromptVersion?.trim() || null,
      aiConfig: body.aiConfig ?? null,
      generationMeta: body.generationMeta ?? null,
    },
  });
  return NextResponse.json({ paper });
}

export async function PATCH(request: Request) {
  const { session, response } = await requireRoles(["TEACHER"]);
  if (response) return response;

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const storageCfg = getSupabaseStorageConfigError();
    if (storageCfg) {
      return NextResponse.json({ error: storageCfg }, { status: 503 });
    }
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
    }
    const paperId = String(form.get("paperId") ?? "").trim();
    const keyContent = String(form.get("keyContent") ?? "").trim();
    const file = form.get("answerSheetFile");
    const hasFile = file instanceof File && file.size > 0;

    if (!paperId) {
      return NextResponse.json({ error: "paperId is required" }, { status: 400 });
    }
    if (!keyContent && !hasFile) {
      return NextResponse.json({ error: "Provide answer key text and/or an answer sheet file." }, { status: 400 });
    }

    const paper = await prisma.questionPaper.findFirst({
      where: { id: paperId, teacherId: session.sub },
      select: { id: true },
    });
    if (!paper) {
      return NextResponse.json({ error: "Question paper not found under your account" }, { status: 404 });
    }

    try {
      let answerSheetUrl: string | null | undefined;
      if (hasFile) {
        answerSheetUrl = await uploadQuestionPaperFile(session.sub, paperId, "answer-sheet", file);
      }
      const updated = await prisma.questionPaper.update({
        where: { id: paperId },
        data: {
          ...(keyContent ? { keyContent } : {}),
          ...(answerSheetUrl !== undefined ? { answerSheetUrl } : {}),
        },
      });
      return NextResponse.json({ paper: updated });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  let body: { paperId?: string; keyContent?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const paperId = body.paperId?.trim();
  const keyContent = body.keyContent?.trim();
  if (!paperId || !keyContent) {
    return NextResponse.json({ error: "paperId and answer key are required" }, { status: 400 });
  }

  const paper = await prisma.questionPaper.findFirst({
    where: { id: paperId, teacherId: session.sub },
    select: { id: true },
  });
  if (!paper) {
    return NextResponse.json({ error: "Question paper not found under your account" }, { status: 404 });
  }

  const updated = await prisma.questionPaper.update({
    where: { id: paperId },
    data: { keyContent },
  });
  return NextResponse.json({ paper: updated });
}
