"use client";

import { useSyncExternalStore } from "react";

type Theme = "dark" | "light";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";

  const storedTheme = window.localStorage.getItem("theme");
  if (storedTheme === "dark" || storedTheme === "light") return storedTheme;

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.dataset.theme = theme;
}

function subscribeToThemeChange(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("theme-change", callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("theme-change", callback);
  };
}

function getServerThemeSnapshot(): Theme {
  return "light";
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeToThemeChange, getInitialTheme, getServerThemeSnapshot);
  const isDark = theme === "dark";

  function toggleTheme() {
    const nextTheme = isDark ? "light" : "dark";
    window.localStorage.setItem("theme", nextTheme);
    applyTheme(nextTheme);
    window.dispatchEvent(new Event("theme-change"));
  }

  return (
    <button
      aria-label={isDark ? "라이트모드로 전환" : "다크모드로 전환"}
      className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-3 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--surface-subtle)]"
      onClick={toggleTheme}
      type="button"
    >
      <span aria-hidden="true">{isDark ? "☾" : "☀"}</span>
      <span>{isDark ? "Dark" : "Light"}</span>
    </button>
  );
}
