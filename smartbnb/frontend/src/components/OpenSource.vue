<template>
  <aside id="open-source" class="open-source" aria-label="Open source">
    <div class="wrap os-row">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="6" cy="5" r="2.2" />
        <circle cx="6" cy="19" r="2.2" />
        <circle cx="18" cy="7" r="2.2" />
        <path d="M6 7.2v9.6M18 9.2c0 4.5-6 3.5-11 7.8" />
      </svg>
      <p>
        <strong>SmartBnB is open source.</strong>
        Found a bug or have an idea? Every contribution is read and answered.
        <a :href="`${REPO}/blob/main/CONTRIBUTING.md`" target="_blank" rel="noopener">Contribute on GitHub</a>
      </p>
    </div>
  </aside>
</template>

<script setup>
const REPO = "https://github.com/AdamoElProfesor/SmartBnB";
</script>

<style scoped>
.open-source { border-top: 1px solid var(--line); padding: 20px 0; }
.os-row { display: flex; align-items: baseline; gap: 10px; }
svg {
  flex: none;
  width: 16px; height: 16px;
  align-self: center;
  fill: none; stroke: var(--lake); stroke-width: 1.8; stroke-linecap: round;
}
p { margin: 0; font-size: 0.9rem; color: var(--ink-2); }
strong { color: var(--ink); font-weight: 600; }
a {
  margin-left: 4px;
  color: var(--lake);
  font-weight: 600;
  text-underline-offset: 3px;
  white-space: nowrap;
}
a:hover { color: var(--ink); }
@media (max-width: 520px) {
  svg { align-self: flex-start; margin-top: 3px; }
}
</style>
