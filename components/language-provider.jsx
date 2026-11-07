"use client";

import React, { createContext, useContext, useEffect, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { DICTIONARY, DEFAULT_LOCALE, SUPPORTED_LOCALES } from "@/lib/i18n/dictionary";

const LanguageContext = createContext({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (key, fallback, params) => interpolate(typeof fallback === "string" ? fallback : key, typeof fallback === "object" ? fallback : params),
  mounted: false,
  isStaff: false,
});

function interpolate(template, params) {
  if (typeof template !== "string" || !params || typeof params !== "object") {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, paramKey) => {
    return params[paramKey] !== undefined ? params[paramKey] : match;
  });
}

function lookupKey(dict, key, fallback) {
  if (!key || typeof key !== "string") {
    return fallback !== undefined ? fallback : "";
  }

  const segments = key.split(".");
  let current = dict;
  for (const segment of segments) {
    if (current && typeof current === "object" && segment in current) {
      current = current[segment];
    } else {
      // Fallback to English dictionary
      let eng = DICTIONARY[DEFAULT_LOCALE];
      for (const es of segments) {
        if (eng && typeof eng === "object" && es in eng) {
          eng = eng[es];
        } else {
          eng = undefined;
          break;
        }
      }
      return eng !== undefined ? eng : (fallback !== undefined ? fallback : key);
    }
  }

  return current !== undefined ? current : (fallback !== undefined ? fallback : key);
}

export function LanguageProvider({ children, initialLocale = DEFAULT_LOCALE, userRole }) {
  const pathname = usePathname();
  const [locale, setLocaleState] = useState(initialLocale);
  const [mounted, setMounted] = useState(false);
  const [, startTransition] = useTransition();

  // Strict isolation: detect doctor/admin by explicit role or current route
  const isStaffRoute = Boolean(
    pathname && (
      pathname === "/admin" ||
      pathname.startsWith("/admin/") ||
      pathname === "/doctor" ||
      pathname.startsWith("/doctor/") ||
      pathname.includes("/workspace")
    )
  );
  const isStaffRole = userRole === "DOCTOR" || userRole === "ADMIN";
  const isStaff = isStaffRoute || isStaffRole;

  useEffect(() => {
    try {
      const stored = localStorage.getItem("chikitsaak_lang");
      if (stored && SUPPORTED_LOCALES.includes(stored)) {
        setLocaleState(stored);
      }
    } catch {
      // Ignored if storage access is restricted
    }
    setMounted(true);
  }, []);

  const setLocale = (newLocale) => {
    // If user is doctor/admin or on a staff route, prevent changing locale from English
    if (isStaff) return;
    if (!SUPPORTED_LOCALES.includes(newLocale)) return;

    startTransition(() => {
      setLocaleState(newLocale);
      try {
        localStorage.setItem("chikitsaak_lang", newLocale);
        document.cookie = `chikitsaak_lang=${newLocale}; path=/; max-age=31536000; SameSite=Lax`;
      } catch {
        // Ignored
      }
    });
  };

  const t = (key, fallback, params) => {
    const actualParams = typeof fallback === "object" && fallback !== null ? fallback : params;
    const actualFallback = typeof fallback === "object" ? key : fallback;

    // If staff user or staff route, strictly return canonical English
    if (isStaff) {
      return interpolate(lookupKey(DICTIONARY[DEFAULT_LOCALE], key, actualFallback), actualParams);
    }

    // Before mounting on the client, always use DEFAULT_LOCALE (en) to prevent SSR/hydration mismatch
    const activeLocale = mounted ? locale : DEFAULT_LOCALE;
    const dict = DICTIONARY[activeLocale] || DICTIONARY[DEFAULT_LOCALE];

    const value = lookupKey(dict, key, actualFallback);
    return interpolate(value, actualParams);
  };

  return (
    <LanguageContext.Provider value={{ locale: isStaff ? DEFAULT_LOCALE : locale, setLocale, t, mounted, isStaff }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
