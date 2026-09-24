// Cloudflare Web Analytics: cookieless page view counts, no consent banner needed.
// The beacon token is public (it ships in every page). The script only loads on the
// production host so local runs and forks do not report to the SmartBnB dashboard.
const BEACON_TOKEN = "47951a84d2b640c4a4786fe2c2f11515";
const PRODUCTION_HOST = "www.smartbnb.ch";

export function loadAnalytics() {
  if (window.location.hostname !== PRODUCTION_HOST) return;
  const script = document.createElement("script");
  script.defer = true;
  script.src = "https://static.cloudflareinsights.com/beacon.min.js";
  script.dataset.cfBeacon = JSON.stringify({ token: BEACON_TOKEN });
  document.head.appendChild(script);
}
