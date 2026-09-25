<template>
  <a href="#evaluate" class="skip-link">Skip to the listing check</a>

  <header class="nav">
    <div class="wrap nav-row">
      <a href="#evaluate" class="brand" aria-label="SmartBnB home">
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path d="M3 22c4-6 8-9 13-9s9 3 13 9" />
          <path d="M8 22c3-3.5 5-5 8-5s5 1.5 8 5" />
          <circle cx="16" cy="9" r="2.5" />
        </svg>
        SmartBnB
      </a>
      <nav aria-label="Sections">
        <a href="#evaluate">Check a listing</a>
        <a href="#price-map">Price map</a>
        <a href="#top-10">Top 10</a>
        <a href="#trends">Price trends</a>
      </nav>
    </div>
  </header>

  <main>
    <Evaluator />
    <HeatmapSection />
    <Top10WithMap />
    <PriceEvolution />
  </main>

  <footer class="site-footer">
    <div class="wrap foot-row">
      <p class="foot-brand">SmartBnB</p>
      <p class="foot-text">
        Built by Adam Gruber, Axel Pittet and Edison Sahitaj.
        Listing data from <a href="https://insideairbnb.com" target="_blank" rel="noopener">InsideAirbnb</a>,
        maps from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>.
      </p>
      <a class="foot-gh" href="https://github.com/AdamoElProfesor/SmartBnB" target="_blank" rel="noopener">Source on GitHub</a>
    </div>
  </footer>
</template>

<script setup>
import Evaluator from "./components/Evaluator.vue";
import HeatmapSection from "./components/HeatmapSection.vue";
import Top10WithMap from "./components/Top10WithMap.vue";
import PriceEvolution from "./components/PriceEvolution.vue";
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
.brand svg { width: 28px; height: 28px; fill: none; stroke: var(--lake); stroke-width: 2.2; stroke-linecap: round; }
.brand svg circle { fill: var(--bad); stroke: none; }
.nav nav { display: flex; gap: 4px; }
.nav nav a { text-decoration: none; padding: 8px 12px; border-radius: 8px; color: var(--ink-2); font-weight: 500; }
.nav nav a:hover { color: var(--ink); background: var(--paper-2); }

.site-footer { border-top: 1px solid var(--line); padding: 40px 0 56px; }
.foot-row { display: grid; grid-template-columns: auto 1fr auto; gap: 32px; align-items: baseline; }
.foot-brand { margin: 0; font-weight: 800; }
.foot-text { margin: 0; color: var(--ink-2); max-width: 70ch; }
.foot-text a, .foot-gh { color: var(--lake); text-underline-offset: 3px; }

@media (max-width: 760px) {
  .nav nav a:not(:first-child) { display: none; }
  .foot-row { grid-template-columns: 1fr; gap: 8px; }
}
</style>
