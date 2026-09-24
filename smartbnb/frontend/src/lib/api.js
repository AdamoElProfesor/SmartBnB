export const API_BASE = import.meta.env.VITE_API_BASE || "/api";

export async function apiGet(path, params = {}) {
  const url = new URL(API_BASE + path, window.location.origin);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export async function apiPost(path, body = {}) {
  const res = await fetch(API_BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = new Error(`${res.status} ${res.statusText}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}
