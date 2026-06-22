const BRIQUES = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'];

// URL du Worker Cloudflare (à renseigner après déploiement — voir worker/README.md).
const WORKER_URL = '';
// Briques déclenchables manuellement (b3 = cron O2switch, non déclenchable).
const TRIGGERABLE = {
  b1: 'B1 — Résiliation', b2: 'B2 — Sauvegardes', b4: 'B4 — Fiches IA',
  b5: 'B5 — Publication', b6: 'B6 — Miniatures'
};
// Briques à effet réel (suppression/résiliation) → confirmation renforcée.
const EFFET_REEL = new Set(['b1', 'b2']);

function toast(msg, ok) {
  const t = document.createElement('div');
  t.className = 'toast ' + (ok ? 'ok' : 'ko');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 5000);
}

async function trigger(brique) {
  if (!WORKER_URL) { toast('Worker non configuré (WORKER_URL vide).', false); return; }
  const label = TRIGGERABLE[brique] || brique;
  const dur = EFFET_REEL.has(brique) ? ' — ⚠️ action à effet réel' : '';
  if (!confirm(`Lancer ${label}${dur} ?`)) return;
  let key = localStorage.getItem('triggerKey');
  if (!key) {
    key = prompt('Clé de déclenchement :');
    if (!key) return;
    localStorage.setItem('triggerKey', key);
  }
  try {
    const r = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Trigger-Key': key },
      body: JSON.stringify({ brique })
    });
    if (r.status === 401) {
      localStorage.removeItem('triggerKey');
      toast('Clé invalide — réessayez.', false);
      return;
    }
    if (!r.ok) { toast(`Échec (${r.status}).`, false); return; }
    toast(`${label} lancé ✅`, true);
  } catch {
    toast('Erreur réseau.', false);
  }
}

function timeAgo(iso) {
  if (!iso) return 'jamais';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86400)} j`;
}

function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function cardHtml(d) {
  const errs = (d.errors || []).length
    ? `<div class="errors">Erreurs :<ul>${d.errors.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul></div>` : '';
  const cost = d.cost != null ? `<div class="cost">💸 Coût IA : ${d.cost} $</div>` : '';
  const hist = (d.history || []).slice(1).map((h) => `<li>${escapeHtml(h.summary)} — ${timeAgo(h.date)}</li>`).join('');
  const run = TRIGGERABLE[d.id]
    ? `<button class="run" onclick="trigger('${d.id}')">▶ Lancer</button>` : '';
  return `<section class="card ${d.status}">
    <h2>${escapeHtml(d.brique)} <span class="badge ${d.status}">${d.status}</span></h2>
    <div class="meta">Dernier run : ${timeAgo(d.lastRun)}</div>
    <div class="summary">${escapeHtml(d.summary || '')}</div>
    ${cost}${errs}
    ${hist ? `<details><summary>Historique</summary><ul>${hist}</ul></details>` : ''}
    ${run}
  </section>`;
}

async function load() {
  const results = await Promise.all(BRIQUES.map(async (b) => {
    try { const r = await fetch(`data/${b}.json?t=${Date.now()}`); return r.ok ? { id: b, ...(await r.json()) } : null; } catch { return null; }
  }));
  const data = results.filter(Boolean);
  const order = { erreur: 0, partiel: 1, ok: 2 };
  data.sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));
  const ko = data.filter((d) => d.status !== 'ok').length;
  const alert = document.getElementById('alert');
  alert.className = 'alert ' + (ko ? 'ko' : 'ok');
  alert.textContent = ko ? `⚠️ ${ko} brique(s) à surveiller` : '✅ Tout va bien';
  document.getElementById('cards').innerHTML = data.length ? data.map(cardHtml).join('') : 'Aucune donnée pour le moment.';
  document.getElementById('updated').textContent = 'Mis à jour ' + timeAgo(new Date().toISOString());
}
load();
setInterval(load, 60000);
