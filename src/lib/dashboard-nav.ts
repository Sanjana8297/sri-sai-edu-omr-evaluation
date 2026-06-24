export type NavItem = {
  href: string;
  label: string;
  children?: NavItem[];
};

export type TeacherTrack = "JEE" | "NEET";

export const SUBJECTS_BY_TRACK: Record<TeacherTrack, string[]> = {
  JEE: ["Maths", "Physics", "Chemistry"],
  NEET: ["Physics", "Chemistry", "Botany", "Zoology"],
};

const FETCH_NEW_QUESTIONS_NAV: NavItem = {
  href: "/dashboard/teacher/fetch-new-question-using-ai",
  label: "Fetch new Questions using AI",
};

export function buildTeacherNavItems(track: TeacherTrack): NavItem[] {
  const questionBankChildren: NavItem[] = [
    ...SUBJECTS_BY_TRACK[track].map((subject) => ({
      href: `/dashboard/teacher/question-bank/${encodeURIComponent(subject)}`,
      label: subject,
    })),
    FETCH_NEW_QUESTIONS_NAV,
  ];

  return [
    {
      href: "/dashboard/teacher/manual-builder",
      label: "Manual Question Paper Generator",
      children: [
        { href: "/dashboard/teacher/manual-builder?step=1", label: "Select from question bank" },
        { href: "/dashboard/teacher/manual-builder?step=2", label: "Paper composer" },
        { href: "/dashboard/teacher/manual-builder?step=3", label: "Answer key & solutions" },
      ],
    },
    { href: "/dashboard/teacher/ai-builder", label: "AI Question Paper Generator" },
    {
      href: "/dashboard/teacher/question-bank",
      label: "Question Banks",
      children: questionBankChildren,
    },
    {
      href: "/dashboard/teacher/exams",
      label: "OMR & Exam Delivery",
      children: [
        { href: "/dashboard/teacher/exams?section=omr", label: "OMR Sheet Management" },
        { href: "/dashboard/teacher/exams?section=online", label: "Online Exam Module" },
        { href: "/dashboard/teacher/exams?section=scheduling", label: "Exam Scheduling" },
      ],
    },
    { href: "/dashboard/teacher/uploaded-papers", label: "Completed Exam Papers" },
    { href: "/dashboard/teacher/students", label: "User Management" },
    { href: "/dashboard/teacher/help", label: "Help" },
  ];
}

/** Default teacher nav (JEE) for static/server usage until track is loaded in the shell. */
export const teacherNavItems = buildTeacherNavItems("JEE");

export const adminNavItems: NavItem[] = [
  {
    href: "/dashboard/admin/user-management",
    label: "Student & User Management",
    children: [
      {
        href: "/dashboard/admin/user-management?section=profiles",
        label: "Student Profiles",
      },
      {
        href: "/dashboard/admin/user-management?section=roles",
        label: "Teacher / Admin Roles",
      },
    ],
  },
  {
    href: "/dashboard/admin/reports",
    label: "Reports & Analytics",
    children: [
      { href: "/dashboard/admin/reports?section=results", label: "Result & Score Reports" },
      { href: "/dashboard/admin/reports?section=analytics", label: "Performance Analytics" },
      { href: "/dashboard/admin/reports?section=institution", label: "Institution Dashboard" },
    ],
  },
  { href: "/dashboard/admin/audit-trail", label: "Activity / audit trail" },
  { href: "/dashboard/admin/llm-settings", label: "LLM Settings" },
];

export const studentNavItems: NavItem[] = [
  { href: "/dashboard/student/performance-summary", label: "Performance summary" },
  { href: "/dashboard/student/exams", label: "Take exam" },
  { href: "/dashboard/student/exam-history", label: "Exam history" },
  { href: "/dashboard/student/analysis-notes", label: "Analysis notes" },
];

/** Match current route to a nav href (path + optional query string). */
export function navHrefIsActive(pathname: string, search: string, href: string): boolean {
  const qIndex = href.indexOf("?");
  const hrefPath = qIndex >= 0 ? href.slice(0, qIndex) : href;
  const hrefQuery = qIndex >= 0 ? href.slice(qIndex + 1) : "";

  if (pathname !== hrefPath) return false;
  if (!hrefQuery) {
    const actual = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    return actual.get("step") === null && actual.get("section") === null;
  }

  const expected = new URLSearchParams(hrefQuery);
  const actual = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  for (const [key, value] of expected.entries()) {
    if (actual.get(key) !== value) return false;
  }
  return true;
}

export function navItemIsActive(pathname: string, search: string, item: NavItem): boolean {
  if (navHrefIsActive(pathname, search, item.href)) return true;
  return item.children?.some((child) => navHrefIsActive(pathname, search, child.href)) ?? false;
}
