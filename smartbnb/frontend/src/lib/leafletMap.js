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

/**
 * Frames the map on the given bounds and keeps it framed while the container
 * settles, until the visitor moves the map themselves.
 *
 * Leaflet caches the container size. If it was read while the map was still
 * 0px tall or wide (mobile Safari does this during the first layout), fitBounds
 * computes an infinite zoom and lands on the max zoom, at street level. So we
 * always re-read the size before fitting, cap the zoom, and refit on resize.
 * @param {L.Map} map
 * @param {L.LatLngBounds} bounds
 * @param {{ padding?: [number, number], maxZoom?: number }} [options]
 */
export function fitToBounds(map, bounds, { padding = [20, 20], maxZoom = 12 } = {}) {
  map._fitObserver?.disconnect();
  if (!bounds.isValid()) return;

  const el = map.getContainer();
  const fit = () => {
    map.invalidateSize();
    if (el.clientWidth && el.clientHeight) map.fitBounds(bounds, { padding, maxZoom });
  };
  fit();

  const observer = new ResizeObserver(fit);
  observer.observe(el);
  map._fitObserver = observer;
  const stop = () => {
    observer.disconnect();
    ["pointerdown", "touchstart", "wheel"].forEach((ev) => el.removeEventListener(ev, stop));
  };
  ["pointerdown", "touchstart", "wheel"].forEach((ev) => el.addEventListener(ev, stop, { passive: true }));
}

export { L };
