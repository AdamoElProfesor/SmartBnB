<template>
  <a href="#evaluate" class="skip-link">{{ t("nav.skip") }}</a>

  <header class="nav">
    <div class="wrap nav-row">
      <a href="#evaluate" class="brand" :aria-label="t('nav.home')">
        <!-- A roof over the prices of similar stays; the green bar is this listing, a good deal -->
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path class="roof" d="M3.4 15.4 16 4.2l12.6 11.2" />
          <rect x="5.9" y="19.5" width="4" height="9.3" rx="1.1" />
          <rect x="11.3" y="14.8" width="4" height="14" rx="1.1" />
          <rect x="16.7" y="17.4" width="4" height="11.4" rx="1.1" />
          <rect class="pick" x="22.1" y="22.6" width="4" height="6.2" rx="1.1" />
        </svg>
        SmartBnB
      </a>
      <div class="nav-end">
        <nav :aria-label="t('nav.sections')">
          <a href="#evaluate">{{ t("nav.evaluate") }}</a>
          <a href="#price-map">{{ t("nav.map") }}</a>
          <a href="#top-10">{{ t("nav.top10") }}</a>
          <a href="#trends">{{ t("nav.trends") }}</a>
        </nav>
        <div class="lang-switch" role="group" :aria-label="t('nav.language')">
          <button
            v-for="lang in SUPPORTED"
            :key="lang"
            type="button"
            :lang="lang"
            :aria-label="MESSAGES[lang].locale.name"
            :aria-pressed="locale === lang"
            @click="setLocale(lang)"
          >
            {{ MESSAGES[lang].locale.short }}
          </button>
        </div>
      </div>
    </div>
  </header>

  <main>
    <Evaluator />
    <HeatmapSection />
    <Top10WithMap />
    <PriceEvolution />
    <OpenSource />
  </main>

  <footer class="site-footer">
    <div class="wrap foot-row">
      <p class="foot-brand">SmartBnB</p>
      <p class="foot-text">
        {{ t("footer.credits") }}
        {{ t("footer.dataFrom") }} <a href="https://insideairbnb.com" target="_blank" rel="noopener">InsideAirbnb</a>
        (<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>, {{ t("footer.cleaned") }}),
        {{ t("footer.mapsFrom") }} <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>.
      </p>
      <a class="foot-gh" href="https://github.com/AdamoElProfesor/SmartBnB" target="_blank" rel="noopener">{{ t("footer.source") }}</a>
    </div>
  </footer>
</template>

<script setup>
import { MESSAGES, SUPPORTED, locale, setLocale, t } from "./i18n";
import Evaluator from "./components/Evaluator.vue";
import HeatmapSection from "./components/HeatmapSection.vue";
import Top10WithMap from "./components/Top10WithMap.vue";
import PriceEvolution from "./components/PriceEvolution.vue";
import OpenSource from "./components/OpenSource.vue";
</script>

<style>
:root {
  color-scheme: light;
  --paper: #F2F4EF;
  --paper-2: #E4E9E2;
  --surface: #FFFFFF;
  --ink: #1C2B2A;
  --ink-2: #4A5A57;
  --ink-3: #6F7D79;
  --line: #D3DAD3;
  --lake: #2F6F8F;
  --lake-tint: #D8E8EF;
  --good: #3F7A3A;
  --mid: #B7862E;
  --bad: #C0432E;
  --font: "Schibsted Grotesk", system-ui, sans-serif;
}

* { box-sizing: border-box; }
html { scroll-behavior: smooth; scroll-padding-top: 76px; }
body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font: 400 16px/1.55 var(--font);
  -webkit-font-smoothing: antialiased;
}
h1, h2, h3 { color: var(--ink); }
a { color: inherit; }
button { font-family: inherit; }
:focus-visible { outline: 3px solid var(--lake); outline-offset: 2px; border-radius: 4px; }

.wrap { width: min(1200px, 100% - 48px); margin-inline: auto; }
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}
.skip-link { position: absolute; left: -999px; top: 8px; z-index: 100; background: var(--ink); color: #fff; padding: 8px 14px; border-radius: 8px; }
.skip-link:focus { left: 16px; }

.btn-primary {
  border: 0;
  border-radius: 10px;
  padding: 12px 22px;
  background: var(--ink);
  color: #fff;
  font-weight: 700;
  font-size: 1rem;
  cursor: pointer;
  white-space: nowrap;
}
.btn-primary:hover { background: var(--lake); }
.btn-primary:disabled { opacity: 0.6; cursor: progress; }

/* Section heading shared by the data sections */
.section { padding: 88px 0; border-top: 1px solid var(--line); }
.section-head { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); gap: 64px; margin-bottom: 36px; align-items: end; }
.section-head h2 { font-size: clamp(1.9rem, 3.4vw, 2.7rem); line-height: 1.05; letter-spacing: -0.03em; font-weight: 800; margin: 0; }
.section-head p { margin: 0; color: var(--ink-2); max-width: 52ch; }

/* Leaflet */
.muted-tiles { filter: grayscale(75%) contrast(92%) brightness(104%); }
.map-touch-hint {
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.94);
  border-radius: 8px;
  box-shadow: 0 6px 20px -10px rgba(28, 43, 42, 0.4);
  font-size: 0.8rem;
  color: var(--ink-2);
  pointer-events: none;
}
.leaflet-container { font-family: var(--font); background: var(--paper-2); }
.leaflet-control-attribution { font-size: 11px; }

@media (max-width: 960px) {
  .section { padding: 64px 0; }
  .section-head { grid-template-columns: 1fr; gap: 12px; }
}
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
}
</style>

<style scoped>
.nav {
  position: sticky;
  top: 0;
  z-index: 1000;
  background: rgba(242, 244, 239, 0.88);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--line);
}
.nav-row { display: flex; align-items: center; justify-content: space-between; height: 64px; gap: 24px; }
.brand { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 1.15rem; letter-spacing: -0.02em; text-decoration: none; }
.brand svg { width: 28px; height: 28px; flex: none; fill: var(--lake); }
.brand svg .roof { fill: none; stroke: var(--lake); stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
.brand svg .pick { fill: var(--good); }
.nav-end { display: flex; align-items: center; gap: 12px; }
.nav nav { display: flex; gap: 4px; }
.nav nav a { text-decoration: none; padding: 8px 12px; border-radius: 8px; color: var(--ink-2); font-weight: 500; }
.nav nav a:hover { color: var(--ink); background: var(--paper-2); }

.lang-switch { display: flex; padding: 3px; gap: 2px; background: var(--paper-2); border-radius: 9px; }
.lang-switch button {
  border: 0;
  background: transparent;
  padding: 5px 9px;
  border-radius: 7px;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--ink-2);
  cursor: pointer;
}
.lang-switch button:hover { color: var(--ink); }
.lang-switch button[aria-pressed="true"] { background: var(--surface); color: var(--ink); box-shadow: 0 1px 3px rgba(28, 43, 42, 0.18); }

.site-footer { border-top: 1px solid var(--line); padding: 40px 0 56px; }
.foot-row { display: grid; grid-template-columns: auto 1fr auto; gap: 32px; align-items: baseline; }
.foot-brand { margin: 0; font-weight: 800; }
.foot-text { margin: 0; color: var(--ink-2); max-width: 70ch; }
.foot-text a, .foot-gh { color: var(--lake); text-underline-offset: 3px; }

@media (max-width: 760px) {
  .nav nav a:not(:first-child) { display: none; }
  .foot-row { grid-template-columns: 1fr; gap: 8px; }
}
/* Phones: the brand already leads to the check, keep room for the language switch */
@media (max-width: 520px) {
  .nav nav { display: none; }
}
</style>
