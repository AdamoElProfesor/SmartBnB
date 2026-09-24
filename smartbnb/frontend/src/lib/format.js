const chf = new Intl.NumberFormat("de-CH", {
  style: "currency",
  currency: "CHF",
  maximumFractionDigits: 0,
});

/** "CHF 144" or null for missing values */
export function formatCHF(value) {
  const n = Number(value);
  return value == null || !Number.isFinite(n) ? null : chf.format(n);
}

export const isNum = (v) => v !== null && v !== "" && Number.isFinite(Number(v));

const AMENITY_LABELS = {
  WIFI: "Wi-Fi",
  KITCHEN: "Kitchen",
  HEATING: "Heating",
  AC: "Air conditioning",
  PARKING: "Parking",
  WASHER: "Washer",
  DRYER: "Dryer",
  WORKSPACE: "Workspace",
  ENTRANCE: "Private entrance",
  HOTTUB: "Hot tub",
};
export const amenityLabel = (code) => AMENITY_LABELS[code] || code;

const ROOM_TYPES = {
  "Entire home/apt": "entire home",
  "Private room": "private room",
  "Shared room": "shared room",
  "Hotel room": "hotel room",
};
export const roomTypeLabel = (t) => ROOM_TYPES[t] || (t ? t.toLowerCase() : "stay");

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
