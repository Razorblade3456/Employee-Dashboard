"use client";
import { useEffect, useState } from "react";
export type ThemePreference = "day" | "night" | "system";
const key = "gather-theme-preference";
export function useTheme() {
  const [preference, setState] = useState<ThemePreference>("system"),
    [dark, setDark] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const read = () => {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(key);
        if (!saved) {
          const old = localStorage.getItem("gather-theme");
          if (old === "dark") saved = "night";
          if (old === "light") saved = "day";
        }
      } catch {}
      const value = saved === "day" || saved === "night" ? saved : "system";
      setState(value);
      const enabled =
        value === "night" || (value === "system" && media.matches);
      setDark(enabled);
      document.documentElement.classList.toggle("dark", enabled);
    };
    read();
    media.addEventListener("change", read);
    window.addEventListener("storage", read);
    return () => {
      media.removeEventListener("change", read);
      window.removeEventListener("storage", read);
    };
  }, []);
  function setPreference(value: ThemePreference) {
    try {
      localStorage.setItem(key, value);
    } catch {}
    setState(value);
    const enabled =
      value === "night" ||
      (value === "system" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    setDark(enabled);
    document.documentElement.classList.toggle("dark", enabled);
  }
  return {
    preference,
    dark,
    setPreference,
    toggle: () => setPreference(dark ? "day" : "night"),
  };
}
export type ThemeController = ReturnType<typeof useTheme>;
