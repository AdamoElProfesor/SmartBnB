<template>
  <section id="price-map" class="section">
    <div class="wrap">
      <div class="section-head">
        <h2>Where stays cost more</h2>
        <p>
          Every active listing in canton Vaud, coloured by its nightly price. Circles group nearby
          listings and show their median price in CHF. Zoom in to see single stays.
        </p>
      </div>

      <div class="map-frame">
        <div ref="mapEl" class="map-canvas" />
        <div v-if="loading" class="overlay">Loading the map…</div>
        <div v-else-if="error" class="overlay overlay-error">{{ error }}</div>

        <div v-if="!loading && !error" class="legend">
          <span>{{ minPriceText }}</span>
          <span class="legend-bar" :style="{ background: PRICE_GRADIENT }"></span>
          <span>{{ maxPriceText }}+</span>
          <span class="legend-label">a night</span>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, onMounted, computed } from "vue";
import { createBaseMap, fitToBounds, L } from "../lib/leafletMap";
import { apiGet } from "../lib/api";
import { formatCHF, priceColor, PRICE_GRADIENT } from "../lib/format";
import { median } from "../lib/stats";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";

const mapEl = ref(null);
const loading = ref(true);
const error = ref("");

let map;

const points = ref([]); // [{ lat, lng, price }]
const priceMin = ref(null);
const priceMax = ref(null);

const minPriceText = computed(() => formatCHF(priceMin.value) ?? "");
const maxPriceText = computed(() => formatCHF(priceMax.value) ?? "");

function tFromPrice(p) {
  const min = priceMin.value ?? 0;
  const max = priceMax.value ?? 1;
  if (!(max > min)) return 0.5;
  return (p - min) / (max - min);
}

function clusterIcon(cluster) {
  const prices = cluster.getAllChildMarkers().map((m) => m.options.price).filter(Number.isFinite);
  const med = median(prices);
  const count = cluster.getChildCount();
  const size = Math.round(34 + Math.min(26, Math.log2(count + 1) * 4));
  return L.divIcon({
    html: `<span style="background:${priceColor(tFromPrice(med), 0.9)}">${Math.round(med)}</span>`,
    className: "price-cluster",
    iconSize: [size, size],
  });
}

async function fetchPoints() {
  const res = await apiGet("/heatmap");
  if (!Array.isArray(res?.points)) throw new Error("Unexpected payload");

  const min = Number(res?.meta?.normalization?.min);
  const max = Number(res?.meta?.normalization?.max);
  priceMin.value = Number.isFinite(min) ? min : null;
  priceMax.value = Number.isFinite(max) ? max : null;

  points.value = res.points
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Number.isFinite(p.price))
    .map((p) => ({ lat: +p.lat, lng: +p.lng, price: +p.price }));

  if (!points.value.length) throw new Error("No points");
}

onMounted(async () => {
  try {
    map = createBaseMap(mapEl.value, { zoom: 9 });
    await fetchPoints();

    const bounds = L.latLngBounds(points.value.map((p) => [p.lat, p.lng]));
    fitToBounds(map, bounds, { padding: [20, 20], maxZoom: 11 });

    const clusters = L.markerClusterGroup({
      maxClusterRadius: 70,
      showCoverageOnHover: false,
      chunkedLoading: true,
      iconCreateFunction: clusterIcon,
    });
    clusters.addLayers(
      points.value.map((p) =>
        L.circleMarker([p.lat, p.lng], {
          radius: 6,
          color: "#fff",
          weight: 1.5,
          fillColor: priceColor(tFromPrice(p.price)),
          fillOpacity: 1,
          price: p.price,
        }).bindTooltip(`${formatCHF(p.price)} a night`)
      )
    );
    map.addLayer(clusters);
  } catch (e) {
    console.error(e);
    error.value = "The price map couldn't load. Reload the page to try again.";
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.map-frame {
  position: relative;
  border-radius: 20px;
  overflow: hidden;
  border: 1px solid var(--line);
  isolation: isolate;
}
.map-canvas { width: 100%; height: min(640px, 72vh); }

.overlay {
  position: absolute; inset: 0; z-index: 500;
  display: grid; place-items: center;
  background: rgba(242, 244, 239, 0.75);
  font-weight: 600;
}
.overlay-error { color: #7A2A1C; }

.legend {
  position: absolute; left: 16px; bottom: 16px; z-index: 500;
  display: grid; grid-template-columns: auto 160px auto; align-items: center; gap: 4px 10px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.94);
  border-radius: 12px;
  box-shadow: 0 6px 20px -10px rgba(28, 43, 42, 0.4);
  font-size: 0.85rem;

}
.legend-bar { height: 8px; border-radius: 99px; }
.legend-label { grid-column: 2; text-align: center; color: var(--ink-2); font-size: 0.8rem; }

/* Leaflet cluster icons are created outside this component's scope */
:deep(.price-cluster) span {
  display: grid; place-items: center;
  width: 100%; height: 100%;
  border-radius: 50%;
  border: 2px solid #fff;
  color: #fff;
  font-weight: 700;
  font-size: 0.8rem;

  box-shadow: 0 2px 8px rgba(28, 43, 42, 0.3);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
}

@media (max-width: 520px) {
  .map-canvas { height: 60vh; }
  .legend { grid-template-columns: auto 90px auto; left: 10px; bottom: 10px; }
}
</style>
