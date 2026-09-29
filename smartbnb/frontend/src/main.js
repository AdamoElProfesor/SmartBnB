// frontend/src/main.js
import { createApp } from 'vue'
// Self-hosted font: no request to Google Fonts, so no visitor IP sent to Google
import '@fontsource/schibsted-grotesk/400.css'
import '@fontsource/schibsted-grotesk/500.css'
import '@fontsource/schibsted-grotesk/600.css'
import '@fontsource/schibsted-grotesk/700.css'
import '@fontsource/schibsted-grotesk/800.css'
import App from './App.vue'
import { applyLocaleToDocument } from './i18n'
import { loadAnalytics } from './lib/analytics'

applyLocaleToDocument()
createApp(App).mount('#app')
loadAnalytics()
