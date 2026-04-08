"use client";

import { useEffect, useState } from "react";

type ThemeChoice = "light" | "dark" | "system";

function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.setAttribute("data-theme", prefersDark ? "dark" : "light");
    return;
  }
  root.setAttribute("data-theme", choice);
}

export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>("system");

  useEffect(() => {
    const saved = localStorage.getItem("theme-choice");
    const value: ThemeChoice = saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
    setChoice(value);
    applyTheme(value);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => {
      if (choice === "system") applyTheme("system");
    };
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [choice]);

  function onChange(next: ThemeChoice) {
    setChoice(next);
    localStorage.setItem("theme-choice", next);
    applyTheme(next);
  }

  return (
    <label className="inline-flex items-center gap-2 text-xs text-[var(--muted)]">
      Theme
      <select
        className="rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs text-[var(--foreground)]"
        value={choice}
        onChange={(e) => onChange(e.target.value as ThemeChoice)}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
