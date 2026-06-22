import "dotenv/config";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

type JeeSubject = "Maths" | "Physics" | "Chemistry";
type NeetSubject = "Physics" | "Chemistry" | "Botany" | "Zoology";
type Subject = JeeSubject | NeetSubject;
type Difficulty = "easy" | "medium" | "hard";

type QuestionKind =
  | "mains_mcq"
  | "mains_numerical"
  | "advanced_mcq_single"
  | "advanced_mcq_multiple"
  | "advanced_numerical"
  | "neet_mcq";

type SeedRow = {
  exam: "JEE" | "NEET";
  exam_type: "mains" | "advanced" | null;
  subject: Subject;
  year: number | null;
  chapter: string | null;
  difficulty: Difficulty;
  question_text: string;
  options: string[] | null;
  correct_answer: string | null;
  source_name: string;
  source_url: string;
  tags: string[];
  content_hash: string;
};

const prisma = new PrismaClient();
const TARGET = Number(process.env.SEED_TARGET_PER_SUBJECT ?? "20000");
const BATCH_SIZE = Number(process.env.SEED_BATCH_SIZE ?? "250");
const SEED_MODE = process.argv.includes("--double-advanced")
  ? "double-advanced"
  : (process.env.SEED_MODE ?? "full");
const ADVANCED_SERIAL_BASE = 500_000;
const SOURCE_NAME = "Bulk seed generator";
const SOURCE_URL = "scripts/seed-question-bank-bulk";

const JEE_SUBJECTS: JeeSubject[] = ["Maths", "Physics", "Chemistry"];
const NEET_SUBJECTS: NeetSubject[] = ["Physics", "Chemistry", "Botany", "Zoology"];

const JEE_KIND_QUOTAS: Record<QuestionKind, number> = {
  mains_mcq: 10_000,
  mains_numerical: 5_000,
  advanced_mcq_single: 2_000,
  advanced_mcq_multiple: 2_000,
  advanced_numerical: 1_000,
  neet_mcq: 0,
};

const NEET_KIND_QUOTAS: Record<QuestionKind, number> = {
  mains_mcq: 0,
  mains_numerical: 0,
  advanced_mcq_single: 0,
  advanced_mcq_multiple: 0,
  advanced_numerical: 0,
  neet_mcq: 20_000,
};

const CHAPTERS: Record<Subject, string[]> = {
  Maths: ["Calculus", "Algebra", "Coordinate Geometry", "Probability", "Matrices", "Trigonometry", "Vectors"],
  Physics: ["Mechanics", "Thermodynamics", "Electrostatics", "Optics", "Modern Physics", "Waves", "Magnetism"],
  Chemistry: ["Organic Chemistry", "Inorganic Chemistry", "Physical Chemistry", "Equilibrium", "Electrochemistry", "Chemical Kinetics"],
  Botany: ["Plant Physiology", "Plant Anatomy", "Morphology", "Genetics", "Ecology", "Reproduction in Plants", "Cell Biology"],
  Zoology: ["Human Physiology", "Animal Kingdom", "Genetics", "Evolution", "Reproduction", "Biotechnology", "Ecology"],
};

function scaleQuotas(quotas: Record<QuestionKind, number>, target: number): Record<QuestionKind, number> {
  const total = Object.values(quotas).reduce((a, b) => a + b, 0);
  if (total === 0 || total === target) return { ...quotas };
  const scaled = {} as Record<QuestionKind, number>;
  let assigned = 0;
  const entries = Object.entries(quotas).filter(([, n]) => n > 0) as [QuestionKind, number][];
  for (let i = 0; i < entries.length; i += 1) {
    const [kind, count] = entries[i];
    if (i === entries.length - 1) {
      scaled[kind] = target - assigned;
    } else {
      const n = Math.round((count / total) * target);
      scaled[kind] = n;
      assigned += n;
    }
  }
  for (const k of Object.keys(quotas) as QuestionKind[]) {
    if (scaled[k] === undefined) scaled[k] = 0;
  }
  return scaled;
}

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/\\[a-z]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hashText(input: string): string {
  return createHash("sha256").update(normalizeText(input)).digest("hex");
}

function difficultyFor(serial: number): Difficulty {
  const m = serial % 10;
  if (m < 3) return "easy";
  if (m < 7) return "medium";
  return "hard";
}

function pickChapter(subject: Subject, serial: number): string {
  const list = CHAPTERS[subject];
  return list[serial % list.length];
}

function numericValue(serial: number): number {
  return ((serial * 17 + 13) % 97) + 1;
}

function buildQuestion(subject: Subject, kind: QuestionKind, serial: number): SeedRow {
  const chapter = pickChapter(subject, serial);
  const difficulty = difficultyFor(serial);
  const year = 2015 + (serial % 11);
  const n = numericValue(serial);

  if (kind === "neet_mcq") {
    const correctIdx = serial % 4;
    const correct = String.fromCharCode(65 + correctIdx);
    const options = ["Option A", "Option B", "Option C", "Option D"].map(
      (label, i) => `${label}: ${chapter} concept variant ${n + i * 3} for ${subject}`
    );
    options[correctIdx] = `${String.fromCharCode(65 + correctIdx)}: Correct ${chapter} statement #${serial}`;
    const question_text = `[NEET ${subject} #${serial}] ${chapter}: Which statement is correct regarding the given concept?`;
    return {
      exam: "NEET",
      exam_type: null,
      subject,
      year,
      chapter,
      difficulty,
      question_text,
      options,
      correct_answer: correct,
      source_name: SOURCE_NAME,
      source_url: SOURCE_URL,
      tags: ["neet", "mcq", "bulk-seed", subject.toLowerCase()],
      content_hash: `${subject}:neet:${hashText(question_text)}`,
    };
  }

  const exam: "JEE" = "JEE";

  if (kind === "mains_mcq") {
    const correctIdx = serial % 4;
    const correct = String.fromCharCode(65 + correctIdx);
    const options = [0, 1, 2, 3].map(
      (i) => `${String.fromCharCode(65 + i)}. ${chapter} expression ${n + i * 5}`
    );
    const question_text = `[JEE Mains ${subject} MCQ #${serial}] ${chapter}: Select the single correct option.`;
    return {
      exam,
      exam_type: "mains",
      subject: subject as JeeSubject,
      year,
      chapter,
      difficulty,
      question_text,
      options,
      correct_answer: correct,
      source_name: SOURCE_NAME,
      source_url: SOURCE_URL,
      tags: ["jee", "mains", "mcq", "bulk-seed"],
      content_hash: `${subject}:mains:mcq:${hashText(question_text)}`,
    };
  }

  if (kind === "mains_numerical") {
    const correctIdx = serial % 4;
    const correct = String.fromCharCode(65 + correctIdx);
    const answerNum = n + 0.5 * (serial % 3);
    const options = [0, 1, 2, 3].map((i) => {
      const val = i === correctIdx ? answerNum : answerNum + (i + 1) * 2.5;
      return `${String.fromCharCode(65 + i)}. ${Number(val.toFixed(2))}`;
    });
    const question_text = `[JEE Mains ${subject} Numerical #${serial}] ${chapter}: Find the numerical value (options given). Round to nearest integer where applicable.`;
    return {
      exam,
      exam_type: "mains",
      subject: subject as JeeSubject,
      year,
      chapter,
      difficulty,
      question_text,
      options,
      correct_answer: correct,
      source_name: SOURCE_NAME,
      source_url: SOURCE_URL,
      tags: ["jee", "mains", "numerical", "bulk-seed"],
      content_hash: `${subject}:mains:num:${hashText(question_text)}`,
    };
  }

  if (kind === "advanced_mcq_single") {
    const correctIdx = serial % 4;
    const correct = String.fromCharCode(65 + correctIdx);
    const options = [0, 1, 2, 3].map(
      (i) => `${String.fromCharCode(65 + i)}. ${chapter} advanced relation ${n + i}`
    );
    const question_text = `[JEE Advanced ${subject} Single Correct #${serial}] ${chapter}: Choose the only correct statement.`;
    return {
      exam,
      exam_type: "advanced",
      subject: subject as JeeSubject,
      year,
      chapter,
      difficulty,
      question_text,
      options,
      correct_answer: correct,
      source_name: SOURCE_NAME,
      source_url: SOURCE_URL,
      tags: ["jee", "advanced", "mcq", "bulk-seed"],
      content_hash: `${subject}:advanced:mcq:${hashText(question_text)}`,
    };
  }

  if (kind === "advanced_mcq_multiple") {
    const pairs = ["AB", "AC", "AD", "BC", "BD", "CD", "ABC", "ACD"] as const;
    const correct = pairs[serial % pairs.length];
    const options = [
      "A. Statement I is true",
      "B. Statement II is true",
      "C. Statement III is true",
      "D. Statement IV is true",
    ];
    const question_text = `[JEE Advanced ${subject} Multiple Correct #${serial}] ${chapter}: One or more options may be correct.`;
    return {
      exam,
      exam_type: "advanced",
      subject: subject as JeeSubject,
      year,
      chapter,
      difficulty,
      question_text,
      options,
      correct_answer: correct,
      source_name: SOURCE_NAME,
      source_url: SOURCE_URL,
      tags: ["jee", "advanced", "multiple correct", "bulk-seed"],
      content_hash: `${subject}:advanced:multi:${hashText(question_text)}`,
    };
  }

  // advanced_numerical
  const answer = (n + serial * 0.25).toFixed(2);
  const question_text = `[JEE Advanced ${subject} Numerical #${serial}] ${chapter}: Enter the numerical value (integer type).`;
  return {
    exam,
    exam_type: "advanced",
    subject: subject as JeeSubject,
    year,
    chapter,
    difficulty,
    question_text,
    options: null,
    correct_answer: answer,
    source_name: SOURCE_NAME,
    source_url: SOURCE_URL,
    tags: ["jee", "advanced", "numerical", "integer type", "bulk-seed"],
    content_hash: `${subject}:advanced:num:${hashText(question_text)}`,
  };
}

async function ensureTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS question_bank (
      id BIGSERIAL PRIMARY KEY,
      exam TEXT NOT NULL,
      subject TEXT NOT NULL,
      year INTEGER NULL,
      question_text TEXT NOT NULL,
      options JSONB NULL,
      correct_answer TEXT NULL,
      source_name TEXT NOT NULL,
      source_url TEXT NOT NULL,
      chapter TEXT NULL,
      difficulty TEXT NULL,
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      content_hash TEXT NOT NULL UNIQUE,
      repetition_count INTEGER NOT NULL DEFAULT 1,
      is_repeated BOOLEAN NOT NULL DEFAULT FALSE,
      is_important BOOLEAN NOT NULL DEFAULT FALSE,
      exam_type TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await prisma.$executeRawUnsafe(`ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS exam_type TEXT NULL;`);
}

async function countByKind(exam: "JEE" | "NEET", subject: Subject): Promise<Record<QuestionKind, number>> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{ kind: string; cnt: number }>
  >(
    `
    SELECT
      CASE
        WHEN exam = 'NEET' THEN 'neet_mcq'
        WHEN exam_type = 'mains' AND tags::text ILIKE '%numerical%' THEN 'mains_numerical'
        WHEN exam_type = 'mains' THEN 'mains_mcq'
        WHEN exam_type = 'advanced' AND tags::text ILIKE '%multiple correct%' THEN 'advanced_mcq_multiple'
        WHEN exam_type = 'advanced' AND tags::text ILIKE '%numerical%' THEN 'advanced_numerical'
        WHEN exam_type = 'advanced' THEN 'advanced_mcq_single'
        ELSE 'mains_mcq'
      END AS kind,
      COUNT(*)::int AS cnt
    FROM question_bank
    WHERE exam = $1 AND subject = $2
    GROUP BY 1
    `,
    exam,
    subject
  );
  const out: Record<QuestionKind, number> = {
    mains_mcq: 0,
    mains_numerical: 0,
    advanced_mcq_single: 0,
    advanced_mcq_multiple: 0,
    advanced_numerical: 0,
    neet_mcq: 0,
  };
  for (const row of rows) {
    const k = row.kind as QuestionKind;
    if (k in out) out[k] = row.cnt;
  }
  return out;
}

async function insertBatch(rows: SeedRow[]): Promise<number> {
  if (rows.length === 0) return 0;

  const params: unknown[] = [];
  const valueGroups: string[] = [];

  rows.forEach((r, idx) => {
    const base = idx * 13;
    valueGroups.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::int, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}::jsonb, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}::jsonb, $${base + 13}, 1, false, false, NOW())`
    );
    params.push(
      r.exam,
      r.exam_type,
      r.subject,
      r.year,
      r.chapter,
      r.difficulty,
      r.question_text,
      JSON.stringify(r.options),
      r.correct_answer,
      r.source_name,
      r.source_url,
      JSON.stringify(r.tags),
      r.content_hash
    );
  });

  const result = await prisma.$executeRawUnsafe(
    `
    INSERT INTO question_bank (
      exam, exam_type, subject, year, chapter, difficulty, question_text, options, correct_answer,
      source_name, source_url, tags, content_hash, repetition_count, is_repeated, is_important, updated_at
    )
    VALUES ${valueGroups.join(", ")}
    ON CONFLICT (content_hash) DO NOTHING
    `,
    ...params
  );
  return typeof result === "number" ? result : rows.length;
}

async function seedSubject(
  exam: "JEE" | "NEET",
  subject: Subject,
  quotas: Record<QuestionKind, number>
): Promise<void> {
  const scaled = scaleQuotas(quotas, TARGET);
  const existing = await countByKind(exam, subject);
  const totalExisting = Object.values(existing).reduce((a, b) => a + b, 0);

  console.log(`\n[${exam} ${subject}] existing total: ${totalExisting} / ${TARGET}`);

  if (totalExisting >= TARGET) {
    console.log(`  Skipping — already at target.`);
    return;
  }

  let remaining = TARGET - totalExisting;
  let serial = totalExisting + 1;
  const pending: SeedRow[] = [];

  for (const kind of Object.keys(scaled) as QuestionKind[]) {
    if (remaining <= 0) break;
    const quota = scaled[kind];
    if (quota <= 0) continue;
    const have = existing[kind] ?? 0;
    const need = Math.min(quota - have, remaining);
    for (let i = 0; i < need; i += 1) {
      pending.push(buildQuestion(subject, kind, serial));
      serial += 1;
      remaining -= 1;

      if (pending.length >= BATCH_SIZE) {
        await insertBatch(pending.splice(0, pending.length));
        if ((serial - 1) % 5000 === 0) {
          console.log(`  [${subject}] inserted ~${serial - 1} rows…`);
        }
      }
    }
  }

  if (pending.length > 0) {
    await insertBatch(pending);
  }

  const finalCount = await prisma.$queryRawUnsafe<Array<{ cnt: number }>>(
    `SELECT COUNT(*)::int AS cnt FROM question_bank WHERE exam = $1 AND subject = $2`,
    exam,
    subject
  );
  console.log(`  Done. ${subject} total: ${finalCount[0]?.cnt ?? 0}`);
}

const ADVANCED_KINDS: QuestionKind[] = [
  "advanced_mcq_single",
  "advanced_mcq_multiple",
  "advanced_numerical",
];

async function seedAdvancedTopup(subject: JeeSubject, subjectIndex: number): Promise<void> {
  const existing = await countByKind("JEE", subject);
  const advancedTotal = ADVANCED_KINDS.reduce((sum, kind) => sum + (existing[kind] ?? 0), 0);

  console.log(`\n[JEE ${subject}] advanced total: ${advancedTotal}`);

  if (advancedTotal === 0) {
    console.log("  Skipping — no advanced questions found.");
    return;
  }

  let serial = ADVANCED_SERIAL_BASE + subjectIndex * 100_000;
  const pending: SeedRow[] = [];
  let inserted = 0;

  for (const kind of ADVANCED_KINDS) {
    const have = existing[kind] ?? 0;
    if (have <= 0) continue;

    for (let i = 0; i < have; i += 1) {
      pending.push(buildQuestion(subject, kind, serial));
      serial += 1;
      inserted += 1;

      if (pending.length >= BATCH_SIZE) {
        await insertBatch(pending.splice(0, pending.length));
      }
    }
  }

  if (pending.length > 0) {
    await insertBatch(pending);
  }

  const after = await countByKind("JEE", subject);
  const advancedAfter = ADVANCED_KINDS.reduce((sum, kind) => sum + (after[kind] ?? 0), 0);
  console.log(`  Added ${inserted} advanced rows. ${subject} advanced now: ${advancedAfter}`);
}

async function main(): Promise<void> {
  await ensureTable();

  if (SEED_MODE === "double-advanced") {
    console.log("Doubling JEE Advanced question counts per subject");
    for (let i = 0; i < JEE_SUBJECTS.length; i += 1) {
      await seedAdvancedTopup(JEE_SUBJECTS[i], i);
    }

    const summary = await prisma.$queryRawUnsafe<
      Array<{ subject: string; kind: string; cnt: number }>
    >(
      `
      SELECT subject,
        CASE
          WHEN tags::text ILIKE '%multiple correct%' THEN 'advanced_mcq_multiple'
          WHEN tags::text ILIKE '%numerical%' THEN 'advanced_numerical'
          ELSE 'advanced_mcq_single'
        END AS kind,
        COUNT(*)::int AS cnt
      FROM question_bank
      WHERE exam = 'JEE' AND exam_type = 'advanced'
      GROUP BY subject, kind
      ORDER BY subject, kind
      `
    );

    console.log("\n=== JEE Advanced Summary ===");
    for (const row of summary) {
      console.log(`${row.subject} | ${row.kind}: ${row.cnt}`);
    }
    return;
  }

  console.log(`Seeding question bank — target ${TARGET} questions per subject`);
  await ensureTable();

  const jeeQuotas = scaleQuotas(JEE_KIND_QUOTAS, TARGET);
  const neetQuotas = scaleQuotas(NEET_KIND_QUOTAS, TARGET);

  for (const subject of JEE_SUBJECTS) {
    await seedSubject("JEE", subject, jeeQuotas);
  }

  for (const subject of NEET_SUBJECTS) {
    await seedSubject("NEET", subject, neetQuotas);
  }

  const summary = await prisma.$queryRawUnsafe<
    Array<{ exam: string; subject: string; exam_type: string | null; cnt: number }>
  >(
    `
    SELECT exam, subject, exam_type, COUNT(*)::int AS cnt
    FROM question_bank
    GROUP BY exam, subject, exam_type
    ORDER BY exam, subject, exam_type NULLS LAST
    `
  );

  console.log("\n=== Summary ===");
  for (const row of summary) {
    console.log(`${row.exam} | ${row.subject} | ${row.exam_type ?? "—"}: ${row.cnt}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
