<template>
  <section id="evaluate" class="evaluator">
    <div class="wrap ev-grid">
      <div class="ev-intro">
        <h1>Is this Airbnb a&nbsp;good&nbsp;deal?</h1>
        <p class="lede">
          Paste a listing from canton Vaud. SmartBnB compares its nightly price,
          reviews and amenities with similar stays in the same area.
        </p>

        <form class="ev-form" @submit.prevent="evaluate()">
          <label for="listing-url" class="sr-only">Airbnb listing link</label>
          <input
            id="listing-url"
            v-model.trim="url"
            type="text"
            inputmode="url"
            autocomplete="off"
            spellcheck="false"
            placeholder="https://www.airbnb.ch/rooms/…"
            required
          />
          <button class="btn-primary" :disabled="loading">
            {{ loading ? "Checking…" : "Check listing" }}
          </button>
        </form>
        <div class="ev-links">
          <button type="button" class="link-btn" :disabled="loading" @click="evaluate(EXAMPLE_URL)">
            Try it with a listing in Montreux
          </button>
          <DemoVideo />
        </div>

        <p v-if="error" class="ev-error" role="alert">{{ error }}</p>
      </div>

      <!-- Result -->
      <article v-if="result" class="panel result" aria-live="polite" :style="{ '--accent': verdict.color }">
        <header class="res-head">
          <h2 class="res-title">{{ listing.name }}</h2>
          <p class="res-sub">
            {{ capitalize(roomTypeLabel(listing.room_type)) }} in {{ listing.neighborhood }},
            {{ listing.accommodates }} guests
          </p>
        </header>

        <div class="verdict">
          <p class="score"><span class="score-num">{{ shownScore }}</span><span class="score-max">/100</span></p>
          <div>
            <p class="verdict-word">{{ verdict.word }}</p>
            <p class="verdict-note">{{ verdict.note }}</p>
          </div>
        </div>

        <div v-if="price" class="price-rule">
          <p class="rule-caption">
            <strong>{{ formatCHF(listing.price) }}</strong> a night, {{ price.sentence }}
          </p>
          <div class="rule" role="img" :aria-label="`Listing ${formatCHF(listing.price)}, median ${formatCHF(listing.median_price)}`">
            <div class="rule-track"></div>
            <div class="rule-median" :style="{ left: price.medianPos + '%' }">
              <span>median {{ formatCHF(listing.median_price) }}</span>
            </div>
            <div class="rule-dot" :style="{ left: price.listingPos + '%' }"></div>
          </div>
          <p v-if="listing.price_date" class="fine">Price seen on {{ formatDate(listing.price_date) }}.</p>
        </div>
        <p v-else class="fine">No recent price for this listing, so the price part of the score is neutral.</p>

        <dl class="facts">
          <div>
            <dt>Rating</dt>
            <dd>{{ isNum(listing.rating) ? Number(listing.rating).toFixed(2) : "No rating" }}</dd>
            <dd v-if="isNum(listing.neighborhood_avg_rating)" class="fact-ref">area {{ Number(listing.neighborhood_avg_rating).toFixed(2) }}</dd>
          </div>
          <div>
            <dt>Reviews a month</dt>
            <dd>{{ isNum(listing.reviews_per_month) ? Number(listing.reviews_per_month).toFixed(1) : "None" }}</dd>
            <dd v-if="isNum(listing.neighborhood_avg_reviews_per_month)" class="fact-ref">area {{ Number(listing.neighborhood_avg_reviews_per_month).toFixed(1) }}</dd>
          </div>
          <div>
            <dt>Superhost</dt>
            <dd>{{ listing.host_is_superhost ? "Yes" : "No" }}</dd>
          </div>
        </dl>

        <div class="amenities">
          <h3>Key amenities</h3>
          <ul>
            <li v-for="a in listing.amenities || []" :key="'y' + a" class="has">{{ amenityLabel(a) }}</li>
            <li v-for="a in listing.missing_amenities || []" :key="'n' + a" class="missing">
              <span class="sr-only">Missing: </span>{{ amenityLabel(a) }}
            </li>
          </ul>
        </div>

        <a class="res-link" :href="`https://www.airbnb.ch/rooms/${result.listing_id}`" target="_blank" rel="noopener">
          Open this listing on Airbnb
        </a>
      </article>

      <!-- Before any check: explain the score instead of showing fake data -->
      <aside v-else class="panel how">
        <h2>How the score works</h2>
        <p>Each listing gets a score out of 100, built from four parts:</p>
        <ul class="weights">
          <li v-for="w in WEIGHTS" :key="w.label">
            <span class="w-bar" :style="{ width: w.pct * 2 + '%' }"></span>
            <span class="w-pct">{{ w.pct }}%</span>
            <span class="w-label">{{ w.label }}</span>
          </li>
        </ul>
        <p class="fine">
          Based on public InsideAirbnb data. Listings are compared with the same room type in the same neighbourhood.
        </p>
      </aside>

      <!-- AI read of the listing: fills the column under the form while the result card is tall -->
      <section v-if="result && hasAnalysis" class="analysis" aria-labelledby="analysis-title">
        <h2 id="analysis-title">What stands out</h2>
        <p v-if="summary" class="analysis-summary">{{ summary }}</p>
        <div class="analysis-cols">
          <div v-if="pros.length">
            <h3>Strengths</h3>
            <ul>
              <li v-for="(t, i) in pros" :key="'p' + i" class="pro">{{ t }}</li>
            </ul>
          </div>
          <div v-if="cons.length">
            <h3>Watch out for</h3>
            <ul>
              <li v-for="(t, i) in cons" :key="'c' + i" class="con">{{ t }}</li>
            </ul>
          </div>
        </div>
        <p class="fine">Written by an AI model from this listing's numbers. It can make mistakes.</p>
      </section>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { apiPost } from "../lib/api";
import { formatCHF, isNum, amenityLabel, roomTypeLabel } from "../lib/format";
import DemoVideo from "./DemoVideo.vue";

const EXAMPLE_URL = "https://www.airbnb.ch/rooms/53584592";
const WEIGHTS = [
  { pct: 45, label: "Price against similar stays nearby" },
  { pct: 30, label: "Review activity against the area" },
  { pct: 15, label: "Key amenities" },
  { pct: 10, label: "Superhost" },
];

const url = ref("");
const loading = ref(false);
const error = ref("");
const result = ref(null);
const shownScore = ref(0);

const listing = computed(() => result.value?.listing || {});
const pros = computed(() => result.value?.analysis?.pros || []);
const cons = computed(() => result.value?.analysis?.cons || []);
const summary = computed(() => result.value?.analysis?.summary || "");
const hasAnalysis = computed(() => pros.value.length > 0 || cons.value.length > 0 || !!summary.value);

const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const formatDate = (d) =>
  new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

const verdict = computed(() => {
  const s = Number(result.value?.smart_score ?? 0);
  if (s >= 70) return { word: "Worth booking", note: "Better value than most comparable stays.", color: "var(--good)" };
  if (s >= 50) return { word: "Fair deal", note: "In line with what the area offers.", color: "var(--mid)" };
  return { word: "Look around", note: "Similar stays nearby offer more for the money.", color: "var(--bad)" };
});

const price = computed(() => {
  const p = Number(listing.value.price);
  const m = Number(listing.value.median_price);
  if (!isNum(listing.value.price) || !isNum(listing.value.median_price) || m <= 0) return null;
  const max = Math.max(p, m) * 1.6;
  const diff = Math.round(((p - m) / m) * 100);
  const where = `for a ${roomTypeLabel(listing.value.room_type)} in ${listing.value.neighborhood}`;
  const sentence =
    Math.abs(diff) < 3
      ? `right at the median ${where}.`
      : `${Math.abs(diff)}% ${diff < 0 ? "below" : "above"} the median ${where}.`;
  return { medianPos: (m / max) * 100, listingPos: Math.min(100, (p / max) * 100), sentence };
});

// One orchestrated moment: the score counts up when a result arrives.
watch(result, (r) => {
  const target = Number(r?.smart_score ?? 0);
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return (shownScore.value = target);
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / 700);
    shownScore.value = Math.round(target * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
});

async function evaluate(fromUrl) {
  if (fromUrl) url.value = fromUrl;
  if (!url.value) return;
  loading.value = true;
  error.value = "";
  try {
    const data = await apiPost("/score", { airbnbUrl: url.value });
    if (!data?.ok) throw new Error("Evaluation failed");
    result.value = data;
  } catch (e) {
    console.error(e);
    error.value =
      e.status === 404
        ? "This listing isn't in our data. SmartBnB only covers listings in canton Vaud that InsideAirbnb has recorded."
        : e.status === 400
        ? "That link doesn't look like an Airbnb listing. It should contain /rooms/ followed by a number."
        : e.status === 429
        ? "You've checked a lot of listings in a short time. Wait a little and try again."
        : "The check didn't go through. Try again in a moment.";
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.evaluator { padding: 72px 0 96px; }
.ev-grid {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
  grid-template-rows: auto 1fr;
  grid-template-areas:
    "intro panel"
    "analysis panel";
  column-gap: 64px;
  align-items: start;
}
.ev-intro { grid-area: intro; }
.ev-grid > .panel { grid-area: panel; }
/* Keep the result in view while reading the analysis on the left, when it fits the screen */
@media (min-height: 860px) {
  .ev-grid > .result { position: sticky; top: 88px; }
}
.ev-grid > .analysis { grid-area: analysis; }

h1 {
  font-size: clamp(2.6rem, 5.4vw, 4.4rem);
  line-height: 1;
  letter-spacing: -0.035em;
  font-weight: 800;
  margin: 0 0 24px;
  max-width: 11ch;
}
.lede { font-size: 1.15rem; color: var(--ink-2); max-width: 44ch; margin: 0 0 32px; }

.ev-form {
  display: flex;
  background: var(--surface);
  border: 1.5px solid var(--ink);
  border-radius: 14px;
  padding: 6px;
  gap: 6px;
  max-width: 560px;
}
.ev-form:focus-within { box-shadow: 0 0 0 4px var(--lake-tint); }
.ev-form input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  font: inherit;
  font-size: 1rem;
  padding: 12px 12px;
  color: var(--ink);
}
.ev-form input:focus { outline: none; }
.ev-form input::placeholder { color: var(--ink-3); }

.ev-links { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 28px; margin-top: 14px; }
.link-btn {
  background: none;
  border: 0;
  padding: 4px 0;
  font: inherit;
  color: var(--lake);
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}
.link-btn:hover { color: var(--ink); }

.ev-error {
  margin: 20px 0 0;
  padding: 12px 14px;
  max-width: 560px;
  border-left: 3px solid var(--bad);
  background: #F7E6E1;
  color: #7A2A1C;
  border-radius: 0 8px 8px 0;
}

/* Panels */
.panel {
  background: var(--surface);
  border-radius: 20px;
  padding: 32px;
  box-shadow: 0 1px 0 var(--line), 0 24px 48px -28px rgba(28, 43, 42, 0.35);
}
.how h2 { font-size: 1.35rem; margin: 0 0 8px; letter-spacing: -0.01em; }
.how > p { color: var(--ink-2); margin: 0 0 20px; }
.weights { list-style: none; margin: 0 0 20px; padding: 0; display: grid; gap: 14px; }
.weights li {
  display: grid;
  grid-template-columns: 90px 44px 1fr;
  align-items: center;
  gap: 12px;
}
.w-bar { height: 10px; border-radius: 99px; background: var(--lake); justify-self: start; max-width: 100%; }
.w-pct { font-weight: 700; }
.w-label { color: var(--ink-2); }

/* Result */
.res-title { font-size: 1.3rem; line-height: 1.25; margin: 0; letter-spacing: -0.01em; }
.res-sub { margin: 4px 0 0; color: var(--ink-2); }

.verdict {
  display: flex;
  align-items: center;
  gap: 24px;
  margin: 28px 0;
  padding: 20px 0;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}
.score { margin: 0; line-height: 0.85; white-space: nowrap; }
.score-num {
  font-size: 5.5rem;
  font-weight: 800;
  letter-spacing: -0.05em;
  color: var(--accent);

}
.score-max { font-size: 1.2rem; font-weight: 600; color: var(--ink-3); margin-left: 4px; }
.verdict-word { font-size: 1.6rem; font-weight: 800; margin: 0; letter-spacing: -0.02em; }
.verdict-note { margin: 4px 0 0; color: var(--ink-2); }

.price-rule { margin-bottom: 28px; }
.rule-caption { margin: 0 0 18px; }
.rule { position: relative; height: 44px; }
.rule-track {
  position: absolute; left: 0; right: 0; top: 10px; height: 6px; border-radius: 99px;
  background: var(--paper-2);
}
.rule-median {
  position: absolute; top: 3px; height: 20px; width: 2px; background: var(--ink); transform: translateX(-1px);
}
.rule-median span {
  position: absolute; top: 24px; left: 50%; transform: translateX(-50%);
  font-size: 0.8rem; color: var(--ink-2); white-space: nowrap;
}
.rule-dot {
  position: absolute; top: 5px; width: 16px; height: 16px; margin-left: -8px;
  border-radius: 50%; background: var(--accent); border: 3px solid var(--surface);
  box-shadow: 0 0 0 1.5px var(--accent);
  animation: slide-in 700ms cubic-bezier(.2, .8, .2, 1) both;
}
@keyframes slide-in { from { left: 0; } }

.fine { font-size: 0.85rem; color: var(--ink-3); margin: 8px 0 0; }

.facts {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin: 0 0 28px;
}
.facts dt { font-size: 0.85rem; color: var(--ink-2); }
.facts dd { margin: 2px 0 0; font-size: 1.35rem; font-weight: 700; }
.facts dd.fact-ref { font-size: 0.85rem; font-weight: 500; color: var(--ink-3); }

.amenities h3 { font-size: 0.95rem; margin: 0 0 10px; }
.amenities ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
.amenities li { padding: 5px 12px; border-radius: 99px; font-size: 0.9rem; }
.amenities .has { background: var(--lake-tint); color: #1F4E66; }
.amenities .missing { color: var(--ink-3); text-decoration: line-through; box-shadow: inset 0 0 0 1px var(--line); }

/* AI analysis, left column */
.analysis { margin-top: 48px; max-width: 560px; }
.analysis h2 { font-size: 1.35rem; margin: 0 0 8px; letter-spacing: -0.01em; }
.analysis-summary { font-size: 1.05rem; color: var(--ink-2); margin: 0 0 24px; }
.analysis-cols { display: grid; gap: 24px; }
.analysis h3 { font-size: 0.95rem; margin: 0 0 10px; }
.analysis ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
.analysis li { padding: 10px 14px 10px 16px; border-radius: 10px; border-left: 3px solid; }
.analysis .pro { background: #E4EFE1; border-color: var(--good); }
.analysis .con { background: #F8EEDC; border-color: var(--mid); }
.analysis .fine { margin-top: 16px; }

.res-link {
  display: inline-block;
  margin-top: 28px;
  color: var(--lake);
  font-weight: 600;
  text-underline-offset: 3px;
}

@media (max-width: 960px) {
  .ev-grid {
    grid-template-columns: 1fr;
    grid-template-rows: none;
    grid-template-areas: "intro" "panel" "analysis";
    gap: 40px;
  }
  .analysis { margin-top: 0; }
  .ev-grid > .result { position: static; }
  .evaluator { padding: 40px 0 64px; }
}
@media (max-width: 520px) {
  .panel { padding: 22px; }
  .ev-form { flex-direction: column; }
  .score-num { font-size: 4.2rem; }
  .verdict { flex-direction: column; align-items: flex-start; gap: 12px; }
  .facts { grid-template-columns: 1fr 1fr; }
  .weights li { grid-template-columns: 60px 40px 1fr; }
}
@media (prefers-reduced-motion: reduce) {
  .rule-dot { animation: none; }
}
</style>
