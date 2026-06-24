const BRIQUES = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'];

// Horaires des crons (heure UTC, chaque lundi). À garder synchro avec les workflows.
const SCHEDULE = { b1: 6, b2: 7, b3: 8, b6: 9, b4: 10, b5: 11 };

// Prochaine occurrence d'un lundi à hourUTC (strictement après now). Date ou null.
function nextRun(hourUTC, now) {
  for (let i = 0; i < 8; i++) {
    const c = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + i, hourUTC, 0, 0));
    if (c.getUTCDay() === 1 && c.getTime() > now.getTime()) return c;
  }
  return null;
}

// Dernier lundi à hourUTC <= now. Date ou null.
function lastExpectedRun(hourUTC, now) {
  for (let i = 0; i < 8; i++) {
    const c = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i, hourUTC, 0, 0));
    if (c.getUTCDay() === 1 && c.getTime() <= now.getTime()) return c;
  }
  return null;
}

// En retard si le dernier passage attendu (+ marge) est dépassé et lastRun lui est antérieur (ou absent).
function isOverdue(lastRunIso, hourUTC, now, marginH = 2) {
  const expected = lastExpectedRun(hourUTC, now);
  if (!expected) return false;
  if (now.getTime() < expected.getTime() + marginH * 3600 * 1000) return false; // run peut être en cours
  if (!lastRunIso) return true;
  return new Date(lastRunIso).getTime() < expected.getTime();
}

// « lundi JJ/MM HHh UTC (dans N j) ».
function fmtNextRun(date, now) {
  if (!date) return '';
  const days = Math.round((date.getTime() - now.getTime()) / 86400000);
  const jj = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const when = days <= 0 ? "aujourd'hui" : (days === 1 ? 'demain' : `dans ${days} j`);
  return `lundi ${jj}/${mm} ${date.getUTCHours()}h UTC (${when})`;
}

// URL du Worker Cloudflare (à renseigner après déploiement — voir worker/README.md).
const WORKER_URL = 'https://inviteasy-trigger.curly-mud-0e42.workers.dev/';
// Briques déclenchables manuellement (b3 = cron O2switch, non déclenchable).
const TRIGGERABLE = {
  b1: 'B1 — Résiliation', b2: 'B2 — Sauvegardes', b4: 'B4 — Fiches IA',
  b5: 'B5 — Publication', b6: 'B6 — Miniatures'
};
// Briques à effet réel (suppression/résiliation) → confirmation renforcée.
const EFFET_REEL = new Set(['b1', 'b2']);
// Libellés par défaut (carte affichée même si la brique n'a jamais publié de statut).
const BRIQUE_NAMES = {
  b1: 'B1 — Résiliation', b2: 'B2 — Sauvegardes', b3: 'B3 — Anonymisation',
  b4: 'B4 — Fiches IA', b5: 'B5 — Publication', b6: 'B6 — Miniatures'
};

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
  const cost = d.cost != null ? `<div class="cost">💸 Coût IA (dernier run) : ${d.cost} $${d.costTotal != null ? ` · cumulé : ${d.costTotal} $` : ''}</div>` : '';
  const hist = (d.history || []).slice(1).map((h) => `<li>${escapeHtml(h.summary)} — ${timeAgo(h.date)}</li>`).join('');
  const run = TRIGGERABLE[d.id]
    ? `<button class="run" onclick="trigger('${d.id}')">▶ Lancer</button>` : '';
  const title = escapeHtml(d.brique || BRIQUE_NAMES[d.id] || d.id);
  const summary = d.missing ? 'Jamais lancé — en attente du premier run' : (d.summary || '');
  const lateBadge = d.overdue ? ' <span class="badge late">🕘 en retard</span>' : '';
  const next = d.nextRunText ? `<div class="meta next">⏭ Prochaine : ${d.nextRunText}</div>` : '';
  const lastAbs = d.lastRun ? ` title="${escapeHtml(new Date(d.lastRun).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }))}"` : '';
  return `<section class="card ${d.status}${d.overdue ? ' late' : ''}">
    <h2>${title} <span class="badge ${d.status}">${d.status}</span>${lateBadge}</h2>
    <div class="meta"${lastAbs}>Dernier run : ${timeAgo(d.lastRun)}</div>
    ${next}
    <div class="summary">${escapeHtml(summary)}</div>
    ${cost}${errs}
    ${hist ? `<details><summary>Historique</summary><ul>${hist}</ul></details>` : ''}
    ${run}
  </section>`;
}

async function load() {
  const now = new Date();
  const results = await Promise.all(BRIQUES.map(async (b) => {
    try { const r = await fetch(`data/${b}.json?t=${Date.now()}`); return r.ok ? { id: b, ...(await r.json()) } : { id: b, status: 'inconnu', missing: true }; } catch { return { id: b, status: 'inconnu', missing: true }; }
  }));

  // Enrichissement : prochaine exécution + retard par brique.
  for (const d of results) {
    const h = SCHEDULE[d.id];
    if (h != null) {
      d.nextRunText = fmtNextRun(nextRun(h, now), now);
      d.overdue = isOverdue(d.lastRun, h, now);
    }
  }

  // Tri : en retard et erreurs d'abord.
  const order = { erreur: 0, partiel: 1, ok: 2, inconnu: 4 };
  results.sort((a, b) => (a.overdue ? -1 : 0) - (b.overdue ? -1 : 0) || (order[a.status] ?? 3) - (order[b.status] ?? 3));

  // Alerte : erreurs/partiels + retards.
  const ko = results.filter((d) => d.status === 'erreur' || d.status === 'partiel' || d.overdue).length;
  const alert = document.getElementById('alert');
  alert.className = 'alert ' + (ko ? 'ko' : 'ok');
  alert.textContent = ko ? `⚠️ ${ko} brique(s) à surveiller` : '✅ Tout va bien';

  // Synthèse + coûts en en-tête.
  const costTotal = results.reduce((s, d) => s + (d.costTotal || 0), 0);
  const costLast = results.reduce((s, d) => s + (d.cost || 0), 0);
  const soonest = results
    .filter((d) => SCHEDULE[d.id] != null)
    .map((d) => ({ id: d.id, t: nextRun(SCHEDULE[d.id], now) }))
    .filter((x) => x.t)
    .sort((a, b) => a.t.getTime() - b.t.getTime())[0];
  const nextLabel = soonest ? `${(BRIQUE_NAMES[soonest.id] || soonest.id).split(' ')[0]} lundi ${soonest.t.getUTCHours()}h UTC` : '—';
  const costLabel = (costTotal > 0 || costLast > 0)
    ? ` · 💸 Coût IA — cumulé : ${costTotal.toFixed(2)} $ · dernier passage : ${costLast.toFixed(2)} $` : '';
  document.getElementById('summary').textContent =
    `${results.length} briques · ${ko} à surveiller · prochaine activité : ${nextLabel}${costLabel}`;

  document.getElementById('cards').innerHTML = results.map(cardHtml).join('');
  document.getElementById('updated').textContent = 'Mis à jour ' + timeAgo(new Date().toISOString());
}
load();
setInterval(load, 60000);
