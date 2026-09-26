<template>
  <section id="top-10" class="section">
    <div class="wrap">
      <div class="section-head">
        <h2>Top 10 stays right now</h2>
        <p>Rankings among listings active in the latest data. Pick a list, hover a stay to find it on the map, click to open it on Airbnb. "Cheapest" only counts stays you can book for less than a month.</p>
      </div>

      <div class="tabs" role="tablist" aria-label="Top 10 lists">
        <button
          v-for="t in TABS"
          :key="t.key"
          role="tab"
          type="button"
          class="tab"
          :aria-selected="activeTab === t.key"
          @click="switchTab(t.key)"
        >
          {{ t.label }}
        </button>
      </div>

      <div class="top-grid">
        <div class="list-col">
          <p v-if="error" class="state state-error">{{ error }}</p>
          <p v-else-if="loading" class="state">Loading the rankings…</p>
          <ol v-else class="top10">
            <li
              v-for="(item, i) in currentList"
              :key="`${activeTab}-${item.id}`"
              :class="{ active: item.id === hoveredId }"
              @mouseenter="handleHover(item.id)"
              @mouseleave="handleHover(null)"
            >
              <a :href="listingUrl(item.id)" target="_blank" rel="noopener" @focus="handleHover(item.id)" @blur="handleHover(null)">
                <span class="rank">{{ i + 1 }}</span>
                <span class="info">
                  <span class="title">{{ item.title }}</span>
                  <span class="meta">
                    {{ item.city }}, {{ roomTypeLabel(item.type) }}
                    <span v-if="item.longStay" class="stay-badge">{{ minStayLabel(item.minNights) }}</span>
                  </span>
                </span>
                <span class="metric">{{ metric(item) }}</span>
              </a>
            </li>
          </ol>
        </div>

        <div class="map-col">
          <div ref="mapEl" class="map"></div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { createBaseMap, fitToBounds, L } from "../lib/leafletMap";
import { apiGet } from "../lib/api";
import { formatCHF, isNum, roomTypeLabel } from "../lib/format";

const TABS = [
  { key: "rating", label: "Best rated" },
  { key: "price", label: "Cheapest" },
  { key: "reviews", label: "Most reviewed this year" },
];

const mapEl = ref(null);
let map;
const hoveredId = ref(null);
const markers = new Map(); // id -> Marker

const loading = ref(true);
const error = ref("");

const lists = reactive({ rating: [], price: [], reviews: [] });
const activeTab = ref("rating");
const currentList = computed(() => lists[activeTab.value]);

const toNumberOrNull = (v) => (isNum(v) ? Number(v) : null);
const listingUrl = (id) => `https://www.airbnb.ch/rooms/${id}`;

function metric(item) {
  if (activeTab.value === "price") return formatCHF(item.price) ?? "No price";
  if (activeTab.value === "reviews") return item.reviews != null ? `${item.reviews} reviews` : "";
  return isNum(item.rating) ? `${item.rating.toFixed(2)} ★` : "";
}

/** 90 -> "Min. 3 months", 45 -> "Min. 45 nights" */
function minStayLabel(nights) {
  const months = Math.round(nights / 30);
  if (nights % 30 === 0 || nights >= 60) return `Min. ${months} month${months > 1 ? "s" : ""}`;
  return `Min. ${nights} nights`;
}

function mapListing(l) {
  return {
    id: l.id,
    title: l.name ?? "Untitled listing",
    city: l.neighborhood ?? "Vaud",
    type: l.room_type,
    rating: toNumberOrNull(l.rating),
    price: toNumberOrNull(l.price),
    reviews: toNumberOrNull(l.number_of_reviews_ltm),
    minNights: toNumberOrNull(l.minimum_nights),
    longStay: l.long_stay === true,
    lat: toNumberOrNull(l.latitude),
    lng: toNumberOrNull(l.longitude),
  };
}

async function fetchTop10(sort) {
  const res = await apiGet("/listings", { sort, limit: 10 });
  return Array.isArray(res) ? res.map(mapListing) : [];
}

async function loadTopLists() {
  try {
    const [rating, price, reviews] = await Promise.all([
      fetchTop10("rating_desc"),
      fetchTop10("price_asc"),
      fetchTop10("most_booked"),
    ]);
    Object.assign(lists, { rating, price, reviews });
    drawMarkers(currentList.value);
  } catch (e) {
    console.error(e);
    error.value = "The rankings couldn't load. Reload the page to try again.";
  } finally {
    loading.value = false;
  }
}

function markerIcon(rank, active) {
  return L.divIcon({
    html: `<span>${rank}</span>`,
    className: `rank-pin${active ? " is-active" : ""}`,
    iconSize: [28, 28],
  });
}
function clearMarkers() {
  markers.forEach((m) => m.remove());
  markers.clear();
}
function drawMarkers(list) {
  clearMarkers();
  const bounds = L.latLngBounds([]);
  list.forEach((item, i) => {
    if (!isNum(item.lat) || !isNum(item.lng)) return;
    const pos = [item.lat, item.lng];
    bounds.extend(pos);
    const marker = L.marker(pos, { icon: markerIcon(i + 1, false), title: item.title, riseOnHover: true }).addTo(map);
    marker.rank = i + 1;
    markers.set(item.id, marker);
    marker.on("mouseover", () => handleHover(item.id));
    marker.on("mouseout", () => handleHover(null));
    marker.on("click", () => window.open(listingUrl(item.id), "_blank", "noopener"));
  });
  fitToBounds(map, bounds, { padding: [40, 40], maxZoom: 12 });
}
function handleHover(id) {
  hoveredId.value = id;
  markers.forEach((marker, key) => {
    const active = key === id;
    marker.setIcon(markerIcon(marker.rank, active));
    marker.setZIndexOffset(active ? 1000 : 0);
  });
}
function switchTab(tab) {
  if (tab === activeTab.value) return;
  activeTab.value = tab;
  if (map) drawMarkers(currentList.value);
}

onMounted(async () => {
  map = createBaseMap(mapEl.value, { zoom: 10 });
  await loadTopLists();
});
</script>

<style scoped>
.tabs {
  display: inline-flex;
  padding: 4px;
  gap: 4px;
  background: var(--paper-2);
  border-radius: 12px;
  margin-bottom: 20px;
  max-width: 100%;
  overflow-x: auto;
}
.tab {
  border: 0;
  background: transparent;
  padding: 9px 16px;
  border-radius: 9px;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--ink-2);
  cursor: pointer;
  white-space: nowrap;
}
.tab:hover { color: var(--ink); }
.tab[aria-selected="true"] { background: var(--surface); color: var(--ink); box-shadow: 0 1px 3px rgba(28, 43, 42, 0.18); }

.top-grid {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
  gap: 32px;
  align-items: stretch;
}

.state { color: var(--ink-2); padding: 16px 0; margin: 0; }
.state-error { color: #7A2A1C; }

.top10 { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }
.top10 li { border-bottom: 1px solid var(--line); }
.top10 a {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto;
  gap: 14px;
  align-items: center;
  padding: 12px 8px;
  text-decoration: none;
  border-radius: 10px;
}
.top10 li.active a { background: var(--surface); }
.rank { font-size: 1.25rem; font-weight: 800; color: var(--ink-3); text-align: right; }
.top10 li.active .rank { color: var(--lake); }
.info { display: grid; min-width: 0; }
.title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.meta { color: var(--ink-2); font-size: 0.9rem; }
.stay-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--paper-2);
  color: var(--ink);
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
}
.metric { font-weight: 700; white-space: nowrap; }

.map-col { position: relative; }
.map {
  position: sticky;
  top: 88px;
  width: 100%;
  height: 560px;
  border-radius: 20px;
  border: 1px solid var(--line);
  overflow: hidden;
  isolation: isolate;
}

:deep(.rank-pin) span {
  display: grid; place-items: center;
  width: 100%; height: 100%;
  border-radius: 50%;
  background: var(--ink);
  color: #fff;
  font-weight: 700;
  font-size: 0.8rem;
  border: 2px solid #fff;
  box-shadow: 0 2px 6px rgba(28, 43, 42, 0.35);
  transition: transform 120ms ease, background 120ms ease;
}
:deep(.rank-pin.is-active) span { background: var(--lake); transform: scale(1.25); }

@media (max-width: 960px) {
  .top-grid { grid-template-columns: 1fr; }
  .map { height: 360px; }
  .map { position: relative; top: 0; }
}
@media (prefers-reduced-motion: reduce) {
  :deep(.rank-pin) span { transition: none; }
}
</style>
