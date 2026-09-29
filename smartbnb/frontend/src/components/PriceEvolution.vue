<template>
  <section id="trends" class="section">
    <div class="wrap">
      <div class="section-head">
        <h2>{{ t("trends.title") }}</h2>
        <p>{{ t("trends.intro") }}</p>
      </div>

      <p v-if="loading" class="state">{{ t("trends.loading") }}</p>
      <p v-else-if="error" class="state state-error">{{ t("trends.error") }}</p>
      <p v-else-if="!rows.length" class="state">{{ t("trends.empty") }}</p>

      <ul v-else class="bars" :style="{ '--zero': zeroPos + '%' }">
        <li v-for="(r, i) in rows" :key="r.label ?? i">
          <span class="region">{{ r.label ?? t("trends.unknown") }}</span>
          <span class="track">
            <span
              class="bar"
              :class="r.value < 0 ? 'down' : 'up'"
              :style="{ left: r.left + '%', width: r.width + '%' }"
            ></span>
          </span>
          <span class="value" :class="r.value < 0 ? 'down' : 'up'">{{ formatPct(r.value) }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { t } from "../i18n";
import { apiGet } from "../lib/api";
import { formatNumber } from "../lib/format";

const loading = ref(true);
const error = ref(false);
const data = ref([]);

onMounted(async () => {
  try {
    const res = await apiGet("/histogram");
    data.value = (Array.isArray(res?.data) ? res.data : [])
      .map((r) => ({ label: r.region ?? null, value: Number(r.pct) }))
      .filter((d) => Number.isFinite(d.value))
      .sort((a, b) => b.value - a.value);
  } catch (e) {
    console.error(e);
    error.value = true;
  } finally {
    loading.value = false;
  }
});

const domain = computed(() => {
  const vals = data.value.map((d) => d.value);
  const lo = Math.min(0, ...vals);
  const hi = Math.max(0, ...vals);
  return { lo, span: hi - lo || 1 };
});
const pos = (v) => ((v - domain.value.lo) / domain.value.span) * 100;
const zeroPos = computed(() => pos(0));

const rows = computed(() =>
  data.value.map((d) => {
    const a = pos(0);
    const b = pos(d.value);
    return { ...d, left: Math.min(a, b), width: Math.abs(b - a) };
  })
);

const formatPct = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${formatNumber(Math.abs(v), 1)}%`;
</script>

<style scoped>
.state { color: var(--ink-2); margin: 0; }
.state-error { color: #7A2A1C; }

.bars { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.bars li {
  display: grid;
  grid-template-columns: minmax(120px, 220px) minmax(0, 1fr) 72px;
  align-items: center;
  gap: 16px;
}
.region { font-weight: 600; }
.track { position: relative; height: 28px; }
.track::before {
  content: "";
  position: absolute; top: -5px; bottom: -5px; left: var(--zero);
  width: 1px; background: var(--ink-3);
}
.bar { position: absolute; top: 4px; height: 20px; border-radius: 4px; }
.bar.up { background: var(--bad); }
.bar.down { background: var(--good); }
.value { font-weight: 700; text-align: right; }
.value.up { color: var(--bad); }
.value.down { color: var(--good); }

@media (max-width: 600px) {
  .bars li { grid-template-columns: 1fr 64px; gap: 4px 12px; }
  .region { grid-column: 1 / -1; }
  .track { grid-column: 1; }
}
</style>
