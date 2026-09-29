// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { MESSAGES, SUPPORTED, detectLocale, locale, setLocale, t } from "../src/i18n";
import { formatCHF, formatDate, formatNumber, roomTypeLabel } from "../src/lib/format";
import { priceComparison, verdictFor } from "../src/lib/score";

/** "a.b.c" for every text of a messages tree */
const keysOf = (node, prefix = "") =>
  Object.entries(node).flatMap(([k, v]) =>
    typeof v === "object" ? keysOf(v, `${prefix}${k}.`) : [`${prefix}${k}`]
  );

describe("translation files", () => {
  test("English and French are supported", () => {
    expect(SUPPORTED.sort()).toEqual(["en", "fr"]);
  });

  test.each(SUPPORTED.filter((l) => l !== "en"))("%s has exactly the English keys", (lang) => {
    expect(keysOf(MESSAGES[lang]).sort()).toEqual(keysOf(MESSAGES.en).sort());
  });

  test.each(SUPPORTED)("%s keeps the placeholders of the English texts", (lang) => {
    const placeholders = (text) => (text.match(/\{\w+\}/g) || []).sort();
    for (const key of keysOf(MESSAGES.en)) {
      const en = key.split(".").reduce((n, k) => n[k], MESSAGES.en);
      const other = key.split(".").reduce((n, k) => n?.[k], MESSAGES[lang]);
      if (other !== undefined) expect([key, placeholders(other)]).toEqual([key, placeholders(en)]);
    }
  });
});

describe("detectLocale", () => {
  test("takes the first supported browser language", () => {
    expect(detectLocale(["fr-CH", "en"])).toBe("fr");
    expect(detectLocale(["de-CH", "fr", "en"])).toBe("fr");
    expect(detectLocale(["en-US", "fr"])).toBe("en");
  });

  test("falls back to English", () => {
    expect(detectLocale(["de-CH", "it"])).toBe("en");
    expect(detectLocale([])).toBe("en");
  });

  test("a remembered choice wins over the browser, unless it is not supported", () => {
    expect(detectLocale(["fr-CH"], "en")).toBe("en");
    expect(detectLocale(["fr-CH"], "xx")).toBe("fr");
  });
});

describe("t", () => {
  afterEach(() => localStorage.clear());

  test("fills placeholders and picks the plural form", () => {
    expect(t("evaluator.guests", { count: 1 })).toBe("1 guest");
    expect(t("evaluator.guests", { count: 4 })).toBe("4 guests");
    locale.value = "fr";
    expect(t("evaluator.guests", { count: 1 })).toBe("1 voyageur");
    expect(t("evaluator.guests", { count: 4 })).toBe("4 voyageurs");
  });

  test("a key missing in French falls back to English, an unknown key shows itself", () => {
    const saved = MESSAGES.fr.nav.top10;
    delete MESSAGES.fr.nav.top10;
    locale.value = "fr";
    expect(t("nav.top10")).toBe(MESSAGES.en.nav.top10);
    expect(t("nav.nope")).toBe("nav.nope");
    MESSAGES.fr.nav.top10 = saved;
  });

  test("setLocale switches, remembers the choice and updates the page language", () => {
    setLocale("fr");
    expect(locale.value).toBe("fr");
    expect(localStorage.getItem("smartbnb.lang")).toBe("fr");
    expect(document.documentElement.lang).toBe("fr");
    expect(document.title).toMatch(/bonne affaire/);
    setLocale("de");
    expect(locale.value).toBe("fr");
  });
});

describe("French formats and sentences", () => {
  test("numbers, prices and dates", () => {
    locale.value = "fr";
    expect(formatNumber(4.9, 2)).toBe("4,90");
    expect(formatCHF(144.6)).toMatch(/^145\sCHF$/);
    expect(formatDate("2026-09-14")).toBe("14 septembre 2026");
    expect(roomTypeLabel("Entire home/apt")).toBe("logement entier");
  });

  test("price sentence and verdict", () => {
    locale.value = "fr";
    const listing = { price: 80, median_price: 100, room_type: "Private room", neighborhood: "Lausanne" };
    expect(priceComparison(listing).sentence).toBe("20% en dessous de la médiane pour une chambre privée à Lausanne.");
    expect(verdictFor(75).word).toBe("À réserver");
  });
});
