const BRIQUES = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'];

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
  return `<section class="card ${d.status}">
    <h2>${escapeHtml(d.brique)} <span class="badge ${d.status}">${d.status}</span></h2>
    <div class="meta">Dernier run : ${timeAgo(d.lastRun)}</div>
    <div class="summary">${escapeHtml(d.summary || '')}</div>
    ${cost}${errs}
    ${hist ? `<details><summary>Historique</summary><ul>${hist}</ul></details>` : ''}
  </section>`;
}

async function load() {
  const results = await Promise.all(BRIQUES.map(async (b) => {
    try { const r = await fetch(`data/${b}.json?t=${Date.now()}`); return r.ok ? await r.json() : null; } catch { return null; }
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
