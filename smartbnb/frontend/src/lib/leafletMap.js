import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Free OpenStreetMap tiles, no API key needed. They are muted in CSS
// (.muted-tiles) so the price colours stand out.
const TILES_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const VAUD_CENTER = [46.6, 6.6];

/**
 * Creates a Leaflet map centred on the Vaud canton with the base tile layer
 * @param {HTMLElement} el
 * @param {{ zoom?: number }} [options]
 * @returns {L.Map}
 */
export function createBaseMap(el, { zoom = 9 } = {}) {
  const map = L.map(el, {
    center: VAUD_CENTER,
    zoom,
    zoomControl: true,
    scrollWheelZoom: false,
    preferCanvas: true,
  });
  L.tileLayer(TILES_URL, {
    attribution: ATTRIBUTION,
    className: "muted-tiles",
    maxZoom: 19,
  }).addTo(map);
  return map;
}

export { L };
