import { ref } from "vue";

// One JSON file per language in src/locales: adding a language is adding a file.
// English is the source of truth; a key missing in another language falls back to it.
const files = import.meta.glob("./locales/*.json", { eager: true, import: "default" });
export const MESSAGES = Object.fromEntries(
  Object.entries(files).map(([path, messages]) => [path.match(/(\w+)\.json$/)[1], messages])
);
export const SUPPORTED = Object.keys(MESSAGES);
export const DEFAULT_LOCALE = "en";
const STORAGE_KEY = "smartbnb.lang";

/**
 * Language to show: a remembered manual choice first, then the first browser
 * language we support ("fr-CH" -> "fr"), then English
 * @param {readonly string[]} languages navigator.languages
 * @param {string|null} stored
 * @returns {string}
 */
export function detectLocale(languages = [], stored = null) {
  if (SUPPORTED.includes(stored)) return stored;
  for (const lang of languages) {
    const base = String(lang).toLowerCase().split("-")[0];
    if (SUPPORTED.includes(base)) return base;
  }
  return DEFAULT_LOCALE;
}

// Storage can be missing or blocked (private mode, tests): the choice then lasts the visit
function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function browserLanguages() {
  if (typeof navigator === "undefined") return [];
  return navigator.languages?.length ? navigator.languages : [navigator.language].filter(Boolean);
}

export const locale = ref(detectLocale(browserLanguages(), readStored()));

const lookup = (messages, key) => key.split(".").reduce((node, k) => (node == null ? undefined : node[k]), messages);

/**
 * Translated text for a dotted key, with {name} placeholders filled from params.
 * A message with "one" / "other" forms is picked by params.count.
 * @param {string} key
 * @param {Record<string, unknown>} [params]
 * @returns {string}
 */
export function t(key, params = {}) {
  let msg = lookup(MESSAGES[locale.value], key) ?? lookup(MESSAGES[DEFAULT_LOCALE], key);
  if (msg === undefined) return key;
  if (typeof msg === "object") {
    msg = msg[new Intl.PluralRules(locale.value).select(Number(params.count))] ?? msg.other;
  }
  return String(msg).replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

/** Intl locale for dates and numbers, e.g. "fr-CH" */
export const intlLocale = () => t("locale.intl");

/** Keeps <html lang> and the tab title in step with the language */
export function applyLocaleToDocument() {
  document.documentElement.lang = locale.value;
  document.title = t("page.title");
}

/**
 * Switches the language at once and remembers the choice for the next visits
 * @param {string} lang
 */
export function setLocale(lang) {
  if (!SUPPORTED.includes(lang)) return;
  locale.value = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Not stored: the language still applies until the page is closed
  }
  applyLocaleToDocument();
}
