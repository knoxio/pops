/** Map ISO 639-1 language codes to full language names. */
const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
  ru: "Russian",
  ar: "Arabic",
  hi: "Hindi",
  sv: "Swedish",
  da: "Danish",
  no: "Norwegian",
  fi: "Finnish",
  nl: "Dutch",
  pl: "Polish",
  tr: "Turkish",
  th: "Thai",
  cs: "Czech",
  el: "Greek",
  he: "Hebrew",
  hu: "Hungarian",
  id: "Indonesian",
  ms: "Malay",
  ro: "Romanian",
  uk: "Ukrainian",
  vi: "Vietnamese",
  tl: "Tagalog",
  cn: "Cantonese",
};

/** Convert an ISO 639-1 code to a full language name, falling back to uppercase code. */
export function languageName(code: string | null | undefined): string | null {
  if (!code) return null;
  return LANGUAGE_NAMES[code.toLowerCase()] ?? code.toUpperCase();
}

export function formatRuntime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}
