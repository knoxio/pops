/** Map ISO 639-1 language codes to full language names. */
const LANGUAGE_NAMES: Record<string, string> = {
  ab: "Abkhazian", af: "Afrikaans", am: "Amharic", ar: "Arabic",
  az: "Azerbaijani", be: "Belarusian", bg: "Bulgarian", bn: "Bengali",
  bs: "Bosnian", ca: "Catalan", cs: "Czech", cy: "Welsh",
  da: "Danish", de: "German", el: "Greek", en: "English",
  es: "Spanish", et: "Estonian", eu: "Basque", fa: "Persian",
  fi: "Finnish", fr: "French", ga: "Irish", gl: "Galician",
  gu: "Gujarati", he: "Hebrew", hi: "Hindi", hr: "Croatian",
  hu: "Hungarian", hy: "Armenian", id: "Indonesian", is: "Icelandic",
  it: "Italian", ja: "Japanese", ka: "Georgian", kk: "Kazakh",
  km: "Khmer", kn: "Kannada", ko: "Korean", ku: "Kurdish",
  ky: "Kyrgyz", la: "Latin", lb: "Luxembourgish", lo: "Lao",
  lt: "Lithuanian", lv: "Latvian", mk: "Macedonian", ml: "Malayalam",
  mn: "Mongolian", mr: "Marathi", ms: "Malay", mt: "Maltese",
  my: "Burmese", nb: "Norwegian Bokmål", ne: "Nepali", nl: "Dutch",
  no: "Norwegian", pa: "Punjabi", pl: "Polish", ps: "Pashto",
  pt: "Portuguese", ro: "Romanian", ru: "Russian", si: "Sinhala",
  sk: "Slovak", sl: "Slovenian", so: "Somali", sq: "Albanian",
  sr: "Serbian", sv: "Swedish", sw: "Swahili", ta: "Tamil",
  te: "Telugu", tg: "Tajik", th: "Thai", tl: "Tagalog",
  tr: "Turkish", uk: "Ukrainian", ur: "Urdu", uz: "Uzbek",
  vi: "Vietnamese", wo: "Wolof", zh: "Chinese", zu: "Zulu",
  cn: "Cantonese",
};

/**
 * Convert an ISO 639-1 language code to its full name.
 * Returns the uppercased code if no mapping exists.
 */
export function formatLanguage(code: string): string {
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
