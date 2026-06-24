import { DashboardShell } from "@/components/DashboardShell";
import { teacherNavItems } from "@/lib/dashboard-nav";

type HelpModule = {
  title: string;
  subtitle: string;
  items: string[];
};

type HelpSection = {
  heading: string;
  modules: HelpModule[];
};

const sections: HelpSection[] = [
  {
    heading: "AI-Powered Question Paper Generation",
    modules: [
      {
        title: "AI Question Generator",
        subtitle: "Web-fetch + LLM synthesis",
        items: [
          "Subject × Chapter × Topic filter",
          "Difficulty: Easy / Medium / Hard",
          "Year-wise previous papers fetch",
          "Question count configuration",
          "LaTeX / MathJax rendering (Science)",
          "Re-generate and iteration controls",
        ],
      },
      {
        title: "AI Builder Config",
        subtitle: "Exam-format rules engine",
        items: [
          "NEET / JEE pattern templates",
          "Marking scheme (+4 / -1 config)",
          "Section-wise distribution rules",
          "Bloom's taxonomy level mix",
          "Duplicate / repeat prevention",
          "Paper version lock and seal",
        ],
      },
      {
        title: "AI Quality & Analysis",
        subtitle: "Post-generation validation",
        items: [
          "Accuracy and relevance scoring",
          "Concept coverage heatmap",
          "Ambiguity / error flag alerts",
          "Difficulty distribution chart",
          "AI generation audit log",
        ],
      },
    ],
  },
  {
    heading: "Manual Question Paper Generator",
    modules: [
      {
        title: "Manual Question Paper Generator",
        subtitle: "Select from question bank",
        items: [
          "Multi-filter: Subject / Year / Chapter",
          "Important-only and Repeated-only flags",
          "Keyword search across bank",
          "Select all / page-level bulk pick",
          "Preview before add",
          "Drag-to-reorder in paper",
        ],
      },
      {
        title: "Paper Composer",
        subtitle: "Structure and section builder",
        items: [
          "Section A/B/C (NEET / JEE Advanced)",
          "Duration and max-marks config",
          "Bilingual (EN / Telugu / Hindi)",
          "Header: logo, date, roll no. field",
          "Set A / B / C / D paper shuffling",
          "Generate preview and save paper",
          "Print-ready PDF export",
        ],
      },
    ],
  },
  {
    heading: "Question Bank Management (Bulk Database)",
    modules: [
      {
        title: "Physics Bank",
        subtitle: "NEET + JEE Main / Advanced",
        items: [
          "Mechanics, Optics, Electricity, Modern",
          "1995-2026 PYQs tagged by year",
          "Numerical / integer-type separated",
          "Diagram-based questions with images",
        ],
      },
      {
        title: "Chemistry Bank",
        subtitle: "Organic / Inorganic / Physical",
        items: [
          "P-chem, O-chem, Inorganic split",
          "Equation and structure rendering",
          "Reaction-type tagging",
          "High-weight NEET topics flagged",
        ],
      },
      {
        title: "Biology Bank",
        subtitle: "Botany + Zoology (NEET)",
        items: [
          "NCERT chapter-level mapping",
          "Diagram questions (morphology, cell)",
          "Assertion-Reason type tagged",
          "NEET weightage per chapter",
        ],
      },
      {
        title: "Mathematics Bank",
        subtitle: "JEE Main / Advanced",
        items: [
          "Algebra, Calculus, Coordinate, Vectors",
          "LaTeX rendering for all formulae",
          "Single / Multi-correct / Integer type",
          "JEE Advanced difficulty tier tagging",
        ],
      },
      {
        title: "Bulk Import & Export",
        subtitle: "Mass question operations",
        items: [
          "CSV import",
          "PDF / Word OCR extraction",
          "Scanned paper digitization (AI)",
          "Export filtered bank as PDF/CSV",
          "De-duplication on bulk upload",
        ],
      },
      {
        title: "Taxonomy & Tagging",
        subtitle: "Metadata per question",
        items: [
          "Exam -> Subject -> Chapter -> Topic",
          "Difficulty, Bloom's level, question type",
          "\"Repeated in PYQ\" frequency count",
          "Important / high-weightage flags",
          "Verified / reviewed status",
        ],
      },
    ],
  },
  {
    heading: "OMR & Exam Delivery",
    modules: [
      {
        title: "OMR Sheet Management",
        subtitle: "Design, print and scan",
        items: [
          "OMR template designer (NEET/JEE)",
          "Print-ready OMR + paper bundle",
          "Camera / scanner capture + AI bubble-fill detection",
          "Error and smudge alert flags",
        ],
      },
      {
        title: "Online Exam Module",
        subtitle: "CBT / hybrid delivery",
        items: [
          "Timer + auto-submit",
          "Question palette (NTA-style UI)",
          "Browser lock / anti-cheat",
          "Offline fallback sync",
          "Bilingual question toggle",
        ],
      },
    ],
  },
  {
    heading: "Exam Scheduling",
    modules: [
      {
        title: "Exam Scheduling",
        subtitle: "Centre and slot management",
        items: [
          "Exam date / shift configuration",
          "Centre / room assignment",
          "Hall ticket / admit card generation",
          "SMS / email reminder triggers",
        ],
      },
    ],
  },
  {
    heading: "Student & User Management",
    modules: [
      {
        title: "Student Profiles",
        subtitle: "Enrolment and records",
        items: [
          "Bulk enrolment (CSV / API)",
          "Roll number auto-generation",
          "Attempt history timeline",
          "Target exam: NEET / JEE tag",
        ],
      },
      {
        title: "Teacher / Admin Roles",
        subtitle: "RBAC permissions",
        items: [
          "Create staff account",
          "Paper access permission control",
          "Institute / batch segmentation",
          "Activity / audit trail per role",
        ],
      },
    ],
  },
  {
    heading: "Reports & Analytics",
    modules: [
      {
        title: "Result & Score Reports",
        subtitle: "Instant and aggregate",
        items: [
          "Rank list with percentile",
          "Subject-wise score breakdown",
          "Individual student report card",
          "Bulk PDF / Excel export",
        ],
      },
      {
        title: "Performance Analytics",
        subtitle: "AI-driven insights",
        items: [
          "Weak chapter identification (AI)",
          "Improvement trend across attempts",
          "NEET/JEE cut-off proximity meter",
          "Question difficulty vs response analysis",
        ],
      },
      {
        title: "Institution Dashboard",
        subtitle: "Centre-level overview",
        items: [
          "Batch-wise score heatmap",
          "Low-performer alert and follow-up",
          "Exam frequency and coverage tracker",
          "Teacher-student ratio insights",
        ],
      },
    ],
  },
  {
    heading: "Integration & Admin",
    modules: [
      {
        title: "API & Integrations",
        subtitle: "Extend the platform",
        items: [
          "LMS / ERP integration hooks",
          "SMS / WhatsApp notify (Twilio)",
          "Fee payment gateway",
          "Cloud backup (S3 / GCS)",
        ],
      },
      {
        title: "Platform Administration",
        subtitle: "Config and governance",
        items: [
          "Global exam pattern config",
          "Data privacy and DPDP compliance",
          "Multi-tenant institute onboarding",
          "Uptime and performance monitoring",
        ],
      },
    ],
  },
];

export default function TeacherHelpPage() {
  return (
    <DashboardShell
      badge="Teacher"
      title="Help"
      subtitle="Static reference for platform modules and sub-modules."
      navItems={teacherNavItems}
    >
      <div className="space-y-6">
        {sections.map((section) => (
          <section key={section.heading} className="space-y-3">
            <h2 className="text-base font-semibold">{section.heading}</h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {section.modules.map((module) => (
                <article key={`${section.heading}-${module.title}`} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
                  <h3 className="text-sm font-semibold">{module.title}</h3>
                  <p className="mt-1 text-xs text-[var(--muted)]">{module.subtitle}</p>
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                    {module.items.map((item) => (
                      <li key={`${module.title}-${item}`}>{item}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </DashboardShell>
  );
}
