"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button className="rounded-full border p-2 text-xl">
        ⏳
      </button>
    );
  }

  return (
    <button
      onClick={() =>
        setTheme(resolvedTheme === "dark" ? "light" : "dark")
      }
      className="rounded-full border p-2 text-xl hover:bg-gray-100 dark:hover:bg-gray-800"
    >
      {resolvedTheme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}