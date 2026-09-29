import { intlLocale, t } from "../i18n";

// Intl formatters are costly to build: one per locale and options
const formatters = new Map();
function numberFormat(locale, options) {
  const key = `${locale}|${JSON.stringify(options)}`;
  if (!formatters.has(key)) formatters.set(key, new Intl.NumberFormat(locale, options));
  return formatters.get(key);
}

/** "CHF 144" in English, "144 CHF" in French, or null for missing values */
export function formatCHF(value) {
  const n = Number(value);
  if (value == null || !Number.isFinite(n)) return null;
  return numberFormat(t("locale.money"), { style: "currency", currency: "CHF", maximumFractionDigits: 0 }).format(n);
}

/** 4.9 -> "4.90" in English, "4,90" in French */
export const formatNumber = (value, digits) =>
  numberFormat(intlLocale(), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(value));

/**
 * A calendar day ("2026-09-14") as "14 September 2026" / "14 septembre 2026",
 * the same day in every time zone (it is read and written as UTC)
 */
export const formatDate = (d) =>
  new Date(d).toLocaleDateString(intlLocale(), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export const isNum = (v) => v !== null && v !== "" && Number.isFinite(Number(v));

export const amenityLabel = (code) => {
  const key = `amenity.${code}`;
  const label = t(key);
  return label === key ? code : label;
};

const ROOM_TYPES = {
  "Entire home/apt": "entire",
  "Private room": "private",
  "Shared room": "shared",
  "Hotel room": "hotel",
};
/** "entire home" / "logement entier"; a type we do not know is shown as it comes */
export const roomTypeLabel = (type) =>
  ROOM_TYPES[type] ? t(`roomType.${ROOM_TYPES[type]}`) : type ? type.toLowerCase() : t("roomType.other");
/** "an entire home" / "un logement entier", for sentences */
export const roomTypeWithArticle = (type) => t(`roomTypeWithArticle.${ROOM_TYPES[type] ?? "other"}`);

// Price scale shared by the map and its legend: vineyard green (cheap),
// ochre, road red (expensive).
const STOPS = [
  [63, 122, 58],
  [217, 164, 65],
  [192, 67, 46],
];
export function priceColor(t, alpha = 1) {
  const x = Math.min(1, Math.max(0, t)) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(x));
  const k = x - i;
  const [r, g, b] = STOPS[i].map((c, j) => Math.round(c + (STOPS[i + 1][j] - c) * k));
  return `rgba(${r},${g},${b},${alpha})`;
}
export const PRICE_GRADIENT = "linear-gradient(90deg, rgb(63,122,58), rgb(217,164,65), rgb(192,67,46))";
