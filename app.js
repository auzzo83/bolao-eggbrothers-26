// ==================== CONFIGURAÇÃO ====================

const SHEETS = {
  PARTICIPANTS: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRqE3kkDDcPtqpGJ3PguUDsikJMNFbm0zdl9AJeK6e-_egbJmgYX29r50ESGoFqV0qe_aToL4aNgbBh/pub?gid=496109362&single=true&output=csv",
  MATCHES: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRqE3kkDDcPtqpGJ3PguUDsikJMNFbm0zdl9AJeK6e-_egbJmgYX29r50ESGoFqV0qe_aToL4aNgbBh/pub?gid=606750094&single=true&output=csv",
  PREDICTIONS: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRqE3kkDDcPtqpGJ3PguUDsikJMNFbm0zdl9AJeK6e-_egbJmgYX29r50ESGoFqV0qe_aToL4aNgbBh/pub?gid=1378690055&single=true&output=csv",
  RANKING: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRqE3kkDDcPtqpGJ3PguUDsikJMNFbm0zdl9AJeK6e-_egbJmgYX29r50ESGoFqV0qe_aToL4aNgbBh/pub?gid=379623986&single=true&output=csv"
};

const LIVE_CONFIG = {
  JSON_URL: "data/live-scores.json",
  MAX_STALE_MINUTES: 20
};

// ==================== ESTADO GLOBAL ====================

let participants = [];
let matches = [];
let predictions = [];
let ranking = [];
let charts = {};
let currentMatchFilter = "all";
let rankingSearch = "";
let liveScoreMeta = null;

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

async function fetchLiveScores() {
  try {
    const response = await fetch(`${LIVE_CONFIG.JSON_URL}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Status ${response.status}`);
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.fixtures)) throw new Error("JSON sem fixtures.");
    return payload;
  } catch (error) {
    console.info("Placares ao vivo indisponíveis:", error.message);
    return null;
  }
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

function normalizeName(value) {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(united states|usa|us|estados unidos|eua)\b/g, "usa")
    .replace(/\b(south korea|korea republic|coreia do sul)\b/g, "korea republic")
    .replace(/\b(czechia|czech republic|republica tcheca)\b/g, "czechia")
    .replace(/\b(cape verde|cabo verde|cape verde islands)\b/g, "cape verde")
    .replace(/\b(turkiye|turkey|turquia)\b/g, "turkiye")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const aliases = {
    "austria": "austria",
    "jordania": "jordan",
    "jordan": "jordan",
    "rd congo": "congo dr",
    "dr congo": "congo dr",
    "congo dr": "congo dr",
    "inglaterra": "england",
    "england": "england",
    "croacia": "croatia",
    "croatia": "croatia",
    "suica": "switzerland",
    "switzerland": "switzerland",
    "bosnia": "bosnia and herzegovina",
    "bosnia and herzegovina": "bosnia and herzegovina",
    "republica tcheca": "czechia",
    "czech republic": "czechia",
    "africa do sul": "south africa",
    "south africa": "south africa",
    "coreia do sul": "korea republic",
    "south korea": "korea republic",
    "eua": "usa",
    "united states": "usa",
    "escocia": "scotland",
    "scotland": "scotland",
    "marrocos": "morocco",
    "morocco": "morocco",
    "turquia": "turkiye",
    "paraguai": "paraguay",
    "holanda": "netherlands",
    "netherlands": "netherlands",
    "suecia": "sweden",
    "sweden": "sweden",
    "alemanha": "germany",
    "germany": "germany",
    "costa do marfim": "ivory coast",
    "ivory coast": "ivory coast",
    "curacao": "curacao",
    "japao": "japan",
    "japan": "japan",
    "espanha": "spain",
    "spain": "spain",
    "arabia saudita": "saudi arabia",
    "saudi arabia": "saudi arabia",
    "belgica": "belgium",
    "belgium": "belgium",
    "ira": "iran",
    "iran": "iran",
    "cabo verde": "cape verde",
    "nova zelandia": "new zealand",
    "new zealand": "new zealand",
    "egito": "egypt",
    "egypt": "egypt",
    "iraque": "iraq",
    "iraq": "iraq"
  };
  return aliases[normalized] || normalized;
}

function sameTeam(a, b) {
  const left = normalizeName(a);
  const right = normalizeName(b);
  return left && right && (left === right || left.includes(right) || right.includes(left));
}

function isApiFinished(status) {
  return ["FT", "AET", "PEN"].includes(String(status || "").toUpperCase());
}

function isApiLive(status) {
  return ["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE"].includes(String(status || "").toUpperCase());
}

function minutesSince(isoDate) {
  if (!isoDate) return Infinity;
  const diff = Date.now() - new Date(isoDate).getTime();
  return Math.round(diff / 60000);
}

function findLiveFixture(match, fixtures) {
  return fixtures.find(item => {
    const dateOk = !match.date || !item.date || String(item.date).slice(0, 10) === String(match.date).slice(0, 10);
    const homeOk = sameTeam(match.home_team, item.home_team);
    const awayOk = sameTeam(match.away_team, item.away_team);
    return dateOk && homeOk && awayOk;
  });
}

function applyLiveScores(payload) {
  liveScoreMeta = payload ? payload.meta || {} : null;
  if (!payload || !Array.isArray(payload.fixtures)) {
    setText("liveStatus", "Nenhum jogo ao vivo");
    return;
  }

  const staleMinutes = minutesSince(payload.meta && payload.meta.updated_at);
  const fresh = staleMinutes <= LIVE_CONFIG.MAX_STALE_MINUTES;
  let liveCount = 0;
  let matchedCount = 0;

  matches = matches.map(match => {
    const fixture = findLiveFixture(match, payload.fixtures);
    if (!fixture) return match;

    matchedCount++;
    if (isApiLive(fixture.status_short)) liveCount++;

    const liveStatus = isApiFinished(fixture.status_short)
      ? "finished"
      : isApiLive(fixture.status_short)
        ? "live"
        : match.status;

    return {
      ...match,
      api_fixture_id: fixture.fixture_id,
      live_status: fixture.status_short || fixture.status || "",
      live_elapsed: fixture.elapsed || "",
      live_updated_at: payload.meta && payload.meta.updated_at,
      home_score: isFilled(fixture.home_score) ? fixture.home_score : match.home_score,
      away_score: isFilled(fixture.away_score) ? fixture.away_score : match.away_score,
      status: liveStatus
    };
  });

  if (liveCount) {
    setText("liveStatus", `${liveCount} jogo(s) agora`);
  } else if (fresh || liveScoreMeta.source === "api-football") {
    setText("liveStatus", "Nenhum jogo ao vivo");
  } else {
    setText("liveStatus", "Atualizando");
  }
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

function getStatus(match) {
  return String(match && match.status ? match.status : "").trim().toLowerCase();
}

function hasFinalScore(match) {
  return isFilled(match && match.home_score) && isFilled(match && match.away_score);
}

function isLiveStatus(status) {
  return ["live", "ao vivo", "1h", "ht", "2h", "et", "bt", "p", "susp", "int"].includes(String(status || "").toLowerCase());
}

function parseMatchDateTime(match) {
  if (!match || !match.date || !match.time) return null;
  const cleanTime = String(match.time).trim().replace("h", ":").replace(".", ":");
  const [hour = "0", minute = "0"] = cleanTime.split(":");
  const parsed = new Date(`${match.date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isLiveBySchedule(match) {
  if (!match || hasFinalScore(match)) return false;
  const start = parseMatchDateTime(match);
  if (!start) return false;
  const now = new Date();
  const elapsed = now.getTime() - start.getTime();
  return elapsed >= 0 && elapsed <= 130 * 60 * 1000;
}

function isFinished(match) {
  const status = getStatus(match);
  if (isLiveStatus(status)) return false;
  return ["finished", "finalizado", "ft", "aet", "pen"].includes(status) || hasFinalScore(match);
}

function isLiveMatch(match) {
  const status = getStatus(match);
  return (isLiveStatus(status) || isLiveBySchedule(match)) && !isFinished(match);
}

function isFuture(match) { return !isFinished(match) && !isLiveMatch(match); }

function getMatchStatusLabel(match) {
  if (isFinished(match)) return "Finalizado";
  if (isLiveMatch(match)) return match.live_elapsed ? `Ao vivo ${match.live_elapsed}'` : "Ao vivo";
  return "Futuro";
}

function normalizeMatchRows() {
  matches = matches.map(match => {
    const normalized = { ...match };
    Object.keys(normalized).forEach(key => {
      if (typeof normalized[key] === "string") normalized[key] = normalized[key].trim();
    });

    const status = getStatus(normalized);
    if (hasFinalScore(normalized) && !isLiveStatus(status)) {
      normalized.status = "finished";
    } else if (!hasFinalScore(normalized) && isLiveBySchedule(normalized)) {
      normalized.status = "live";
      const start = parseMatchDateTime(normalized);
      normalized.live_elapsed = start ? Math.max(1, Math.min(130, Math.floor((Date.now() - start.getTime()) / 60000))) : "";
    }

    return normalized;
  });
}

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

// ==================== PONTUAÇÃO RECALCULADA LOCALMENTE ====================
// FIX: Não depender da planilha para exact_scores / correct_results.
// Tudo é recalculado via scorePrediction() a partir dos dados reais.

function getPoints(row) { return isFilled(row._points) ? num(row._points) : num(row.points); }

// Recalcula exatos para um participante a partir dos palpites e jogos
function calcExactScores(participantId) {
  return predictions.filter(p => String(p.participant_id) === String(participantId)).reduce((sum, p) => {
    const m = getMatchById(p.match_id);
    if (!m || !isFinished(m)) return sum;
    const pts = scorePrediction(m, p);
    return sum + (pts === 5 || pts === 10 ? 1 : 0);
  }, 0);
}

// Recalcula resultados corretos (acertou resultado mas não placar exato) + placares exatos normais
// correct_results = total de apostas que acertaram resultado (incluindo exatos), exceto bônus (bônus só conta exato)
function calcCorrectResults(participantId) {
  return predictions.filter(p => String(p.participant_id) === String(participantId)).reduce((sum, p) => {
    const m = getMatchById(p.match_id);
    if (!m || !isFinished(m)) return sum;
    const pts = scorePrediction(m, p);
    // Conta se acertou resultado (3pts) OU placar exato normal (5pts)
    return sum + (pts === 3 || pts === 5 ? 1 : 0);
  }, 0);
}

// Retorna o total de pontos calculado localmente (para validação / fallback)
function calcTotalPoints(participantId) {
  return predictions.filter(p => String(p.participant_id) === String(participantId)).reduce((sum, p) => {
    const m = getMatchById(p.match_id);
    if (!m) return sum;
    return sum + scorePrediction(m, p);
  }, 0);
}

// Aproveitamento: pontos ganhos / pontos possíveis
function calcAproveitamento(participantId) {
  const myPreds = predictions.filter(p => String(p.participant_id) === String(participantId));
  const finished = myPreds.filter(p => { const m = getMatchById(p.match_id); return m && isFinished(m); });
  const earned = finished.reduce((sum, p) => { const m = getMatchById(p.match_id); return sum + scorePrediction(m, p); }, 0);
  const max = finished.reduce((sum, p) => sum + (isPredictionBonus(p) ? 10 : 5), 0);
  return max > 0 ? Math.round(earned / max * 100) : 0;
}

function getParticipantSummary(participantId) {
  const rows = predictions.filter(p => String(p.participant_id) === String(participantId));
  const finishedRows = rows.filter(p => {
    const match = getMatchById(p.match_id);
    return match && isFinished(match);
  });
  const points = finishedRows.reduce((sum, pred) => {
    const match = getMatchById(pred.match_id);
    return sum + scorePrediction(match, pred);
  }, 0);
  const exact = finishedRows.reduce((sum, pred) => {
    const match = getMatchById(pred.match_id);
    const pts = scorePrediction(match, pred);
    return sum + (pts === 5 || pts === 10 ? 1 : 0);
  }, 0);
  const zeroes = finishedRows.reduce((sum, pred) => {
    const match = getMatchById(pred.match_id);
    return sum + (scorePrediction(match, pred) === 0 ? 1 : 0);
  }, 0);
  const draws = rows.reduce((sum, pred) => {
    if (!isFilled(pred.pred_home) || !isFilled(pred.pred_away)) return sum;
    return sum + (getMatchResult(pred.pred_home, pred.pred_away) === "draw" ? 1 : 0);
  }, 0);
  return {
    participantId,
    name: getParticipantName(participantId),
    predictions: rows.length,
    finishedPredictions: finishedRows.length,
    points,
    exact,
    zeroes,
    draws,
    accuracy: finishedRows.length ? Math.round(points / finishedRows.reduce((sum, p) => sum + (isPredictionBonus(p) ? 10 : 5), 0) * 100) : 0
  };
}

function getParticipantIdByName(name) {
  const p = participants.find(p => (p.name || p.nickname) === name);
  return p ? p.participant_id : null;
}

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
  return `<div class="avatar" style="width:${size}px;height:${size}px;background:${color};font-size:${Math.round(size*0.45)}px" title="${name}">${initial}</div>`;
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
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (pageId === "charts") setTimeout(renderCharts, 100);
}

function goToPage(pageId) {
  const btn = document.querySelector(`.nav-btn[onclick*="'${pageId}'"]`);
  showPage(pageId, btn);
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
  const pts = rankRow ? getPoints(rankRow) : calcTotalPoints(participantId);

  // FIX: usa recálculo local para exatos e corretos
  const exatos = calcExactScores(participantId);
  const corretos = calcCorrectResults(participantId);

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
  const maxPossible = finishedPreds.reduce((sum, p) => sum + (isPredictionBonus(p) ? 10 : 5), 0);
  const aproveitamento = maxPossible > 0 ? Math.round(pointsEarned / maxPossible * 100) : 0;

  const gameScores = finishedPreds.map(p => {
    const m = getMatchById(p.match_id);
    return { match: m, pred: p, score: scorePrediction(m, p), bonus: isPredictionBonus(p) };
  }).filter(g => g.match);

  const melhorJogo = [...gameScores].sort((a, b) => b.score - a.score)[0];
  const mediapts = finishedPreds.length > 0 ? (pointsEarned / finishedPreds.length).toFixed(1) : 0;

  // Ordenar: finalizados primeiro (por data desc), depois futuros
  const sortedPreds = [...myPredictions].sort((a, b) => {
    const ma = getMatchById(a.match_id);
    const mb = getMatchById(b.match_id);
    const fa = ma && isFinished(ma) ? 1 : 0;
    const fb = mb && isFinished(mb) ? 1 : 0;
    if (fa !== fb) return fb - fa;
    return (mb?.date || "") > (ma?.date || "") ? 1 : -1;
  });

  const historicoRows = sortedPreds.map(p => {
    const m = getMatchById(p.match_id);
    if (!m) return null;
    const pts = isFinished(m) ? scorePrediction(m, p) : null;
    const bonus = isPredictionBonus(p);
    const homeFlag = m.home_flag || "🏳️";
    const awayFlag = m.away_flag || "🏳️";
    const realScore = isFinished(m) ? `${m.home_score} - ${m.away_score}` : `—`;

    let ptsLabel;
    if (pts === null) {
      ptsLabel = `<span class="pts-badge pts-pending">Em aberto</span>`;
    } else if (pts === 10) {
      ptsLabel = `<span class="pts-badge pts-bonus">+10 ⭐</span>`;
    } else if (pts === 5) {
      ptsLabel = `<span class="pts-badge pts-5">+5 pts 🎯</span>`;
    } else if (pts === 3) {
      ptsLabel = `<span class="pts-badge pts-3">+3 pts ✅</span>`;
    } else {
      ptsLabel = `<span class="pts-badge pts-0">+0 pts</span>`;
    }

    const rowClass = pts === 5 || pts === 10 ? "row-exact" : pts === 3 ? "row-correct" : pts === 0 && isFinished(m) ? "row-miss" : "";

    return `
      <tr class="${rowClass}" onclick="openMatchModal('${m.match_id}')" style="cursor:pointer">
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
      <div class="modal-kpi kpi-exact">
        <span>🎯 Exatos</span>
        <strong>${exatos}</strong>
      </div>
      <div class="modal-kpi kpi-correct">
        <span>✅ Resultados</span>
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

    <div class="modal-score-legend">
      <span class="legend-item"><span class="pts-badge pts-5">+5</span> Placar exato</span>
      <span class="legend-item"><span class="pts-badge pts-3">+3</span> Resultado certo</span>
      <span class="legend-item"><span class="pts-badge pts-bonus">+10 ⭐</span> Bônus exato</span>
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

// ==================== MODAL JOGO ====================

function openMatchModal(matchId) {
  // Fecha modal de participante se aberto
  document.getElementById("participantModal").classList.remove("open");

  const modal = document.getElementById("matchModal");
  const content = document.getElementById("matchModalContent");
  content.innerHTML = buildMatchModal(matchId);
  modal.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeMatchModal(event) {
  if (event && event.target !== document.getElementById("matchModal") && !event.target.classList.contains("modal-close")) return;
  document.getElementById("matchModal").classList.remove("open");
  document.body.style.overflow = "";
}

function buildMatchModal(matchId) {
  const match = getMatchById(matchId);
  if (!match) return "<p>Jogo não encontrado.</p>";

  const preds = getPredictionsForMatch(matchId);
  const finished = isFinished(match);
  const homeFlag = match.home_flag || "🏳️";
  const awayFlag = match.away_flag || "🏳️";
  const stats = getPredictionResultStats(match);
  const isBonus = getBonusMatchIds().includes(String(matchId));

  const predRows = preds.map(pred => {
    const pts = finished ? scorePrediction(match, pred) : null;
    const bonus = isPredictionBonus(pred);
    const name = getParticipantName(pred.participant_id);
    let ptsLabel;
    if (pts === null) {
      ptsLabel = bonus ? `<span class="pts-badge pts-bonus">⭐ Bônus</span>` : `<span class="pts-badge pts-pending">🔒</span>`;
    } else if (pts === 10) {
      ptsLabel = `<span class="pts-badge pts-bonus">+10 ⭐</span>`;
    } else if (pts === 5) {
      ptsLabel = `<span class="pts-badge pts-5">+5 🎯</span>`;
    } else if (pts === 3) {
      ptsLabel = `<span class="pts-badge pts-3">+3 ✅</span>`;
    } else {
      ptsLabel = `<span class="pts-badge pts-0">+0</span>`;
    }

    const rowClass = pts === 5 || pts === 10 ? "row-exact" : pts === 3 ? "row-correct" : pts === 0 && finished ? "row-miss" : "";

    return `
      <div class="match-pred-row ${rowClass}" onclick="openParticipantModal('${pred.participant_id}')">
        ${renderAvatar(name, 36)}
        <div class="pred-info">
          <strong>${name}${bonus ? " ⭐" : ""}</strong>
          <span>${pred.pred_home || "?"} – ${pred.pred_away || "?"}</span>
        </div>
        ${ptsLabel}
      </div>
    `;
  }).join("");

  return `
    <div class="match-modal-header">
      ${isBonus ? `<span class="bonus-badge">⭐ Jogo Bônus</span>` : ""}
      <span class="match-modal-date">${formatDateBR(match.date)} · ${match.time || ""}</span>
      ${match.group ? `<span class="match-modal-group">${match.group}</span>` : ""}
    </div>

    <div class="match-modal-score">
      <div class="match-modal-team">
        <span class="match-modal-flag">${homeFlag}</span>
        <strong>${match.home_team}</strong>
      </div>
      <div class="match-modal-result">
        ${finished
          ? `<span class="match-modal-scoreline">${match.home_score} – ${match.away_score}</span><span class="match-modal-status done">✅ Finalizado</span>`
          : `<span class="match-modal-vs">VS</span><span class="match-modal-status future">Em breve</span>`
        }
      </div>
      <div class="match-modal-team">
        <span class="match-modal-flag">${awayFlag}</span>
        <strong>${match.away_team}</strong>
      </div>
    </div>

    ${finished ? `
    <div class="match-modal-consensus">
      <small>Consenso do bolão</small>
      <div class="majority-bar">
        <div style="width:${stats.homePct}%"></div>
        <div style="width:${stats.drawPct}%"></div>
        <div style="width:${stats.awayPct}%"></div>
      </div>
      <div class="majority-stats">
        <div class="majority-item home-item">
          <span>${match.home_team}</span>
          <strong>${stats.homePct}%</strong>
          <em>${stats.home} votos</em>
        </div>
        <div class="majority-item draw-item">
          <span>Empate</span>
          <strong>${stats.drawPct}%</strong>
          <em>${stats.draw} votos</em>
        </div>
        <div class="majority-item away-item">
          <span>${match.away_team}</span>
          <strong>${stats.awayPct}%</strong>
          <em>${stats.away} votos</em>
        </div>
      </div>
    </div>
    ` : ""}

    <h3 class="modal-section-title">🎯 Palpites dos Participantes</h3>
    <div class="match-preds-list">
      ${predRows || `<div class="empty-state">Sem palpites cadastrados.</div>`}
    </div>
  `;
}

// ==================== HOME ====================

function renderHome() {
  const leader = ranking[0];
  const finished = matches.filter(isFinished).length;

  // FIX: recalcula exactTotal localmente
  const exactTotal = participants.reduce((sum, p) => sum + calcExactScores(p.participant_id), 0);
  const liveMatches = matches.filter(isLiveMatch);

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
    // FIX: recalcula exatos localmente
    const exatos = calcExactScores(p.participant_id);
    const participantId = p.participant_id;
    return `
      <div class="podium-card ${i === 0 ? 'podium-first' : ''}" onclick="openParticipantModal('${participantId}')" title="Ver detalhes de ${name}">
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
  const live = isLiveMatch(match);
  const hasScore = finished || live;
  const statusLabel = getMatchStatusLabel(match);

  return `
    <div class="premium-match-card ${finished ? 'finished' : ''} ${live ? 'live' : ''}" onclick="openMatchModal('${match.match_id}')" style="cursor:pointer" title="Ver todos os palpites">
      <div class="premium-match-head">
        <div class="match-meta-left">
          <span class="match-num">${matchNum}</span>
          ${match.group ? `<span class="match-group">${match.group}</span>` : ""}
          <span class="status-pill ${live ? 'status-live' : finished ? 'status-done' : 'status-future'}">${statusLabel}</span>
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
          ${hasScore
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
            : pts === 5 ? `<span class="pts-badge pts-5">+5 🎯</span>`
            : pts === 3 ? `<span class="pts-badge pts-3">+3 ✅</span>`
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
        ${allPreds.length > 3 ? `<div class="more-preds" onclick="openMatchModal('${match.match_id}');event.stopPropagation()">+${allPreds.length - 3} mais → ver todos</div>` : ""}
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
  const live = isLiveMatch(match);
  const statusLabel = getMatchStatusLabel(match);

  const bonusPreds = getPredictionsForMatch(match.match_id).filter(isPredictionBonus);
  const exactWinners = finished
    ? bonusPreds.filter(p =>
        num(p.pred_home) === num(match.home_score) &&
        num(p.pred_away) === num(match.away_score)
      ).map(p => getParticipantName(p.participant_id))
    : [];

  return `
    <div class="bonus-card" onclick="openMatchModal('${match.match_id}')" style="cursor:pointer" title="Ver palpites deste jogo">
      <div class="bonus-card-top">
        <span class="bonus-badge">⭐ Bônus +10pts</span>
        <span class="bonus-date">${formatDateBR(match.date)}</span>
        <span class="bonus-time">${match.time || "-"}</span>
        <span class="status-pill ${live ? 'status-live' : finished ? 'status-done' : 'status-future'}">${statusLabel}</span>
      </div>
      <div class="bonus-teams">
        <div class="bonus-team">
          <span class="bonus-flag">${homeFlag}</span>
          <span>${match.home_team}</span>
        </div>
        <div class="bonus-score">
          ${finished || live ? `${match.home_score} - ${match.away_score}` : "vs"}
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
  const topExato = [...ranking].map(r => ({
    ...r,
    _exatos: calcExactScores(r.participant_id || getParticipantIdByName(r.name || r.nickname))
  })).sort((a, b) => b._exatos - a._exatos)[0];

  const topCorrect = [...ranking].map(r => ({
    ...r,
    _corretos: calcCorrectResults(r.participant_id || getParticipantIdByName(r.name || r.nickname))
  })).sort((a, b) => b._corretos - a._corretos)[0];

  const topPredictions = getTopPredictionVolume();
  const consensus = getHighestConsensus();
  const balanced = getMostBalancedMatch();
  const commonScore = getCommonScore();

  let bestAproveitamento = null;
  ranking.forEach(r => {
    const name = r.name || r.nickname;
    const participantId = r.participant_id || getParticipantIdByName(name);
    if (!participantId) return;
    const pct = calcAproveitamento(participantId);
    if (!bestAproveitamento || pct > bestAproveitamento.pct) {
      bestAproveitamento = { name, pct, participantId };
    }
  });

  const zebra = getBiggestZebra();

  setHTML("homeCuriosities", `
    ${topExato ? `
    <div class="curiosity-card curiosity-gold" onclick="openParticipantModal('${topExato.participant_id || getParticipantIdByName(topExato.name || topExato.nickname) || ''}')">
      <div class="curiosity-icon">🎯</div>
      <div>
        <span>Maior Cravador</span>
        <strong>${topExato.name || topExato.nickname}</strong>
        <b>${topExato._exatos}</b>
        <small>placares exatos</small>
      </div>
    </div>` : ""}

    ${topCorrect ? `
    <div class="curiosity-card curiosity-blue" onclick="openParticipantModal('${topCorrect.participant_id || getParticipantIdByName(topCorrect.name || topCorrect.nickname) || ''}')">
      <div class="curiosity-icon">✅</div>
      <div>
        <span>Rei do Resultado</span>
        <strong>${topCorrect.name || topCorrect.nickname}</strong>
        <b>${topCorrect._corretos}</b>
        <small>resultados corretos</small>
      </div>
    </div>` : ""}

    ${bestAproveitamento ? `
    <div class="curiosity-card curiosity-green" onclick="openParticipantModal('${bestAproveitamento.participantId || ''}')">
      <div class="curiosity-icon">📈</div>
      <div>
        <span>Melhor Aproveitamento</span>
        <strong>${bestAproveitamento.name}</strong>
        <b>${bestAproveitamento.pct}%</b>
        <small>de acertos</small>
      </div>
    </div>` : ""}

    ${topPredictions ? `
    <div class="curiosity-card curiosity-purple" onclick="openParticipantModal('${topPredictions.participantId}')">
      <div class="curiosity-icon">📝</div>
      <div>
        <span>Mais Apostas</span>
        <strong>${topPredictions.name}</strong>
        <b>${topPredictions.count}</b>
        <small>palpites enviados</small>
      </div>
    </div>` : ""}

    ${zebra ? `
    <div class="curiosity-card curiosity-red" onclick="openMatchModal('${zebra.match.match_id}')">
      <div class="curiosity-icon">🦓</div>
      <div>
        <span>Zebra do Bolão</span>
        <strong>${zebra.match.home_team} x ${zebra.match.away_team}</strong>
        <b>${zebra.pct}%</b>
        <small>apostaram no resultado real</small>
      </div>
    </div>` : ""}

    ${balanced ? `
    <div class="curiosity-card curiosity-orange" onclick="openMatchModal('${balanced.match.match_id}')">
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

    <div class="curiosity-card curiosity-nav" onclick="goToPage('ranking')">
      <div class="curiosity-icon">🏆</div>
      <div>
        <span>Ver</span>
        <strong>Ranking Completo</strong>
        <b>→</b>
        <small>${ranking.length} participantes</small>
      </div>
    </div>

    <div class="curiosity-card curiosity-nav" onclick="goToPage('matches')">
      <div class="curiosity-icon">⚽</div>
      <div>
        <span>Ver</span>
        <strong>Todos os Jogos</strong>
        <b>→</b>
        <small>${matches.length} jogos</small>
      </div>
    </div>
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

function filterRanking(query) {
  rankingSearch = query.toLowerCase();
  renderRanking();
}

function renderRanking() {
  const maxPts = ranking.length ? getPoints(ranking[0]) : 1;
  const filtered = rankingSearch
    ? ranking.filter(r => (r.name || r.nickname || "").toLowerCase().includes(rankingSearch))
    : ranking;

  setHTML("rankingBody", filtered.map((r, index) => {
    const name = r.name || r.nickname || "-";
    const pts = getPoints(r);
    const participantId = r.participant_id || getParticipantIdByName(name);

    // FIX: recalcula exatos e corretos localmente
    const exatos = calcExactScores(participantId);
    const corretos = calcCorrectResults(participantId);
    const aprv = calcAproveitamento(participantId);

    const globalIndex = ranking.indexOf(r);
    const medal = globalIndex === 0 ? "🥇" : globalIndex === 1 ? "🥈" : globalIndex === 2 ? "🥉" : `${globalIndex + 1}`;
    const barWidth = maxPts > 0 ? Math.round(pts / maxPts * 100) : 0;
    return `
      <tr class="ranking-row ${globalIndex < 3 ? 'top-row' : ''}" onclick="openParticipantModal('${participantId}')" title="Ver detalhes de ${name}">
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
  }).join("") || `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:24px">Nenhum participante encontrado.</td></tr>`);
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
  if (currentMatchFilter === "live") filtered = matches.filter(isLiveMatch);
  if (currentMatchFilter === "finished") filtered = matches.filter(isFinished);
  if (currentMatchFilter === "future") filtered = matches.filter(isFuture);
  setHTML("matchesList", filtered.length ? filtered.map(renderMatchCard).join("") : `<div class="empty-state">Nenhum jogo neste filtro.</div>`);
}

function renderMatchCard(match) {
  const homeScore = isFilled(match.home_score) ? match.home_score : "-";
  const awayScore = isFilled(match.away_score) ? match.away_score : "-";
  const homeFlag = match.home_flag || "🏳️";
  const awayFlag = match.away_flag || "🏳️";
  const finished = isFinished(match);
  const live = isLiveMatch(match);
  const statusLabel = getMatchStatusLabel(match);
  const isBonus = getBonusMatchIds().includes(String(match.match_id));

  return `
    <div class="match-card ${finished ? 'match-finished' : live ? 'match-live' : 'match-future'}" onclick="openMatchModal('${match.match_id}')" style="cursor:pointer" title="Ver palpites deste jogo">
      <div class="match-card-header">
        <span class="badge ${live ? 'badge-live' : finished ? 'badge-done' : 'badge-future'}">${statusLabel}</span>
        ${isBonus ? `<span class="badge badge-bonus">⭐ Bônus</span>` : ""}
        <span class="match-card-meta">${formatDateBR(match.date)} · ${match.time || "-"}${match.group ? " · " + match.group : ""}</span>
      </div>
      <div class="match-card-score">
        <span>${homeFlag} ${match.home_team}</span>
        <div class="match-score-center">
          ${finished || live ? `<span class="big-score">${homeScore} — ${awayScore}</span>` : `<span class="vs-label">vs</span>`}
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

  // Ordenar: finalizados primeiro
  const sortedMatchIds = Object.keys(grouped).sort((a, b) => {
    const ma = getMatchById(a);
    const mb = getMatchById(b);
    const fa = ma && isFinished(ma) ? 1 : 0;
    const fb = mb && isFinished(mb) ? 1 : 0;
    return fb - fa;
  });

  setHTML("predictionsList", sortedMatchIds.map(matchId => {
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

    const isBonusMatch = grouped[matchId].some(isPredictionBonus);
    const totalMatchPts = grouped[matchId].reduce((sum, p) => sum + scorePrediction(match, p), 0);

    const cards = grouped[matchId].map(pred => {
      const pts = scorePrediction(match, pred);
      const bonus = isPredictionBonus(pred);
      let ptsLabel;
      if (pts === 10) ptsLabel = `<span class="pts-badge pts-bonus">+10 ⭐</span>`;
      else if (pts === 5) ptsLabel = `<span class="pts-badge pts-5">+5 🎯</span>`;
      else if (pts === 3) ptsLabel = `<span class="pts-badge pts-3">+3 ✅</span>`;
      else ptsLabel = `<span class="pts-badge pts-0">+0 pts</span>`;

      const rowClass = pts === 5 || pts === 10 ? "row-exact" : pts === 3 ? "row-correct" : "row-miss";

      return `
        <div class="prediction-row ${rowClass}" onclick="openParticipantModal('${pred.participant_id}')">
          ${renderAvatarById(pred.participant_id, 36)}
          <div class="pred-details">
            <strong>${getParticipantName(pred.participant_id)}${bonus ? " ⭐" : ""}</strong>
            <span>${match.home_flag || "🏳️"} ${match.home_team} <b>${pred.pred_home}</b> - <b>${pred.pred_away}</b> ${match.away_team} ${match.away_flag || "🏳️"}</span>
          </div>
          ${ptsLabel}
        </div>
      `;
    }).join("");

    return `
      <div class="match-card match-finished">
        <div class="match-card-header">
          <span class="badge badge-done">✅ Finalizado</span>
          ${isBonusMatch ? `<span class="badge badge-bonus">⭐ Bônus</span>` : ""}
          <span class="match-card-meta">${formatDateBR(match.date)}</span>
          <span class="match-total-pts">${totalMatchPts} pts gerados</span>
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

  // FIX: recalcula exatos localmente
  const exactTotal = participants.reduce((sum, p) => sum + calcExactScores(p.participant_id), 0);
  const bonusPreds = predictions.filter(isPredictionBonus).length;

  // Conta resultados simples (3pts)
  const correctResults3pts = predictions.filter(p => {
    const m = getMatchById(p.match_id);
    return m && isFinished(m) && scorePrediction(m, p) === 3;
  }).length;

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
    <div class="kpi kpi-exact-stat">
      <span>🎯 Placares Exatos</span>
      <strong>${exactTotal}</strong>
      <small>cravadas (+5/+10 pts)</small>
    </div>
    <div class="kpi kpi-correct-stat">
      <span>✅ Resultados Certos</span>
      <strong>${correctResults3pts}</strong>
      <small>resultado sem placar (+3 pts)</small>
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
  // FIX: ordena por recálculo local
  const byExact = [...participants].map(p => ({
    participantId: p.participant_id,
    name: p.name || p.nickname || "-",
    value: calcExactScores(p.participant_id)
  })).sort((a, b) => b.value - a.value).slice(0, 8);

  const byCorrect = [...participants].map(p => ({
    participantId: p.participant_id,
    name: p.name || p.nickname || "-",
    value: calcCorrectResults(p.participant_id)
  })).sort((a, b) => b.value - a.value).slice(0, 8);

  const maxExact = byExact.length ? byExact[0].value : 1;
  const maxCorrect = byCorrect.length ? byCorrect[0].value : 1;

  setHTML("accuracyBoards", `
    <div class="ranking-board">
      <h3>🎯 Placares Exatos (+5 ou +10 pts)</h3>
      ${byExact.map((p, i) => renderMiniRankRow(p.name, p.value, "exatos", i, maxExact, p.participantId)).join("")}
    </div>
    <div class="ranking-board">
      <h3>✅ Resultados Simples (+3 pts)</h3>
      ${byCorrect.map((p, i) => renderMiniRankRow(p.name, p.value, "acertos", i, maxCorrect, p.participantId)).join("")}
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
    <div class="insight-card green" onclick="${zebra ? `openMatchModal('${zebra.match.match_id}')` : ''}" style="${zebra ? 'cursor:pointer' : ''}">
      <div class="insight-icon">🦓</div>
      <div>
        <span>Maior Zebra Acertada</span>
        <strong>${zebra ? `${zebra.match.home_flag || ""} ${zebra.match.home_team} ${zebra.match.home_score} – ${zebra.match.away_score} ${zebra.match.away_team} ${zebra.match.away_flag || ""}` : "—"}</strong>
        <small>${zebra ? `Apenas ${zebra.pct}% apostaram em ${zebra.resultLabel}. ${zebra.exactNames || "Ninguém cravou o placar."}` : "Ainda sem jogos suficientes."}</small>
      </div>
    </div>
    <div class="insight-card blue" onclick="${bestGame ? `openMatchModal('${bestGame.match.match_id}')` : ''}" style="${bestGame ? 'cursor:pointer' : ''}">
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
  setHTML("comebackTable", `
    <table>
      <thead>
        <tr>
          <th>Apostador</th>
          <th>Pontos</th>
          <th>Jogos Restantes</th>
          <th>Máximo Possível</th>
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
          const participantId = p.participant_id || getParticipantIdByName(name);
          return `
            <tr class="clickable" onclick="openParticipantModal('${participantId}')">
              <td>
                <div class="table-player">
                  ${renderAvatar(name, 34)}
                  <strong>${name}</strong>
                </div>
              </td>
              <td class="green-number">${current}</td>
              <td class="yellow-number">${remaining}</td>
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
  renderChartsRoast();
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

function renderChartsRoast() {
  const summaries = participants.map(p => getParticipantSummary(p.participant_id));
  const leader = ranking[0];
  const lantern = ranking[ranking.length - 1];
  const leaderId = leader && (leader.participant_id || getParticipantIdByName(leader.name || leader.nickname));
  const lanternId = lantern && (lantern.participant_id || getParticipantIdByName(lantern.name || lantern.nickname));
  const exactKing = [...summaries].sort((a, b) => b.exact - a.exact || b.points - a.points)[0];
  const zeroBoss = [...summaries].sort((a, b) => b.zeroes - a.zeroes || a.points - b.points)[0];
  const drawMerchant = [...summaries].sort((a, b) => b.draws - a.draws)[0];
  const zebra = getBiggestZebra();
  const avgPoints = ranking.length ? Math.round(ranking.reduce((sum, p) => sum + getPoints(p), 0) / ranking.length) : 0;
  const leaderGap = leader && lantern ? getPoints(leader) - getPoints(lantern) : 0;

  const cards = [
    {
      tone: "gold",
      icon: "👑",
      label: "Dono momentâneo da bola",
      title: leader ? `${leader.name || leader.nickname} abriu a geladeira da liderança` : "Sem líder ainda",
      text: leader ? `${getPoints(leader)} pts. Média da galera: ${avgPoints}. Está confortável, mas soberba também derruba.` : "Quando tiver pontuação, começa a corneta.",
      action: leaderId ? `openParticipantModal('${leaderId}')` : ""
    },
    {
      tone: "danger",
      icon: "🧯",
      label: "Lanterna oficial",
      title: lantern ? `${lantern.name || lantern.nickname} está iluminando o caminho` : "Sem lanterna ainda",
      text: lantern ? `${getPoints(lantern)} pts e ${leaderGap} atrás do líder. Ainda dá tempo, mas precisa parar de apostar com o coração.` : "A vergonha será calculada com carinho.",
      action: lanternId ? `openParticipantModal('${lanternId}')` : ""
    },
    {
      tone: "green",
      icon: "🎯",
      label: "Psicógrafo de placar",
      title: exactKing && exactKing.exact ? `${exactKing.name} cravou ${exactKing.exact}` : "Ninguém virou vidente ainda",
      text: exactKing && exactKing.exact ? "Quando acerta placar exato, finge naturalidade. Todos sabemos que foi sorte." : "Por enquanto todo mundo está chutando no escuro com convicção.",
      action: exactKing ? `openParticipantModal('${exactKing.participantId}')` : ""
    },
    {
      tone: "red",
      icon: "🧊",
      label: "Rei do zero",
      title: zeroBoss && zeroBoss.zeroes ? `${zeroBoss.name} já coleciona ${zeroBoss.zeroes} zeros` : "A fábrica de zero ainda está fechada",
      text: zeroBoss && zeroBoss.zeroes ? "É consistência, só que do lado errado da história." : "Sem jogos suficientes para apontar o dedo com responsabilidade.",
      action: zeroBoss ? `openParticipantModal('${zeroBoss.participantId}')` : ""
    },
    {
      tone: "blue",
      icon: "🤝",
      label: "Sindicato do empate",
      title: drawMerchant && drawMerchant.draws ? `${drawMerchant.name} ama um 1 x 1` : "Poucos empates apostados",
      text: drawMerchant && drawMerchant.draws ? `${drawMerchant.draws} palpites em empate. A pessoa não escolhe lado nem no bolão.` : "A galera está escolhendo lados. Corajosos ou iludidos, veremos.",
      action: drawMerchant ? `openParticipantModal('${drawMerchant.participantId}')` : ""
    },
    {
      tone: "purple",
      icon: "🦓",
      label: "Jogo que humilhou planilhas",
      title: zebra ? `${zebra.match.home_team} ${zebra.match.home_score} x ${zebra.match.away_score} ${zebra.match.away_team}` : "A zebra está aquecendo",
      text: zebra ? `Só ${zebra.pct}% foram no resultado certo. O resto chamou de absurdo depois que acabou.` : "Quando pintar a primeira surpresa, ela aparece aqui.",
      action: zebra ? `openMatchModal('${zebra.match.match_id}')` : ""
    }
  ];

  setHTML("chartsRoast", cards.map(card => `
    <div class="roast-card roast-${card.tone}" ${card.action ? `onclick="${card.action}"` : ""}>
      <div class="roast-icon">${card.icon}</div>
      <div>
        <span>${card.label}</span>
        <strong>${card.title}</strong>
        <small>${card.text}</small>
      </div>
    </div>
  `).join(""));
}

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
  // FIX: usa recálculo local
  const data = getTopRanking().map(p => ({
    name: p.name || p.nickname || "-",
    value: calcExactScores(p.participant_id || getParticipantIdByName(p.name || p.nickname))
  })).sort((a, b) => b.value - a.value);

  createChart("exactChart", {
    type: "bar",
    data: {
      labels: data.map(p => p.name),
      datasets: [{ label: "Placares exatos", data: data.map(p => p.value), backgroundColor: "#facc15", borderColor: "#fde68a", borderWidth: 1, borderRadius: 6 }]
    },
    options: baseChartOptions({ indexAxis: "y", plugins: { legend: { display: false } } })
  });
}

function renderCorrectChart() {
  // FIX: usa recálculo local
  const data = getTopRanking().map(p => ({
    name: p.name || p.nickname || "-",
    value: calcCorrectResults(p.participant_id || getParticipantIdByName(p.name || p.nickname))
  })).sort((a, b) => b.value - a.value);

  createChart("correctChart", {
    type: "bar",
    data: {
      labels: data.map(p => p.name),
      datasets: [{ label: "Acertos (resultado)", data: data.map(p => p.value), backgroundColor: "#38bdf8", borderColor: "#bae6fd", borderWidth: 1, borderRadius: 6 }]
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
    const s = isFinished(m) ? "Finalizados" : isLiveMatch(m) ? "Ao vivo" : "Próximos";
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
  const data = getTopRanking().map(p => {
    const pid = p.participant_id || getParticipantIdByName(p.name || p.nickname);
    return {
      x: calcExactScores(pid),
      y: getPoints(p),
      label: p.name || p.nickname
    };
  });
  createChart("pointsExactChart", {
    type: "scatter",
    data: {
      datasets: [{
        label: "Participantes",
        data,
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

    normalizeMatchRows();
    applyLiveScores(await fetchLiveScores());
    normalizeMatchRows();

    ranking = ranking
      .map(row => {
        const participantId = row.participant_id || getParticipantIdByName(row.name || row.nickname);
        return participantId ? { ...row, participant_id: participantId, _points: calcTotalPoints(participantId) } : row;
      })
      .sort((a, b) => getPoints(b) - getPoints(a));

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
