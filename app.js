// ==================== CONFIGURAÇÃO ====================

const SHEETS = {
  PARTICIPANTS: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRqE3kkDDcPtqpGJ3PguUDsikJMNFbm0zdl9AJeK6e-_egbJmgYX29r50ESGoFqV0qe_aToL4aNgbBh/pub?gid=496109362&single=true&output=csv",
  MATCHES: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRqE3kkDDcPtqpGJ3PguUDsikJMNFbm0zdl9AJeK6e-_egbJmgYX29r50ESGoFqV0qe_aToL4aNgbBh/pub?gid=606750094&single=true&output=csv",
  PREDICTIONS: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRqE3kkDDcPtqpGJ3PguUDsikJMNFbm0zdl9AJeK6e-_egbJmgYX29r50ESGoFqV0qe_aToL4aNgbBh/pub?gid=1378690055&single=true&output=csv",
  RANKING: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRqE3kkDDcPtqpGJ3PguUDsikJMNFbm0zdl9AJeK6e-_egbJmgYX29r50ESGoFqV0qe_aToL4aNgbBh/pub?gid=379623986&single=true&output=csv"
};

// ==================== ESTADO GLOBAL ====================

let participants = [];
let matches = [];
let predictions = [];
let ranking = [];
let charts = {};
let currentMatchFilter = "all";

// ==================== PROXY / FETCH ====================

function proxiedUrls(url) {
  return [
    url,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
  ];
}

async function fetchCsv(baseUrl, name) {
  const urls = proxiedUrls(baseUrl);
  let lastError = "";
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) { lastError = `${name} falhou. Status: ${response.status}`; continue; }
      const text = await response.text();
      if (!text || text.includes("<html") || text.includes("<!DOCTYPE html")) { lastError = `${name} retornou HTML, não CSV.`; continue; }
      return parseCsv(text);
    } catch (error) {
      lastError = `${name} falhou: ${error.message}`;
    }
  }
  throw new Error(lastError || `${name} falhou ao carregar.`);
}

function parseCsv(text) {
  const cleanText = text.trim();
  if (!cleanText) return [];
  const rows = cleanText.split(/\r?\n/);
  const headers = splitCsvLine(rows[0]).map(h => h.replace("\ufeff", "").trim());
  return rows.slice(1).map(row => {
    const values = splitCsvLine(row);
    const obj = {};
    headers.forEach((header, index) => { obj[header] = values[index] ? values[index].trim() : ""; });
    return obj;
  }).filter(row => Object.values(row).some(v => v !== ""));
}

function splitCsvLine(line) {
  const result = [];
  let current = "";
  let insideQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && insideQuotes && next === '"') { current += '"'; i++; }
    else if (char === '"') { insideQuotes = !insideQuotes; }
    else if (char === "," && !insideQuotes) { result.push(current); current = ""; }
    else { current += char; }
  }
  result.push(current);
  return result;
}

// ==================== HELPERS ====================

function num(value) {
  if (value === null || value === undefined || value === "") return 0;
  return Number(String(value).replace(",", ".")) || 0;
}

function isFilled(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function getMatchResult(home, away) {
  const h = num(home); const a = num(away);
  if (h > a) return "home";
  if (a > h) return "away";
  return "draw";
}

function getResultLabel(result, match) {
  if (result === "home") return match.home_team || "Mandante";
  if (result === "away") return match.away_team || "Visitante";
  return "Empate";
}

function isFinished(match) {
  return String(match.status || "").toLowerCase() === "finished";
}

function isFuture(match) { return !isFinished(match); }

function getParticipant(participantId) {
  return participants.find(p => String(p.participant_id) === String(participantId));
}

function getParticipantName(participantId) {
  const p = getParticipant(participantId);
  return p ? p.name || p.nickname || "Participante" : "Participante";
}

function getParticipantInitialByName(name) {
  return String(name || "?").trim().charAt(0).toUpperCase();
}

function getParticipantInitial(participantId) {
  const p = getParticipant(participantId);
  const source = p ? p.avatar_initial || p.name || p.nickname : "?";
  return String(source || "?").trim().charAt(0).toUpperCase();
}

function getExactScores(row) { return num(row.exact_scores || row.exactScores); }
function getCorrectResults(row) { return num(row.correct_results || row.correctResults); }
function getPoints(row) { return num(row.points); }

function getTodayLocal() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
}

function formatDateBR(date) {
  if (!date) return "-";
  const [yyyy, mm, dd] = String(date).split("-");
  if (!yyyy || !mm || !dd) return date;
  return `${dd}/${mm}`;
}

function getPredictionsForMatch(matchId) {
  return predictions.filter(p => String(p.match_id) === String(matchId));
}

function getMatchById(matchId) {
  return matches.find(m => String(m.match_id) === String(matchId));
}

function getRankingRow(participantId) {
  return ranking.find(r => String(r.participant_id) === String(participantId) || String(r.name) === getParticipantName(participantId));
}

function getRankPosition(participantId) {
  const name = getParticipantName(participantId);
  const idx = ranking.findIndex(r => (r.name || r.nickname) === name);
  return idx >= 0 ? idx + 1 : "-";
}

// ==================== PONTUAÇÃO (COM BÔNUS) ====================
// Regras:
//   Jogo normal  → resultado correto = 3pts | placar exato = 5pts
//   Jogo bônus   → resultado correto = 0pts | placar exato = 10pts

function isPredictionBonus(pred) {
  return String(pred.is_bonus || "").trim().toLowerCase() === "true";
}

function scorePrediction(match, pred) {
  if (!match || !isFinished(match)) return 0;
  if (!isFilled(pred.pred_home) || !isFilled(pred.pred_away)) return 0;

  const realHome = num(match.home_score);
  const realAway = num(match.away_score);
  const predHome = num(pred.pred_home);
  const predAway = num(pred.pred_away);
  const bonus = isPredictionBonus(pred);

  const isExact = realHome === predHome && realAway === predAway;

  if (isExact) return bonus ? 10 : 5;

  // Jogo bônus: só pontua com placar exato
  if (bonus) return 0;

  const realResult = getMatchResult(realHome, realAway);
  const predResult = getMatchResult(predHome, predAway);
  return realResult === predResult ? 3 : 0;
}

function getPredictionResultStats(match) {
  const preds = getPredictionsForMatch(match.match_id).filter(p => isFilled(p.pred_home) && isFilled(p.pred_away));
  const total = preds.length || 1;
  const home = preds.filter(p => getMatchResult(p.pred_home, p.pred_away) === "home").length;
  const draw = preds.filter(p => getMatchResult(p.pred_home, p.pred_away) === "draw").length;
  const away = preds.filter(p => getMatchResult(p.pred_home, p.pred_away) === "away").length;
  return {
    total: preds.length, home, draw, away,
    homePct: Math.round(home / total * 100),
    drawPct: Math.round(draw / total * 100),
    awayPct: Math.round(away / total * 100)
  };
}

function getMajorityResult(match) {
  const stats = getPredictionResultStats(match);
  return [
    { key: "home", count: stats.home, pct: stats.homePct, label: match.home_team },
    { key: "draw", count: stats.draw, pct: stats.drawPct, label: "Empate" },
    { key: "away", count: stats.away, pct: stats.awayPct, label: match.away_team }
  ].sort((a, b) => b.count - a.count)[0];
}

function avatarColor(name) {
  const colors = ["#38bdf8","#22c55e","#facc15","#a855f7","#f97316","#ef4444","#06b6d4","#84cc16"];
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function renderAvatar(name, size = 34) {
  const color = avatarColor(name);
  const initial = getParticipantInitialByName(name);
  return `<div class="avatar" style="width:${size}px;height:${size}px;background:${color};font-size:${Math.round(size*0.45)}px">${initial}</div>`;
}

function renderAvatarById(participantId, size = 34) {
  const name = getParticipantName(participantId);
  return renderAvatar(name, size);
}

// ==================== NAVEGAÇÃO ====================

function showPage(pageId, btn) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById(pageId).classList.add("active");
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  if (pageId === "charts") setTimeout(renderCharts, 100);
}

// ==================== DOM HELPERS ====================

function setHTML(id, html) { const el = document.getElementById(id); if (el) el.innerHTML = html; }
function setText(id, text) { const el = document.getElementById(id); if (el) el.innerText = text; }

// ==================== MODAL PARTICIPANTE ====================

function openParticipantModal(participantId) {
  const modal = document.getElementById("participantModal");
  const content = document.getElementById("modalContent");
  content.innerHTML = buildParticipantModal(participantId);
  modal.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeParticipantModal(event) {
  if (event && event.target !== document.getElementById("participantModal") && !event.target.classList.contains("modal-close")) return;
  document.getElementById("participantModal").classList.remove("open");
  document.body.style.overflow = "";
}

function buildParticipantModal(participantId) {
  const name = getParticipantName(participantId);
  const rankRow = ranking.find(r => (r.name || r.nickname) === name);
  const position = getRankPosition(participantId);
  const pts = rankRow ? getPoints(rankRow) : 0;
  const exatos = rankRow ? getExactScores(rankRow) : 0;
  const corretos = rankRow ? getCorrectResults(rankRow) : 0;

  const myPredictions = predictions.filter(p => String(p.participant_id) === String(participantId));
  const apostas = myPredictions.length;
  const color = avatarColor(name);
  const initial = getParticipantInitialByName(name);

  const finishedPreds = myPredictions.filter(p => {
    const m = getMatchById(p.match_id);
    return m && isFinished(m);
  });
  const pointsEarned = finishedPreds.reduce((sum, p) => {
    const m = getMatchById(p.match_id);
    return sum + scorePrediction(m, p);
  }, 0);
  // Aproveitamento: bônus vale 10, então max por aposta bônus = 10, normal = 5
  const maxPossible = finishedPreds.reduce((sum, p) => sum + (isPredictionBonus(p) ? 10 : 5), 0);
  const aproveitamento = maxPossible > 0 ? Math.round(pointsEarned / maxPossible * 100) : 0;

  const gameScores = finishedPreds.map(p => {
    const m = getMatchById(p.match_id);
    return { match: m, score: scorePrediction(m, p), bonus: isPredictionBonus(p) };
  }).filter(g => g.match);

  const melhorJogo = gameScores.sort((a, b) => b.score - a.score)[0];
  const mediapts = finishedPreds.length > 0 ? (pointsEarned / finishedPreds.length).toFixed(1) : 0;

  const historicoRows = myPredictions.map(p => {
    const m = getMatchById(p.match_id);
    if (!m) return null;
    const pts = isFinished(m) ? scorePrediction(m, p) : null;
    const bonus = isPredictionBonus(p);
    const bonusTag = bonus ? `<span class="pts-badge pts-bonus">⭐ Bônus</span>` : "";
    const ptsLabel = pts === null
      ? `<span class="pts-badge pts-pending">Em aberto</span>`
      : pts === 10
        ? `<span class="pts-badge pts-bonus">+10 pts ⭐</span>`
        : pts === 5
          ? `<span class="pts-badge pts-5">+5 pts</span>`
          : pts === 3
            ? `<span class="pts-badge pts-3">+3 pts</span>`
            : `<span class="pts-badge pts-0">+0 pts</span>`;

    const homeFlag = m.home_flag || "🏳️";
    const awayFlag = m.away_flag || "🏳️";
    const realScore = isFinished(m) ? `${m.home_score} - ${m.away_score}` : `—`;

    return `
      <tr>
        <td><span class="match-mini">${homeFlag} ${m.home_team} x ${m.away_team} ${awayFlag}${bonus ? " ⭐" : ""}</span></td>
        <td><strong>${p.pred_home || "?"} - ${p.pred_away || "?"}</strong></td>
        <td>${realScore}</td>
        <td>${ptsLabel}</td>
      </tr>
    `;
  }).filter(Boolean).join("");

  const posEmoji = position === 1 ? "🥇" : position === 2 ? "🥈" : position === 3 ? "🥉" : `#${position}`;

  return `
    <div class="modal-header">
      <div class="modal-avatar" style="background:${color};">${initial}</div>
      <div class="modal-title-block">
        <h2>${name}</h2>
        <div class="modal-badges">
          <span class="badge-pill gold">${posEmoji} ${position}º lugar</span>
          <span class="badge-pill blue">${pts} pts totais</span>
        </div>
      </div>
    </div>

    <div class="modal-kpis">
      <div class="modal-kpi">
        <span>Pontos</span>
        <strong>${pts}</strong>
      </div>
      <div class="modal-kpi">
        <span>Placares Exatos</span>
        <strong>${exatos}</strong>
      </div>
      <div class="modal-kpi">
        <span>Resultados</span>
        <strong>${corretos}</strong>
      </div>
      <div class="modal-kpi">
        <span>Apostas</span>
        <strong>${apostas}</strong>
      </div>
      <div class="modal-kpi">
        <span>Aproveit.</span>
        <strong>${aproveitamento}%</strong>
      </div>
      <div class="modal-kpi">
        <span>Média/Jogo</span>
        <strong>${mediapts}</strong>
      </div>
    </div>

    <div class="modal-insights">
      <div class="modal-insight-card">
        <span>⭐ Melhor Aposta</span>
        <strong>${melhorJogo ? `${melhorJogo.match.home_team} x ${melhorJogo.match.away_team}` : "—"}</strong>
        <em>${melhorJogo ? `+${melhorJogo.score} pts${melhorJogo.bonus ? " ⭐ bônus" : ""}` : ""}</em>
      </div>
      <div class="modal-insight-card">
        <span>📊 Média de pontos</span>
        <strong>${mediapts} pts/jogo</strong>
        <em>${finishedPreds.length} jogos pontuados</em>
      </div>
    </div>

    <h3 class="modal-section-title">📋 Histórico de Apostas</h3>
    <div class="modal-table-wrap">
      <table class="modal-table">
        <thead>
          <tr><th>Jogo</th><th>Palpite</th><th>Resultado</th><th>Pontos</th></tr>
        </thead>
        <tbody>${historicoRows || "<tr><td colspan='4' style='color:var(--muted)'>Sem palpites registrados.</td></tr>"}</tbody>
      </table>
    </div>
  `;
}

// ==================== HOME ====================

function renderHome() {
  const leader = ranking[0];
  const finished = matches.filter(isFinished).length;
  const exactTotal = ranking.reduce((sum, r) => sum + getExactScores(r), 0);
  const liveMatches = matches.filter(m => String(m.status || "").toLowerCase() === "live");

  setText("leaderName", leader ? leader.name || leader.nickname || "-" : "-");
  setText("leaderPoints", leader ? `${getPoints(leader)} pts` : "- pts");
  setText("totalParticipants", participants.length);
  setText("finishedMatches", finished);
  setText("exactScores", exactTotal);
  setText("liveStatus", liveMatches.length > 0 ? `${liveMatches.length} jogo(s) agora` : "Nenhum jogo ao vivo");

  renderPodium();
  renderTodayMatches();
  renderBonusMatches();
  renderHomeCuriosities();
}

function renderPodium() {
  const top3 = ranking.slice(0, 3);
  const medals = ["🥇", "🥈", "🥉"];
  const labels = ["Líder", "Segundo", "Terceiro"];
  const sizes = [1, 0.85, 0.85];

  setHTML("top3", top3.map((p, i) => {
    const name = p.name || p.nickname || "-";
    const color = avatarColor(name);
    const initial = getParticipantInitialByName(name);
    const pts = getPoints(p);
    const exatos = getExactScores(p);
    const participantId = p.participant_id;
    return `
      <div class="podium-card ${i === 0 ? 'podium-first' : ''}" onclick="openParticipantModal('${participantId}')">
        <div class="podium-medal">${medals[i]}</div>
        <div class="podium-avatar" style="background:${color};transform:scale(${sizes[i]})">${initial}</div>
        <div class="podium-label">${labels[i]}</div>
        <div class="podium-name">${name}</div>
        <div class="podium-pts">${pts} <small>pts</small></div>
        <div class="podium-exatos">${exatos} exatos</div>
      </div>
    `;
  }).join(""));
}

function renderTodayMatches() {
  const today = getTodayLocal();
  let todayMatches = matches.filter(m => m.date === today);
  if (!todayMatches.length) todayMatches = matches.filter(isFuture).slice(0, 3);
  setHTML("todayMatches",
    todayMatches.length
      ? todayMatches.map(renderPremiumMatchCard).join("")
      : `<div class="empty-state">📭 Nenhum jogo cadastrado para hoje.</div>`
  );
}

function renderPremiumMatchCard(match) {
  const stats = getPredictionResultStats(match);
  const allPreds = getPredictionsForMatch(match.match_id);
  const previewPredictions = allPreds.slice(0, 3);
  const homeFlag = match.home_flag || "🏳️";
  const awayFlag = match.away_flag || "🏳️";
  const matchNum = match.match_id ? `#${match.match_id}` : "";
  const finished = isFinished(match);

  return `
    <div class="premium-match-card ${finished ? 'finished' : ''}">
      <div class="premium-match-head">
        <div class="match-meta-left">
          <span class="match-num">${matchNum}</span>
          ${match.group ? `<span class="match-group">${match.group}</span>` : ""}
        </div>
        <div class="match-meta-right">
          <span class="match-time">${match.time || "-"}</span>
          <span class="match-date">${formatDateBR(match.date)}</span>
        </div>
      </div>

      <div class="premium-versus">
        <div class="team-side">
          <div class="flag-ball">${homeFlag}</div>
          <strong>${match.home_team || "-"}</strong>
        </div>
        <div class="vs-block">
          ${finished
            ? `<div class="score-live">${match.home_score}<span>x</span>${match.away_score}</div>`
            : `<span class="vs-text">VS</span>`
          }
        </div>
        <div class="team-side">
          <div class="flag-ball">${awayFlag}</div>
          <strong>${match.away_team || "-"}</strong>
        </div>
      </div>

      ${previewPredictions.length ? `
      <div class="premium-predictions">
        ${previewPredictions.map(pred => {
          const pts = finished ? scorePrediction(match, pred) : null;
          const bonus = isPredictionBonus(pred);
          const ptsLabel = pts !== null
            ? pts === 10 ? `<span class="pts-badge pts-bonus">+10 ⭐</span>`
            : pts === 5 ? `<span class="pts-badge pts-5">+5</span>`
            : pts === 3 ? `<span class="pts-badge pts-3">+3</span>`
            : `<span class="pts-badge pts-0">+0</span>`
            : bonus ? `<span class="pts-badge pts-bonus">⭐</span>` : `<span class="pts-badge pts-pending">🔒</span>`;
          return `
            <div class="premium-prediction-row">
              ${renderAvatarById(pred.participant_id, 32)}
              <div class="pred-info">
                <small>${getParticipantName(pred.participant_id)}${bonus ? " ⭐" : ""}</small>
                <strong>${pred.pred_home || "?"} - ${pred.pred_away || "?"}</strong>
              </div>
              ${ptsLabel}
            </div>
          `;
        }).join("")}
        ${allPreds.length > 3 ? `<div class="more-preds">+${allPreds.length - 3} mais apostadores</div>` : ""}
      </div>
      ` : `<div class="no-preds">Sem palpites cadastrados.</div>`}

      <div class="majority-box">
        <small>Consenso do bolão · ${stats.total} apostas</small>
        <div class="majority-bar">
          <div style="width:${stats.homePct}%" title="${match.home_team}: ${stats.homePct}%"></div>
          <div style="width:${stats.drawPct}%" title="Empate: ${stats.drawPct}%"></div>
          <div style="width:${stats.awayPct}%" title="${match.away_team}: ${stats.awayPct}%"></div>
        </div>
        <div class="majority-stats">
          <div class="majority-item home-item">
            <span>${homeFlag} ${match.home_team}</span>
            <strong>${stats.homePct}%</strong>
            <em>${stats.home} votos</em>
          </div>
          <div class="majority-item draw-item">
            <span>Empate</span>
            <strong>${stats.drawPct}%</strong>
            <em>${stats.draw} votos</em>
          </div>
          <div class="majority-item away-item">
            <span>${match.away_team} ${awayFlag}</span>
            <strong>${stats.awayPct}%</strong>
            <em>${stats.away} votos</em>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ==================== JOGOS BÔNUS ====================
// Busca match_ids únicos onde algum palpite tem is_bonus = TRUE na aba PREDICTIONS

function getBonusMatchIds() {
  return [...new Set(
    predictions
      .filter(p => isPredictionBonus(p))
      .map(p => p.match_id)
  )];
}

function renderBonusMatches() {
  const bonusMatchIds = getBonusMatchIds();
  const bonus = bonusMatchIds.map(id => getMatchById(id)).filter(Boolean);

  setHTML("bonusMatches",
    bonus.length
      ? bonus.map(renderBonusMatchCard).join("")
      : `<div class="empty-state">📭 Nenhum jogo bônus cadastrado.</div>`
  );
}

function renderBonusMatchCard(match) {
  const homeFlag = match.home_flag || "🏳️";
  const awayFlag = match.away_flag || "🏳️";
  const finished = isFinished(match);

  // Palpites bônus deste jogo
  const bonusPreds = getPredictionsForMatch(match.match_id).filter(isPredictionBonus);
  const exactWinners = finished
    ? bonusPreds.filter(p =>
        num(p.pred_home) === num(match.home_score) &&
        num(p.pred_away) === num(match.away_score)
      ).map(p => getParticipantName(p.participant_id))
    : [];

  return `
    <div class="bonus-card">
      <div class="bonus-card-top">
        <span class="bonus-badge">⭐ Bônus +10pts</span>
        <span class="bonus-date">${formatDateBR(match.date)}</span>
        <span class="bonus-time">${match.time || "-"}</span>
        <span class="status-pill ${finished ? 'status-done' : 'status-future'}">${finished ? "Finalizado" : "Em breve"}</span>
      </div>
      <div class="bonus-teams">
        <div class="bonus-team">
          <span class="bonus-flag">${homeFlag}</span>
          <span>${match.home_team}</span>
        </div>
        <div class="bonus-score">
          ${finished ? `${match.home_score} - ${match.away_score}` : "vs"}
        </div>
        <div class="bonus-team bonus-team-away">
          <span class="bonus-flag">${awayFlag}</span>
          <span>${match.away_team}</span>
        </div>
      </div>
      ${match.group ? `<div class="bonus-group">${match.group}</div>` : ""}
      ${finished && exactWinners.length
        ? `<div class="bonus-winners">🎯 Cravaram: <strong>${exactWinners.join(", ")}</strong></div>`
        : finished
          ? `<div class="bonus-winners muted">Ninguém cravou o placar exato.</div>`
          : `<div class="bonus-winners muted">⭐ Placar exato vale 10 pts neste jogo!</div>`
      }
    </div>
  `;
}

function renderHomeCuriosities() {
  const topExato = [...ranking].sort((a, b) => getExactScores(b) - getExactScores(a))[0];
  const topCorrect = [...ranking].sort((a, b) => getCorrectResults(b) - getCorrectResults(a))[0];
  const topPredictions = getTopPredictionVolume();
  const consensus = getHighestConsensus();
  const balanced = getMostBalancedMatch();
  const commonScore = getCommonScore();

  let bestAproveitamento = null;
  ranking.forEach(r => {
    const name = r.name || r.nickname;
    const participantId = participants.find(p => (p.name || p.nickname) === name)?.participant_id;
    if (!participantId) return;
    const myPreds = predictions.filter(p => String(p.participant_id) === String(participantId));
    const finished = myPreds.filter(p => { const m = getMatchById(p.match_id); return m && isFinished(m); });
    const earned = finished.reduce((sum, p) => { const m = getMatchById(p.match_id); return sum + scorePrediction(m, p); }, 0);
    const max = finished.reduce((sum, p) => sum + (isPredictionBonus(p) ? 10 : 5), 0);
    const pct = max > 0 ? Math.round(earned / max * 100) : 0;
    if (!bestAproveitamento || pct > bestAproveitamento.pct) {
      bestAproveitamento = { name, pct };
    }
  });

  const zebra = getBiggestZebra();

  setHTML("homeCuriosities", `
    ${topExato ? `
    <div class="curiosity-card curiosity-gold" onclick="openParticipantModal('${participants.find(p=>(p.name||p.nickname)===(topExato.name||topExato.nickname))?.participant_id||''}')">
      <div class="curiosity-icon">🎯</div>
      <div>
        <span>Maior Cravador</span>
        <strong>${topExato.name || topExato.nickname}</strong>
        <b>${getExactScores(topExato)}</b>
        <small>placares exatos</small>
      </div>
    </div>` : ""}

    ${topCorrect ? `
    <div class="curiosity-card curiosity-blue" onclick="openParticipantModal('${participants.find(p=>(p.name||p.nickname)===(topCorrect.name||topCorrect.nickname))?.participant_id||''}')">
      <div class="curiosity-icon">✅</div>
      <div>
        <span>Rei do Resultado</span>
        <strong>${topCorrect.name || topCorrect.nickname}</strong>
        <b>${getCorrectResults(topCorrect)}</b>
        <small>resultados corretos</small>
      </div>
    </div>` : ""}

    ${bestAproveitamento ? `
    <div class="curiosity-card curiosity-green">
      <div class="curiosity-icon">📈</div>
      <div>
        <span>Melhor Aproveitamento</span>
        <strong>${bestAproveitamento.name}</strong>
        <b>${bestAproveitamento.pct}%</b>
        <small>de acertos</small>
      </div>
    </div>` : ""}

    ${topPredictions ? `
    <div class="curiosity-card curiosity-purple">
      <div class="curiosity-icon">📝</div>
      <div>
        <span>Mais Apostas</span>
        <strong>${topPredictions.name}</strong>
        <b>${topPredictions.count}</b>
        <small>palpites enviados</small>
      </div>
    </div>` : ""}

    ${zebra ? `
    <div class="curiosity-card curiosity-red">
      <div class="curiosity-icon">🦓</div>
      <div>
        <span>Zebra do Bolão</span>
        <strong>${zebra.match.home_team} x ${zebra.match.away_team}</strong>
        <b>${zebra.pct}%</b>
        <small>apostaram no resultado real</small>
      </div>
    </div>` : ""}

    ${balanced ? `
    <div class="curiosity-card curiosity-orange">
      <div class="curiosity-icon">⚖️</div>
      <div>
        <span>Jogo Mais Disputado</span>
        <strong>${balanced.match.home_team} x ${balanced.match.away_team}</strong>
        <b>${balanced.balance}%</b>
        <small>equilíbrio nos palpites</small>
      </div>
    </div>` : ""}

    ${commonScore ? `
    <div class="curiosity-card curiosity-teal">
      <div class="curiosity-icon">🔢</div>
      <div>
        <span>Placar Mais Comum</span>
        <strong>${commonScore.score}</strong>
        <b>${commonScore.count}x</b>
        <small>${commonScore.names}</small>
      </div>
    </div>` : ""}
  `);
}

function getTopPredictionVolume() {
  const volume = {};
  predictions.forEach(pred => {
    const id = pred.participant_id;
    volume[id] = (volume[id] || 0) + 1;
  });
  const sorted = Object.entries(volume).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return null;
  return { participantId: sorted[0][0], name: getParticipantName(sorted[0][0]), count: sorted[0][1] };
}

function getHighestConsensus() {
  const data = matches.map(match => {
    const majority = getMajorityResult(match);
    return { match, pct: majority ? majority.pct : 0, count: majority ? majority.count : 0 };
  }).filter(d => d.count > 0);
  return data.sort((a, b) => b.pct - a.pct)[0] || null;
}

function getMostBalancedMatch() {
  const data = matches.map(match => {
    const stats = getPredictionResultStats(match);
    if (!stats.total) return null;
    const values = [stats.homePct, stats.drawPct, stats.awayPct];
    return { match, balance: 100 - (Math.max(...values) - Math.min(...values)) };
  }).filter(Boolean);
  return data.sort((a, b) => b.balance - a.balance)[0] || null;
}

function getCommonScore() {
  const scoreCount = {};
  const scoreNames = {};
  predictions.forEach(pred => {
    if (!isFilled(pred.pred_home) || !isFilled(pred.pred_away)) return;
    const key = `${num(pred.pred_home)} - ${num(pred.pred_away)}`;
    scoreCount[key] = (scoreCount[key] || 0) + 1;
    if (!scoreNames[key]) scoreNames[key] = [];
    if (scoreNames[key].length < 3) scoreNames[key].push(getParticipantName(pred.participant_id));
  });
  const top = Object.entries(scoreCount).sort((a, b) => b[1] - a[1])[0];
  if (!top) return null;
  return { score: top[0], count: top[1], names: scoreNames[top[0]].join(", ") };
}

// ==================== RANKING ====================

function renderRanking() {
  const maxPts = ranking.length ? getPoints(ranking[0]) : 1;
  setHTML("rankingBody", ranking.map((r, index) => {
    const name = r.name || r.nickname || "-";
    const pts = getPoints(r);
    const exatos = getExactScores(r);
    const corretos = getCorrectResults(r);
    const participantId = r.participant_id || participants.find(p => (p.name || p.nickname) === name)?.participant_id;
    const myPreds = predictions.filter(p => String(p.participant_id) === String(participantId));
    const finishedPreds = myPreds.filter(p => { const m = getMatchById(p.match_id); return m && isFinished(m); });
    const earned = finishedPreds.reduce((sum, p) => { const m = getMatchById(p.match_id); return sum + scorePrediction(m, p); }, 0);
    const maxP = finishedPreds.reduce((sum, p) => sum + (isPredictionBonus(p) ? 10 : 5), 0);
    const aprv = maxP > 0 ? Math.round(earned / maxP * 100) : 0;
    const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}`;
    const barWidth = maxPts > 0 ? Math.round(pts / maxPts * 100) : 0;
    return `
      <tr class="ranking-row ${index < 3 ? 'top-row' : ''}" onclick="openParticipantModal('${participantId}')">
        <td class="rank-pos">${medal}</td>
        <td>
          <div class="table-player">
            ${renderAvatar(name, 36)}
            <div>
              <strong>${name}</strong>
              <div class="pts-bar-wrap"><div class="pts-bar" style="width:${barWidth}%"></div></div>
            </div>
          </div>
        </td>
        <td class="green-number">${pts}</td>
        <td class="yellow-number">${exatos}</td>
        <td class="blue-number">${corretos}</td>
        <td><span class="aprv-pill">${aprv}%</span></td>
      </tr>
    `;
  }).join(""));
}

// ==================== JOGOS ====================

function filterMatches(filter, btn) {
  currentMatchFilter = filter;
  document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  renderMatches();
}

function renderMatches() {
  let filtered = matches;
  if (currentMatchFilter === "finished") filtered = matches.filter(isFinished);
  if (currentMatchFilter === "future") filtered = matches.filter(isFuture);
  setHTML("matchesList", filtered.map(renderMatchCard).join(""));
}

function renderMatchCard(match) {
  const homeScore = isFilled(match.home_score) ? match.home_score : "-";
  const awayScore = isFilled(match.away_score) ? match.away_score : "-";
  const homeFlag = match.home_flag || "🏳️";
  const awayFlag = match.away_flag || "🏳️";
  const finished = isFinished(match);
  const isBonus = getBonusMatchIds().includes(String(match.match_id));

  return `
    <div class="match-card ${finished ? 'match-finished' : 'match-future'}">
      <div class="match-card-header">
        <span class="badge ${finished ? 'badge-done' : 'badge-future'}">${finished ? "✅ Finalizado" : "🕐 Futuro"}</span>
        ${isBonus ? `<span class="badge badge-bonus">⭐ Bônus</span>` : ""}
        <span class="match-card-meta">${formatDateBR(match.date)} · ${match.time || "-"}${match.group ? " · " + match.group : ""}</span>
      </div>
      <div class="match-card-score">
        <span>${homeFlag} ${match.home_team}</span>
        <div class="match-score-center">
          ${finished ? `<span class="big-score">${homeScore} — ${awayScore}</span>` : `<span class="vs-label">vs</span>`}
        </div>
        <span class="team-away">${match.away_team} ${awayFlag}</span>
      </div>
      ${renderPredictionSummary(match)}
    </div>
  `;
}

function renderPredictionSummary(match) {
  const preds = getPredictionsForMatch(match.match_id);
  if (!preds.length) return `<div class="match-no-preds">Sem palpites cadastrados.</div>`;
  if (!isFinished(match)) return `<div class="match-locked">🔒 Palpites revelados após o jogo.</div>`;
  const stats = getPredictionResultStats(match);
  return `
    <div class="match-consensus">
      <div class="consensus-bar-mini">
        <div style="width:${stats.homePct}%" class="cb-home" title="${match.home_team}"></div>
        <div style="width:${stats.drawPct}%" class="cb-draw" title="Empate"></div>
        <div style="width:${stats.awayPct}%" class="cb-away" title="${match.away_team}"></div>
      </div>
      <div class="consensus-labels">
        <span>${match.home_team} ${stats.homePct}%</span>
        <span>Empate ${stats.drawPct}%</span>
        <span>${match.away_team} ${stats.awayPct}%</span>
      </div>
    </div>
  `;
}

// ==================== PALPITES ====================

function renderPredictions() {
  const grouped = {};
  predictions.forEach(pred => {
    if (!grouped[pred.match_id]) grouped[pred.match_id] = [];
    grouped[pred.match_id].push(pred);
  });

  setHTML("predictionsList", Object.keys(grouped).map(matchId => {
    const match = getMatchById(matchId);
    if (!match) return "";

    if (!isFinished(match)) {
      return `
        <div class="match-card match-locked-card">
          <div class="match-card-header">
            <span class="badge badge-future">🕐 ${match.date || "-"}</span>
          </div>
          <div class="match-card-score">
            <span>${match.home_flag || "🏳️"} ${match.home_team}</span>
            <span class="vs-label">vs</span>
            <span>${match.away_team} ${match.away_flag || "🏳️"}</span>
          </div>
          <div class="match-locked">🔒 Palpites bloqueados até o fim da partida.</div>
        </div>
      `;
    }

    const cards = grouped[matchId].map(pred => {
      const pts = scorePrediction(match, pred);
      const bonus = isPredictionBonus(pred);
      const ptsLabel = pts === 10
        ? `<span class="pts-badge pts-bonus">+10 ⭐</span>`
        : pts === 5
          ? `<span class="pts-badge pts-5">+5 pts</span>`
          : pts === 3
            ? `<span class="pts-badge pts-3">+3 pts</span>`
            : `<span class="pts-badge pts-0">+0 pts</span>`;
      return `
        <div class="prediction-row" onclick="openParticipantModal('${pred.participant_id}')">
          ${renderAvatarById(pred.participant_id, 36)}
          <div class="pred-details">
            <strong>${getParticipantName(pred.participant_id)}${bonus ? " ⭐" : ""}</strong>
            <span>${match.home_flag || "🏳️"} ${match.home_team} <b>${pred.pred_home}</b> - <b>${pred.pred_away}</b> ${match.away_team} ${match.away_flag || "🏳️"}</span>
          </div>
          ${ptsLabel}
        </div>
      `;
    }).join("");

    const isBonusMatch = grouped[matchId].some(isPredictionBonus);

    return `
      <div class="match-card match-finished">
        <div class="match-card-header">
          <span class="badge badge-done">✅ Finalizado</span>
          ${isBonusMatch ? `<span class="badge badge-bonus">⭐ Bônus</span>` : ""}
          <span class="match-card-meta">${formatDateBR(match.date)}</span>
        </div>
        <div class="match-card-score">
          <span>${match.home_flag || "🏳️"} ${match.home_team}</span>
          <span class="big-score">${match.home_score} — ${match.away_score}</span>
          <span class="team-away">${match.away_team} ${match.away_flag || "🏳️"}</span>
        </div>
        <div class="predictions-list">${cards}</div>
      </div>
    `;
  }).join(""));
}

// ==================== ESTATÍSTICAS ====================

function renderStats() {
  const totalPoints = ranking.reduce((sum, r) => sum + getPoints(r), 0);
  const avgPoints = ranking.length ? Math.round(totalPoints / ranking.length) : 0;
  const totalPredictions = predictions.length;
  const finished = matches.filter(isFinished).length;
  const exactTotal = ranking.reduce((sum, r) => sum + getExactScores(r), 0);
  const bonusPreds = predictions.filter(isPredictionBonus).length;

  setHTML("statsContent", `
    <div class="kpi">
      <span>🎯 Palpites Totais</span>
      <strong>${totalPredictions}</strong>
      <small>registrados</small>
    </div>
    <div class="kpi">
      <span>📊 Média de Pontos</span>
      <strong>${avgPoints}</strong>
      <small>por participante</small>
    </div>
    <div class="kpi">
      <span>⚽ Jogos Cadastrados</span>
      <strong>${matches.length}</strong>
      <small>total</small>
    </div>
    <div class="kpi">
      <span>✅ Finalizados</span>
      <strong>${finished}</strong>
      <small>com resultado</small>
    </div>
    <div class="kpi">
      <span>🔮 Cravadas</span>
      <strong>${exactTotal}</strong>
      <small>placares exatos</small>
    </div>
    <div class="kpi">
      <span>⭐ Palpites Bônus</span>
      <strong>${bonusPreds}</strong>
      <small>registrados</small>
    </div>
  `);

  renderAccuracyBoards();
  renderSpecialInsights();
  renderComebackTable();
}

function renderAccuracyBoards() {
  const exact = [...ranking].sort((a, b) => getExactScores(b) - getExactScores(a)).slice(0, 8);
  const simple = [...ranking].sort((a, b) => getCorrectResults(b) - getCorrectResults(a)).slice(0, 8);
  const maxExact = exact.length ? getExactScores(exact[0]) : 1;
  const maxSimple = simple.length ? getCorrectResults(simple[0]) : 1;

  setHTML("accuracyBoards", `
    <div class="ranking-board">
      <h3>🎯 Placares Exatos</h3>
      ${exact.map((p, i) => renderMiniRankRow(p.name || p.nickname, getExactScores(p), "cravadas", i, maxExact,
        participants.find(par => (par.name || par.nickname) === (p.name || p.nickname))?.participant_id
      )).join("")}
    </div>
    <div class="ranking-board">
      <h3>✅ Resultados Simples</h3>
      ${simple.map((p, i) => renderMiniRankRow(p.name || p.nickname, getCorrectResults(p), "acertos", i, maxSimple,
        participants.find(par => (par.name || par.nickname) === (p.name || p.nickname))?.participant_id
      )).join("")}
    </div>
  `);
}

function renderMiniRankRow(name, value, label, index, maxValue, participantId) {
  const barWidth = maxValue > 0 ? Math.round(value / maxValue * 100) : 0;
  return `
    <div class="mini-rank-row ${participantId ? 'clickable' : ''}" ${participantId ? `onclick="openParticipantModal('${participantId}')"` : ""}>
      <div class="mini-rank-pos">${index + 1}</div>
      ${renderAvatar(name, 32)}
      <div class="mini-rank-info">
        <strong>${name || "-"}</strong>
        <div class="mini-bar-wrap"><div class="mini-bar" style="width:${barWidth}%"></div></div>
      </div>
      <div class="mini-rank-val">
        <b>${value}</b>
        <small>${label}</small>
      </div>
    </div>
  `;
}

function renderSpecialInsights() {
  const zebra = getBiggestZebra();
  const bestGame = getBestPointsGame();
  setHTML("specialInsights", `
    <div class="insight-card green">
      <div class="insight-icon">🦓</div>
      <div>
        <span>Maior Zebra Acertada</span>
        <strong>${zebra ? `${zebra.match.home_flag || ""} ${zebra.match.home_team} ${zebra.match.home_score} – ${zebra.match.away_score} ${zebra.match.away_team} ${zebra.match.away_flag || ""}` : "—"}</strong>
        <small>${zebra ? `Apenas ${zebra.pct}% apostaram em ${zebra.resultLabel}. ${zebra.exactNames || "Ninguém cravou o placar."}` : "Ainda sem jogos suficientes."}</small>
      </div>
    </div>
    <div class="insight-card blue">
      <div class="insight-icon">💎</div>
      <div>
        <span>Jogo Que Mais Rendeu</span>
        <strong>${bestGame ? `${bestGame.match.home_flag || ""} ${bestGame.match.home_team} ${bestGame.match.home_score} – ${bestGame.match.away_score} ${bestGame.match.away_team} ${bestGame.match.away_flag || ""}` : "—"}</strong>
        <small>${bestGame ? `Os apostadores somaram ${bestGame.points} pontos nesse jogo.` : "Ainda sem jogos finalizados."}</small>
      </div>
    </div>
  `);
}

function getBiggestZebra() {
  const finished = matches.filter(isFinished);
  return finished.map(match => {
    const stats = getPredictionResultStats(match);
    if (!stats.total) return null;
    const realResult = getMatchResult(match.home_score, match.away_score);
    const resultCount = realResult === "home" ? stats.home : realResult === "draw" ? stats.draw : stats.away;
    const pct = Math.round(resultCount / stats.total * 100);
    const exactNames = getPredictionsForMatch(match.match_id)
      .filter(p => num(p.pred_home) === num(match.home_score) && num(p.pred_away) === num(match.away_score))
      .map(p => getParticipantName(p.participant_id)).slice(0, 3).join(", ");
    return { match, pct, resultLabel: getResultLabel(realResult, match), exactNames: exactNames ? `${exactNames} cravou/cravaram o placar.` : "" };
  }).filter(Boolean).sort((a, b) => a.pct - b.pct)[0] || null;
}

function getBestPointsGame() {
  const data = matches.filter(isFinished).map(match => {
    const points = getPredictionsForMatch(match.match_id).reduce((sum, pred) => sum + scorePrediction(match, pred), 0);
    return { match, points };
  });
  return data.sort((a, b) => b.points - a.points)[0] || null;
}

function renderComebackTable() {
  const remaining = matches.filter(isFuture).length;
  const leaderPoints = ranking.length ? getPoints(ranking[0]) : 0;
  // Pontos disponíveis: jogos normais = 5pts max, bônus = 10pts max
  // Como não sabemos quais dos futuros serão bônus para cada participante,
  // usamos o máximo possível por jogo futuro (conservador: 5pts)
  setHTML("comebackTable", `
    <table>
      <thead>
        <tr>
          <th>Apostador</th>
          <th>Pontos</th>
          <th>Possíveis</th>
          <th>Máximo</th>
          <th>Chance</th>
        </tr>
      </thead>
      <tbody>
        ${ranking.slice(0, 12).map(p => {
          const current = getPoints(p);
          const available = remaining * 5;
          const max = current + available;
          const chance = max <= 0 ? 0 : Math.min(99, Math.max(1, Math.round((current / Math.max(leaderPoints, 1)) * 55 + (available > 0 ? 5 : 0))));
          const name = p.name || p.nickname || "-";
          const participantId = p.participant_id || participants.find(par => (par.name || par.nickname) === name)?.participant_id;
          return `
            <tr class="clickable" onclick="openParticipantModal('${participantId}')">
              <td>
                <div class="table-player">
                  ${renderAvatar(name, 34)}
                  <strong>${name}</strong>
                </div>
              </td>
              <td class="green-number">${current}</td>
              <td class="yellow-number">${available}</td>
              <td>${max}</td>
              <td><span class="chance-pill">${chance}%</span></td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `);
}

// ==================== GRÁFICOS ====================

let chartsRendered = false;

function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

function createChart(id, config) {
  destroyChart(id);
  const ctx = document.getElementById(id);
  if (!ctx || typeof Chart === "undefined") return;
  charts[id] = new Chart(ctx, config);
}

function baseChartOptions(extra = {}) {
  return {
    responsive: true,
    plugins: {
      legend: { labels: { color: "#dbeafe", font: { family: "Inter" } } }
    },
    scales: {
      x: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(148,163,184,0.1)" } },
      y: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(148,163,184,0.1)" } }
    },
    ...extra
  };
}

function renderCharts() {
  if (chartsRendered) {
    Object.values(charts).forEach(c => c && c.destroy && c.destroy());
    charts = {};
  }
  renderPointsChart();
  renderExactChart();
  renderCorrectChart();
  renderPredictionResultChart();
  renderMatchStatusChart();
  renderPointsExactChart();
  renderPredictionVolumeChart();
  renderFinishedGoalsChart();
  renderTopCountriesChart();
  renderTopResultsChart();
  chartsRendered = true;
}

function getTopRanking(limit = 15) { return ranking.slice(0, limit); }

function renderPointsChart() {
  const data = getTopRanking();
  createChart("pointsChart", {
    type: "bar",
    data: {
      labels: data.map(p => p.name || p.nickname || "-"),
      datasets: [{ label: "Pontos", data: data.map(p => getPoints(p)), backgroundColor: "#22c55e", borderColor: "#86efac", borderWidth: 1, borderRadius: 6 }]
    },
    options: baseChartOptions({ plugins: { legend: { display: false } } })
  });
}

function renderExactChart() {
  const data = getTopRanking();
  createChart("exactChart", {
    type: "bar",
    data: {
      labels: data.map(p => p.name || p.nickname || "-"),
      datasets: [{ label: "Placares exatos", data: data.map(p => getExactScores(p)), backgroundColor: "#facc15", borderColor: "#fde68a", borderWidth: 1, borderRadius: 6 }]
    },
    options: baseChartOptions({ indexAxis: "y", plugins: { legend: { display: false } } })
  });
}

function renderCorrectChart() {
  const data = getTopRanking();
  createChart("correctChart", {
    type: "bar",
    data: {
      labels: data.map(p => p.name || p.nickname || "-"),
      datasets: [{ label: "Acertos", data: data.map(p => getCorrectResults(p)), backgroundColor: "#38bdf8", borderColor: "#bae6fd", borderWidth: 1, borderRadius: 6 }]
    },
    options: baseChartOptions({ plugins: { legend: { display: false } } })
  });
}

function renderPredictionResultChart() {
  let home = 0, draw = 0, away = 0;
  predictions.forEach(p => {
    if (!isFilled(p.pred_home) || !isFilled(p.pred_away)) return;
    const r = getMatchResult(p.pred_home, p.pred_away);
    if (r === "home") home++;
    if (r === "draw") draw++;
    if (r === "away") away++;
  });
  createChart("predictionResultChart", {
    type: "doughnut",
    data: {
      labels: ["Mandante", "Empate", "Visitante"],
      datasets: [{ data: [home, draw, away], backgroundColor: ["#22c55e", "#facc15", "#3b82f6"], borderColor: "#0f1d33", borderWidth: 3 }]
    },
    options: { responsive: true, plugins: { legend: { labels: { color: "#dbeafe" } } } }
  });
}

function renderMatchStatusChart() {
  const statusCount = {};
  matches.forEach(m => {
    const s = m.status || "future";
    statusCount[s] = (statusCount[s] || 0) + 1;
  });
  createChart("matchStatusChart", {
    type: "pie",
    data: {
      labels: Object.keys(statusCount),
      datasets: [{ data: Object.values(statusCount), backgroundColor: ["#22c55e", "#facc15", "#3b82f6", "#ef4444"], borderColor: "#0f1d33", borderWidth: 3 }]
    },
    options: { responsive: true, plugins: { legend: { labels: { color: "#dbeafe" } } } }
  });
}

function renderPointsExactChart() {
  const data = getTopRanking();
  createChart("pointsExactChart", {
    type: "scatter",
    data: {
      datasets: [{
        label: "Participantes",
        data: data.map(p => ({ x: getExactScores(p), y: getPoints(p), label: p.name || p.nickname })),
        backgroundColor: "#facc15", borderColor: "#fde68a", pointRadius: 7, pointHoverRadius: 10
      }]
    },
    options: baseChartOptions({
      scales: {
        x: { title: { display: true, text: "Placares exatos", color: "#dbeafe" }, ticks: { color: "#94a3b8" }, grid: { color: "rgba(148,163,184,0.1)" } },
        y: { title: { display: true, text: "Pontos", color: "#dbeafe" }, ticks: { color: "#94a3b8" }, grid: { color: "rgba(148,163,184,0.1)" } }
      }
    })
  });
}

function renderPredictionVolumeChart() {
  const volume = {};
  predictions.forEach(pred => {
    const name = getParticipantName(pred.participant_id);
    volume[name] = (volume[name] || 0) + 1;
  });
  const data = Object.entries(volume).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 15);
  createChart("predictionVolumeChart", {
    type: "bar",
    data: {
      labels: data.map(d => d.name),
      datasets: [{ label: "Palpites enviados", data: data.map(d => d.count), backgroundColor: "#a855f7", borderColor: "#d8b4fe", borderWidth: 1, borderRadius: 6 }]
    },
    options: baseChartOptions({ indexAxis: "y", plugins: { legend: { display: false } } })
  });
}

function renderFinishedGoalsChart() {
  const fin = matches.filter(isFinished);
  createChart("finishedGoalsChart", {
    type: "line",
    data: {
      labels: fin.map(m => `${m.home_team} x ${m.away_team}`),
      datasets: [{
        label: "Gols na partida",
        data: fin.map(m => num(m.home_score) + num(m.away_score)),
        borderColor: "#22c55e", backgroundColor: "rgba(34,197,94,0.15)", tension: 0.35, fill: true,
        pointBackgroundColor: "#22c55e", pointRadius: 5
      }]
    },
    options: baseChartOptions()
  });
}

function renderTopCountriesChart() {
  const teamCount = {};
  predictions.forEach(pred => {
    const match = getMatchById(pred.match_id);
    if (!match || !isFilled(pred.pred_home) || !isFilled(pred.pred_away)) return;
    const result = getMatchResult(pred.pred_home, pred.pred_away);
    let winner;
    if (result === "home") winner = match.home_team;
    else if (result === "away") winner = match.away_team;
    else winner = "Empate";
    if (winner !== "Empate") teamCount[winner] = (teamCount[winner] || 0) + 1;
  });
  const data = Object.entries(teamCount).sort((a, b) => b[1] - a[1]).slice(0, 10);
  createChart("topCountriesChart", {
    type: "bar",
    data: {
      labels: data.map(d => d[0]),
      datasets: [{ label: "Vezes apostada como vencedora", data: data.map(d => d[1]), backgroundColor: "#f97316", borderColor: "#fdba74", borderWidth: 1, borderRadius: 6 }]
    },
    options: baseChartOptions({ plugins: { legend: { display: false } } })
  });
}

function renderTopResultsChart() {
  const scoreCount = {};
  predictions.forEach(pred => {
    if (!isFilled(pred.pred_home) || !isFilled(pred.pred_away)) return;
    const key = `${num(pred.pred_home)}-${num(pred.pred_away)}`;
    scoreCount[key] = (scoreCount[key] || 0) + 1;
  });
  const data = Object.entries(scoreCount).sort((a, b) => b[1] - a[1]).slice(0, 10);
  createChart("topResultsChart", {
    type: "bar",
    data: {
      labels: data.map(d => d[0].replace("-", " x ")),
      datasets: [{ label: "Vezes apostado", data: data.map(d => d[1]), backgroundColor: "#06b6d4", borderColor: "#67e8f9", borderWidth: 1, borderRadius: 6 }]
    },
    options: baseChartOptions({ plugins: { legend: { display: false } } })
  });
}

// ==================== INIT ====================

async function init() {
  try {
    [participants, matches, predictions, ranking] = await Promise.all([
      fetchCsv(SHEETS.PARTICIPANTS, "Participantes"),
      fetchCsv(SHEETS.MATCHES, "Jogos"),
      fetchCsv(SHEETS.PREDICTIONS, "Palpites"),
      fetchCsv(SHEETS.RANKING, "Ranking")
    ]);

    ranking = ranking.sort((a, b) => getPoints(b) - getPoints(a));

    renderHome();
    renderRanking();
    renderMatches();
    renderPredictions();
    renderStats();

    setText("lastUpdated", new Date().toLocaleString("pt-BR"));
  } catch (error) {
    console.error(error);
    document.body.innerHTML = `
      <div style="display:grid;place-items:center;min-height:100vh;font-family:Inter,sans-serif;background:#07111f;color:#f8fafc;text-align:center;padding:40px">
        <div>
          <div style="font-size:64px;margin-bottom:24px">⚠️</div>
          <h1 style="margin:0 0 12px">Erro ao carregar o bolão</h1>
          <p style="color:#94a3b8;margin-bottom:24px">${error.message}</p>
          <button onclick="location.reload()" style="background:#38bdf8;color:#07111f;border:none;padding:12px 28px;border-radius:999px;font-size:16px;font-weight:700;cursor:pointer">Tentar novamente</button>
        </div>
      </div>
    `;
  }
}

init();
setInterval(init, 300000);
