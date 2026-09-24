<template>
  <button type="button" class="demo-btn" @click="open">
    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 3.5v9l7-4.5z" /></svg>
    <span>Watch the 3-minute demo</span>
  </button>

  <!-- Native dialog: focus trap, Escape to close and backdrop come for free -->
  <dialog ref="dialog" class="demo" aria-label="SmartBnB demo video" @click="closeOnBackdrop" @close="playing = false">
    <div class="demo-frame">
      <!-- The iframe only exists while the dialog is open, so YouTube loads on click and stops on close -->
      <iframe
        v-if="playing"
        :src="EMBED_URL"
        title="SmartBnB demo video"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowfullscreen
      ></iframe>
    </div>
    <button type="button" class="demo-close" aria-label="Close video" @click="dialog.close()">×</button>
  </dialog>
</template>

<script setup>
import { ref } from "vue";

const EMBED_URL = "https://www.youtube-nocookie.com/embed/yPMMxEeDstM?autoplay=1&rel=0";

const dialog = ref(null);
const playing = ref(false);

function open() {
  playing.value = true;
  dialog.value.showModal();
}

// A click on the dialog element itself (not its content) is a click on the backdrop
function closeOnBackdrop(e) {
  if (e.target === dialog.value) dialog.value.close();
}
</script>

<style scoped>
.demo-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: 0;
  padding: 4px 0;
  font: inherit;
  color: var(--lake);
  cursor: pointer;
}
.demo-btn span { text-decoration: underline; text-underline-offset: 3px; }
.demo-btn svg { width: 22px; height: 22px; padding: 5px; border-radius: 50%; background: var(--lake); fill: #fff; }
.demo-btn:hover { color: var(--ink); }
.demo-btn:hover svg { background: var(--ink); }

.demo {
  /* 16:9 player that also fits short windows, leaving room above for the close button */
  width: min(960px, calc(100vw - 32px), calc((100dvh - 140px) * 16 / 9));
  max-width: none;
  padding: 0;
  border: 0;
  border-radius: 14px;
  background: #000;
  overflow: visible;
}
.demo::backdrop { background: rgba(28, 43, 42, 0.78); }
.demo-frame { aspect-ratio: 16 / 9; }
.demo-frame iframe { display: block; width: 100%; height: 100%; border: 0; border-radius: 14px; }
.demo-close {
  position: absolute;
  top: -48px;
  right: 0;
  width: 38px;
  height: 38px;
  border: 0;
  border-radius: 50%;
  background: var(--surface);
  color: var(--ink);
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
}
.demo-close:hover { background: var(--paper-2); }
</style>
