import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { useSyncExternalStore } from 'react';
import { initReactI18next } from 'react-i18next';

import enApp from './locales/en/app.json';
import enCommon from './locales/en/common.json';
import enComponents from './locales/en/components.json';
import enLib from './locales/en/lib.json';
import esApp from './locales/es/app.json';
import esCommon from './locales/es/common.json';
import esComponents from './locales/es/components.json';
import esLib from './locales/es/lib.json';
import euApp from './locales/eu/app.json';
import euCommon from './locales/eu/common.json';
import euComponents from './locales/eu/components.json';
import euLib from './locales/eu/lib.json';

/**
 * App languages. Texts live in locales/<lang>/*.json, one file per area of the code, merged into
 * a single namespace: each file uses its own top-level keys (e.g. `expenseForm.*`), so keys never
 * collide. Castellano is the reference language and the fallback for any missing key.
 */
export const LANGUAGES = ['es', 'en', 'eu'] as const;
export type Language = (typeof LANGUAGES)[number];
/** 'auto' follows the phone's language. */
export type LanguagePreference = Language | 'auto';

/** Each language's own name, for the language picker. */
export const LANGUAGE_NAMES: Record<Language, string> = { es: 'Castellano', en: 'English', eu: 'Euskara' };

/** Locale used for numbers, money and dates. */
const INTL_LOCALE: Record<Language, string> = { es: 'es-ES', en: 'en-GB', eu: 'eu-ES' };

const STORAGE_KEY = 'bote.language';

const isLanguage = (value: unknown): value is Language => LANGUAGES.includes(value as Language);

/** The first of the phone's preferred languages that the app has, or castellano. */
export function deviceLanguage(): Language {
  try {
    for (const locale of getLocales()) {
      if (isLanguage(locale.languageCode)) return locale.languageCode;
    }
  } catch {
    // No locale information (some web contexts): use the default.
  }
  return 'es';
}

// Hermes may lack Intl.PluralRules, which i18next needs for `_one`/`_other` keys. The three app
// languages share the same simple rule.
if (typeof Intl === 'undefined' || typeof Intl.PluralRules === 'undefined') {
  class SimplePluralRules {
    resolvedOptions() {
      return { locale: 'es', pluralCategories: ['one', 'other'] };
    }
    select(n: number) {
      return n === 1 ? 'one' : 'other';
    }
  }
  (Intl as unknown as { PluralRules: unknown }).PluralRules = SimplePluralRules;
}

const bundle = (...parts: object[]) => ({ translation: Object.assign({}, ...parts) });

void i18n.use(initReactI18next).init({
  resources: {
    es: bundle(esCommon, esApp, esComponents, esLib),
    en: bundle(enCommon, enApp, enComponents, enLib),
    eu: bundle(euCommon, euApp, euComponents, euLib),
  },
  lng: deviceLanguage(),
  fallbackLng: 'es',
  supportedLngs: [...LANGUAGES],
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
export const t = i18n.t.bind(i18n);

/** Current app language. */
export function currentLanguage(): Language {
  return isLanguage(i18n.language) ? i18n.language : 'es';
}

/** Locale for Intl formatters (es-ES, en-GB, eu-ES). */
export function intlLocale(): string {
  return INTL_LOCALE[currentLanguage()];
}

const dateFormats = new Map<string, Intl.DateTimeFormat>();

/** Formats a date in the app language. Formatters are cached per language and options. */
export function formatDate(date: Date | string | number, options: Intl.DateTimeFormatOptions): string {
  const locale = intlLocale();
  const key = locale + JSON.stringify(options);
  let format = dateFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, options);
    dateFormats.set(key, format);
  }
  return format.format(new Date(date));
}

let preference: LanguagePreference = 'auto';
const listeners = new Set<() => void>();

/** Applies the saved choice (call once at startup). */
export async function loadLanguagePreference(): Promise<void> {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved && (saved === 'auto' || isLanguage(saved))) {
      preference = saved;
      listeners.forEach((l) => l());
      const lng = saved === 'auto' ? deviceLanguage() : saved;
      if (lng !== i18n.language) await i18n.changeLanguage(lng);
    }
  } catch {
    // Storage unavailable: keep the phone's language.
  }
}

/** Saves the choice and switches the app to it. */
export async function setLanguagePreference(next: LanguagePreference): Promise<void> {
  preference = next;
  listeners.forEach((l) => l());
  try {
    await AsyncStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Not saved: it still applies until the app closes.
  }
  await i18n.changeLanguage(next === 'auto' ? deviceLanguage() : next);
}

/** The saved choice ('auto' or a language), for the language picker. */
export function useLanguagePreference(): LanguagePreference {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    () => preference,
  );
}
