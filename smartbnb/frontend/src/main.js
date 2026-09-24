// frontend/src/main.js
import { createApp } from 'vue'
import App from './App.vue'
import { loadAnalytics } from './lib/analytics'

createApp(App).mount('#app')
loadAnalytics()
