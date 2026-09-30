<template>
  <section id="evaluate" class="evaluator">
    <div class="wrap ev-grid">
      <div class="ev-intro">
        <h1>{{ t("evaluator.title") }}</h1>
        <p class="lede">{{ t("evaluator.lede") }}</p>

        <form class="ev-form" @submit.prevent="evaluate()">
          <label for="listing-url" class="sr-only">{{ t("evaluator.urlLabel") }}</label>
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
            {{ loading ? t("evaluator.checking") : t("evaluator.check") }}
          </button>
        </form>
        <div class="ev-links">
          <button type="button" class="link-btn" :disabled="loading" @click="evaluate(EXAMPLE_URL)">
            {{ t("evaluator.example") }}
          </button>
          <DemoVideo />
        </div>

        <p v-if="error" class="ev-error" role="alert">{{ error }}</p>
      </div>

      <!-- Result -->
      <article v-if="result" ref="resultEl" class="panel result" aria-live="polite" :style="{ '--accent': verdict.color }">
        <header class="res-head">
          <h2 class="res-title">{{ listing.name }}</h2>
          <p class="res-sub">
            {{
              t("evaluator.resultSub", {
                type: capitalize(roomTypeLabel(listing.room_type)),
                place: listing.neighborhood || "Vaud",
                guests: t("evaluator.guests", { count: listing.accommodates }),
              })
            }}
          </p>
        </header>

        <!-- A listing no longer on Airbnb is not scored: there is nothing to book -->
        <div v-if="gone" class="gone" role="status">
          <p class="gone-title">{{ t("evaluator.goneTitle") }}</p>
          <p class="gone-text">
            {{ result.last_seen ? t("evaluator.goneText", { date: formatDate(result.last_seen) }) : t("evaluator.goneTextNoDate") }}
          </p>
        </div>

        <template v-else>
          <div class="verdict">
            <p class="score"><span class="score-num">{{ shownScore }}</span><span class="score-max">/100</span></p>
            <div>
              <p class="verdict-word">{{ verdict.word }}</p>
              <p class="verdict-note">{{ verdict.note }}</p>
            </div>
          </div>

          <!-- What each part of the score gave, and why -->
          <div v-if="parts.length" class="parts">
            <h3>{{ t("evaluator.whyTitle", { score: result.smart_score }) }}</h3>
            <ul>
              <li v-for="p in parts" :key="p.key" :class="{ neutral: p.neutral }">
                <div class="part-head">
                  <span class="part-label">
                    {{ p.label }}
                    <span v-if="p.neutral" class="part-tag">{{ t("evaluator.parts.neutral") }}</span>
                  </span>
                  <span class="part-points">{{ t("evaluator.points", { points: p.points, max: p.max }) }}</span>
                </div>
                <span class="part-track" aria-hidden="true">
                  <span class="part-fill" :style="{ width: p.fill + '%' }"></span>
                </span>
                <p class="part-why">{{ p.sentence }}</p>
                <p v-if="p.warning" class="part-warning">{{ p.warning }}</p>
              </li>
            </ul>
          </div>

          <div v-if="price" class="price-rule">
            <p class="rule-caption">
              <strong>{{ formatCHF(listing.price) }}</strong> {{ t("evaluator.perNight", { sentence: price.sentence }) }}
            </p>
            <div
              class="rule"
              role="img"
              :aria-label="t('evaluator.ruleLabel', { price: formatCHF(listing.price), median: formatCHF(listing.median_price) })"
            >
              <div class="rule-track"></div>
              <div class="rule-median" :style="{ left: price.medianPos + '%' }">
                <span>{{ t("evaluator.median", { price: formatCHF(listing.median_price) }) }}</span>
              </div>
              <div class="rule-dot" :style="{ left: price.listingPos + '%' }"></div>
            </div>
            <p v-if="listing.price_date" class="fine">{{ t("evaluator.priceSeen", { date: formatDate(listing.price_date) }) }}</p>
          </div>

          <dl class="facts">
            <div>
              <dt>{{ t("evaluator.rating") }}</dt>
              <dd>{{ isNum(listing.rating) ? formatNumber(listing.rating, 2) : t("evaluator.noRating") }}</dd>
              <dd v-if="isNum(listing.neighborhood_avg_rating)" class="fact-ref">
                {{ t("evaluator.area", { value: formatNumber(listing.neighborhood_avg_rating, 2) }) }}
              </dd>
            </div>
            <div>
              <dt>{{ t("evaluator.reviewsMonth") }}</dt>
              <dd>{{ isNum(listing.reviews_per_month) ? formatNumber(listing.reviews_per_month, 1) : t("evaluator.noReviews") }}</dd>
              <dd v-if="isNum(listing.neighborhood_avg_reviews_per_month)" class="fact-ref">
                {{ t("evaluator.area", { value: formatNumber(listing.neighborhood_avg_reviews_per_month, 1) }) }}
              </dd>
            </div>
            <div>
              <dt>{{ t("evaluator.superhost") }}</dt>
              <dd>{{ listing.host_is_superhost ? t("evaluator.yes") : t("evaluator.no") }}</dd>
            </div>
          </dl>

          <div class="amenities">
            <h3>{{ t("evaluator.amenities") }}</h3>
            <ul>
              <li v-for="a in listing.amenities || []" :key="'y' + a" class="has">{{ amenityLabel(a) }}</li>
              <li v-for="a in listing.missing_amenities || []" :key="'n' + a" class="missing">
                <span class="sr-only">{{ t("evaluator.missing") }} </span>{{ amenityLabel(a) }}
              </li>
            </ul>
          </div>
        </template>

        <div class="res-actions">
          <a class="res-link" :href="`https://www.airbnb.ch/rooms/${result.listing_id}`" target="_blank" rel="noopener">
            {{ t("evaluator.openAirbnb") }}
          </a>
          <button type="button" class="share-btn" @click="shareResult">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4L12 5.6" />
              <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2" />
            </svg>
            {{ copied ? t("evaluator.copied") : t("evaluator.share") }}
          </button>
        </div>
        <span class="sr-only" aria-live="polite">{{ copied ? t("evaluator.copiedAnnounce") : "" }}</span>
      </article>

      <!-- Before any check: explain the score instead of showing fake data -->
      <aside v-else class="panel how">
        <h2>{{ t("evaluator.howTitle") }}</h2>
        <p>{{ t("evaluator.howIntro") }}</p>
        <ul class="weights">
          <li v-for="w in WEIGHTS" :key="w.key">
            <span class="w-bar" :style="{ width: w.pct * 2 + '%' }"></span>
            <span class="w-pct">{{ w.pct }}%</span>
            <span class="w-label">{{ t(`evaluator.weights.${w.key}`) }}</span>
          </li>
        </ul>
        <p class="fine">{{ t("evaluator.howNote") }}</p>
      </aside>

      <!-- AI read of the listing: fills the column under the form while the result card is tall -->
      <section v-if="result && hasAnalysis" class="analysis" aria-labelledby="analysis-title">
        <h2 id="analysis-title">{{ t("evaluator.analysisTitle") }}</h2>
        <p v-if="summary" class="analysis-summary">{{ summary }}</p>
        <div class="analysis-cols">
          <div v-if="pros.length">
            <h3>{{ t("evaluator.strengths") }}</h3>
            <ul>
              <li v-for="(text, i) in pros" :key="'p' + i" class="pro">{{ text }}</li>
            </ul>
          </div>
          <div v-if="cons.length">
            <h3>{{ t("evaluator.watchOut") }}</h3>
            <ul>
              <li v-for="(text, i) in cons" :key="'c' + i" class="con">{{ text }}</li>
            </ul>
          </div>
        </div>
        <p class="fine">{{ t("evaluator.aiNote") }}</p>
      </section>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { locale, t } from "../i18n";
import { apiPost } from "../lib/api";
import { amenityLabel, formatCHF, formatDate, formatNumber, isNum, roomTypeLabel } from "../lib/format";
import { breakdownRows, priceComparison, scoreErrorMessage, verdictFor } from "../lib/score";
import DemoVideo from "./DemoVideo.vue";

const EXAMPLE_URL = "https://www.airbnb.ch/rooms/53584592";
const WEIGHTS = [
  { pct: 45, key: "price" },
  { pct: 30, key: "reviews" },
  { pct: 15, key: "amenities" },
  { pct: 10, key: "superhost" },
];

const url = ref("");
const loading = ref(false);
// HTTP status of the failed check (0 without one), so the message follows the language
const errorStatus = ref(null);
const error = computed(() => (errorStatus.value === null ? "" : scoreErrorMessage(errorStatus.value)));
const result = ref(null);
const shownScore = ref(0);
const resultEl = ref(null);
const copied = ref(false);

const listing = computed(() => result.value?.listing || {});
const pros = computed(() => result.value?.analysis?.pros || []);
const cons = computed(() => result.value?.analysis?.cons || []);
const summary = computed(() => result.value?.analysis?.summary || "");
const hasAnalysis = computed(() => pros.value.length > 0 || cons.value.length > 0 || !!summary.value);

const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// The API does not score a listing that left Airbnb (active: false)
const gone = computed(() => result.value?.active === false);
const verdict = computed(() => verdictFor(result.value?.smart_score));
const price = computed(() => priceComparison(listing.value));
const parts = computed(() => breakdownRows(result.value?.breakdown));

// One orchestrated moment: the score counts up when a result arrives
// (not again when the same listing comes back in another language).
watch(result, (r, previous) => {
  if (!r) return (shownScore.value = 0);
  const target = Number(r?.smart_score ?? 0);
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || previous?.listing_id === r.listing_id) return (shownScore.value = target);
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / 700);
    shownScore.value = Math.round(target * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
});

// In the one-column layout the result card starts below the fold: bring it into view
async function scrollToResult() {
  if (!window.matchMedia("(max-width: 960px)").matches) return;
  await nextTick();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  resultEl.value?.scrollIntoView({ behavior: reduce ? "instant" : "smooth", block: "start" });
}

// Shareable results: a successful check puts ?listing=<id> in the address bar,
// and opening that address runs the same check again.
const listingFromAddress = () => {
  const id = new URLSearchParams(window.location.search).get("listing");
  return id && /^\d{1,19}$/.test(id) ? id : null;
};
const shareUrl = (id) => `${window.location.origin}${window.location.pathname}?listing=${id}`;

function checkFromAddress() {
  const id = listingFromAddress();
  if (id) return evaluate(`https://www.airbnb.ch/rooms/${id}`, { updateAddress: false });
  // Back to the page without a listing: show the empty state again
  result.value = null;
  errorStatus.value = null;
  url.value = "";
}

onMounted(() => {
  window.addEventListener("popstate", checkFromAddress);
  if (listingFromAddress()) checkFromAddress();
});
onBeforeUnmount(() => window.removeEventListener("popstate", checkFromAddress));

let copiedTimer;
async function shareResult() {
  const link = shareUrl(result.value.listing_id);
  const text = gone.value
    ? t("evaluator.shareTextGone", { name: listing.value.name })
    : t("evaluator.shareText", { name: listing.value.name, score: result.value.smart_score });
  // Phones open the native share sheet (WhatsApp, Messages...); desktops copy the link
  if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
    try {
      return await navigator.share({ title: "SmartBnB", text, url: link });
    } catch (e) {
      if (e.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(link);
    copied.value = true;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (copied.value = false), 2000);
  } catch {
    window.prompt(t("evaluator.copyPrompt"), link);
  }
}

async function evaluate(fromUrl, { updateAddress = true } = {}) {
  if (fromUrl) url.value = fromUrl;
  if (!url.value) return;
  loading.value = true;
  errorStatus.value = null;
  // Hide the previous listing so its score is never read as the answer to this link
  result.value = null;
  const lang = locale.value;
  try {
    const data = await apiPost("/score", { airbnbUrl: url.value, lang });
    if (!data?.ok) throw new Error("Evaluation failed");
    result.value = data;
    if (updateAddress && listingFromAddress() !== String(data.listing_id)) {
      history.pushState(null, "", shareUrl(data.listing_id));
    }
    scrollToResult();
    // The language changed while the check was running
    if (lang !== locale.value) refreshAnalysis();
  } catch (e) {
    console.error(e);
    // The address must not keep pointing to a listing that is no longer shown
    if (updateAddress && listingFromAddress()) history.pushState(null, "", window.location.pathname);
    errorStatus.value = e.status ?? 0;
  } finally {
    loading.value = false;
  }
}

// The AI analysis is written in the visitor's language: after a language switch,
// ask for the shown listing again. The current result stays on screen meanwhile,
// and also if this fails.
async function refreshAnalysis() {
  const id = result.value?.listing_id;
  if (!id || loading.value) return;
  try {
    const data = await apiPost("/score", { airbnbUrl: id, lang: locale.value });
    if (data?.ok && result.value?.listing_id === id) result.value = data;
  } catch (e) {
    console.error(e);
  }
}
watch(locale, refreshAnalysis);
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
  /* Even lines whatever the language: the French title is longer */
  text-wrap: balance;
}
h1:lang(fr) { max-width: 13ch; }
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

.gone {
  margin: 28px 0;
  padding: 18px 20px;
  border-radius: 12px;
  border-left: 4px solid var(--mid);
  background: #F8EEDC;
}
.gone-title { margin: 0; font-size: 1.25rem; font-weight: 800; letter-spacing: -0.01em; }
.gone-text { margin: 6px 0 0; color: var(--ink-2); }

.parts { margin: 0 0 28px; }
.parts h3 { font-size: 0.95rem; margin: 0 0 14px; }
.parts ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 16px; }
.part-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.part-label { font-weight: 700; }
.part-points { font-size: 0.9rem; font-weight: 600; color: var(--ink-2); white-space: nowrap; }
.part-track { display: block; height: 8px; margin: 6px 0; border-radius: 99px; background: var(--paper-2); overflow: hidden; }
.part-fill { display: block; height: 100%; border-radius: 99px; background: var(--lake); }
/* A neutral part is a placeholder, not a measure: hatched, never in the brand colour */
.neutral .part-fill {
  background: repeating-linear-gradient(135deg, var(--ink-3) 0 4px, transparent 4px 8px);
}
.part-tag {
  margin-left: 6px; padding: 1px 8px; border-radius: 99px;
  font-size: 0.75rem; font-weight: 600; color: var(--ink-2);
  box-shadow: inset 0 0 0 1px var(--line);
}
.part-why { margin: 0; font-size: 0.9rem; color: var(--ink-2); }
.part-warning {
  margin: 6px 0 0; padding: 6px 10px; border-radius: 0 8px 8px 0;
  border-left: 3px solid var(--mid); background: #F8EEDC; font-size: 0.85rem;
}

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

.res-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 24px;
  margin-top: 28px;
}
.res-link {
  color: var(--lake);
  font-weight: 600;
  text-underline-offset: 3px;
}
.share-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border: 1.5px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.share-btn:hover { border-color: var(--ink); }
.share-btn svg {
  width: 16px; height: 16px;
  fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round;
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
