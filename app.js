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

const FINAL_SHEETS = {
  MATCHES: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRqE3kkDDcPtqpGJ3PguUDsikJMNFbm0zdl9AJeK6e-_egbJmgYX29r50ESGoFqV0qe_aToL4aNgbBh/pub?gid=1863807594&single=true&output=csv",
  PREDICTIONS: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRqE3kkDDcPtqpGJ3PguUDsikJMNFbm0zdl9AJeK6e-_egbJmgYX29r50ESGoFqV0qe_aToL4aNgbBh/pub?gid=111102253&single=true&output=csv"
};

// ==================== ESTADO GLOBAL ====================

let participants = [];
let matches = [];
let predictions = [];
let ranking = [];
let knockoutMatches = [];
let knockoutPredictions = [];
let charts = {};
let currentMatchFilter = "all";
let matchGroupFilter = "all";
let matchBonusFilter = "all";
let matchSearch = "";
let matchSort = "latest";
let rankingSearch = "";
let liveScoreMeta = null;
let arcadeAudio = null;
let arcadeMusicOn = false;
let pendingGoalCheer = false;
let customMusicAudio = null;

const CUSTOM_MUSIC_URL = "assets/audio/aquatic-ambience.mp3";

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
      const separator = url.includes("?") ? "&" : "?";
      const response = await fetch(`${url}${separator}v=${Date.now()}`, { cache: "no-store" });
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

async function fetchOptionalCsv(url, name) {
  const urls = proxiedUrls(url);
  for (const candidate of urls) {
    try {
      const separator = candidate.includes("?") ? "&" : "?";
      const response = await fetch(`${candidate}${separator}v=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Status: ${response.status}`);
      const text = await response.text();
      if (!text || text.includes("<html") || text.includes("<!DOCTYPE html")) throw new Error("retornou HTML");
      return parseCsv(text);
    } catch (error) {
      console.info(`${name} opcional indisponivel:`, error.message);
    }
  }
  return [];
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

  detectGoalCelebration();

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
  window.scrollTo({ top: 0, behavior: "auto" });
  if (pageId === "charts") setTimeout(renderCharts, 100);
  if (pageId === "arena") renderArena();
  if (pageId === "round") renderRoundMode();
  if (pageId === "knockout") renderKnockout();
}

function goToPage(pageId) {
  const btn = document.querySelector(`.nav-btn[onclick*="'${pageId}'"]`);
  showPage(pageId, btn);
}

// ==================== ARCADE SOUND ====================

function createArcadeAudio() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  const ctx = new AudioCtx();
  const gain = ctx.createGain();
  gain.gain.value = 0.018;
  gain.connect(ctx.destination);
  return { ctx, gain, timers: [] };
}

function createCustomMusicAudio() {
  const audio = new Audio(CUSTOM_MUSIC_URL);
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = 0.18;
  return audio;
}

async function playCustomMusicIfAvailable() {
  if (!customMusicAudio) customMusicAudio = createCustomMusicAudio();
  try {
    customMusicAudio.currentTime = customMusicAudio.currentTime || 0;
    await customMusicAudio.play();
    return true;
  } catch (error) {
    console.info("Musica customizada indisponivel, usando loop gerado:", error.message);
    return false;
  }
}

function stopCustomMusic() {
  if (!customMusicAudio) return;
  customMusicAudio.pause();
}

function playChipNote(freq, start, duration, type = "triangle", peak = 0.55) {
  if (!arcadeAudio) return;
  const { ctx, gain } = arcadeAudio;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(peak, start + 0.04);
  env.gain.exponentialRampToValueAtTime(Math.max(0.03, peak * 0.18), start + duration * 0.58);
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(env);
  env.connect(gain);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function playAquaticPad(freqs, start, duration, peak = 0.065) {
  if (!arcadeAudio) return;
  const { ctx, gain } = arcadeAudio;
  const padGain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(820, start);
  filter.frequency.linearRampToValueAtTime(1420, start + duration * 0.55);
  filter.frequency.linearRampToValueAtTime(620, start + duration);
  padGain.gain.setValueAtTime(0.0001, start);
  padGain.gain.exponentialRampToValueAtTime(peak, start + 1.6);
  padGain.gain.exponentialRampToValueAtTime(Math.max(0.012, peak * 0.32), start + duration * 0.78);
  padGain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  filter.connect(padGain);
  padGain.connect(gain);

  freqs.forEach((freq, index) => {
    const osc = ctx.createOscillator();
    osc.type = index % 2 ? "triangle" : "sine";
    osc.frequency.setValueAtTime(freq * (index % 2 ? 1.003 : 0.997), start);
    osc.connect(filter);
    osc.start(start);
    osc.stop(start + duration + 0.1);
  });
}

function playWaterDrop(freq, start, peak = 0.09) {
  if (!arcadeAudio) return;
  const { ctx, gain } = arcadeAudio;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, start);
  osc.frequency.exponentialRampToValueAtTime(freq * 1.55, start + 0.12);
  filter.type = "bandpass";
  filter.frequency.value = freq * 1.8;
  filter.Q.value = 8;
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(peak, start + 0.018);
  env.gain.exponentialRampToValueAtTime(0.0001, start + 0.55);
  osc.connect(filter);
  filter.connect(env);
  env.connect(gain);
  osc.start(start);
  osc.stop(start + 0.6);
}

function scheduleArcadeLoop() {
  if (!arcadeAudio || !arcadeMusicOn) return;
  const { ctx } = arcadeAudio;
  const now = ctx.currentTime + 0.04;
  const pads = [
    [130.81, 196.00, 261.63, 329.63],
    [146.83, 220.00, 293.66, 369.99],
    [123.47, 185.00, 246.94, 329.63],
    [164.81, 246.94, 329.63, 415.30],
    [110.00, 164.81, 220.00, 293.66],
    [146.83, 196.00, 293.66, 392.00]
  ];
  const motif = [659, 784, 988, 880, 784, 659, 587, 659, 740, 880, 784, 698, 587, 494, 523, 587];
  const counter = [392, 0, 494, 0, 587, 0, 659, 0, 587, 0, 494, 0, 440, 0, 392, 0];
  const bass = [65.41, 73.42, 61.74, 82.41, 55.00, 73.42];

  pads.forEach((chord, i) => playAquaticPad(chord, now + i * 7.68, 8.8, i % 2 ? 0.052 : 0.064));
  bass.forEach((freq, i) => {
    playChipNote(freq, now + i * 7.68, 4.8, "sine", 0.055);
    playChipNote(freq * 2, now + 3.84 + i * 7.68, 2.2, "triangle", 0.025);
  });
  motif.forEach((freq, i) => {
    const offset = i * 1.44 + (i % 4 === 2 ? 0.18 : 0);
    playChipNote(freq, now + 1.2 + offset, 0.78, "sine", i % 5 === 0 ? 0.075 : 0.052);
  });
  counter.forEach((freq, i) => {
    if (freq) playChipNote(freq, now + 25.2 + i * 1.2, 0.68, "triangle", 0.036);
  });
  [988, 1175, 1319, 1568, 1760, 1319, 1175, 988].forEach((freq, i) => {
    playChipNote(freq, now + 4.4 + i * 5.4, 1.25, "sine", 0.024);
  });
  [523, 659, 784, 587, 740, 988, 659, 880, 1175].forEach((freq, i) => {
    playWaterDrop(freq, now + 2.6 + i * 4.9, i % 3 === 0 ? 0.07 : 0.045);
  });
  const timer = window.setTimeout(scheduleArcadeLoop, 46080);
  arcadeAudio.timers.push(timer);
}

function getScoreMemory() {
  try {
    return JSON.parse(localStorage.getItem("eggbrothersScoreMemory") || "{}");
  } catch (error) {
    return {};
  }
}

function saveScoreMemory(memory) {
  try {
    localStorage.setItem("eggbrothersScoreMemory", JSON.stringify(memory));
  } catch (error) {
    console.info("Memoria de placar indisponivel:", error.message);
  }
}

function detectGoalCelebration() {
  const previous = getScoreMemory();
  const next = {};
  const goals = [];

  matches.forEach(match => {
    if (!isFilled(match.home_score) && !isFilled(match.away_score)) return;
    const key = String(match.match_id || `${match.date}-${match.home_team}-${match.away_team}`);
    const home = num(match.home_score);
    const away = num(match.away_score);
    const old = previous[key];
    next[key] = { home, away };
    if (!old) return;
    if (home > num(old.home) || away > num(old.away)) {
      goals.push(`${match.home_team} ${home} x ${away} ${match.away_team}`);
    }
  });

  saveScoreMemory({ ...previous, ...next });
  if (goals.length) playGoalCheer(goals[0]);
}

function playGoalCheer() {
  if (!arcadeAudio) arcadeAudio = createArcadeAudio();
  if (!arcadeAudio || arcadeAudio.ctx.state !== "running") {
    pendingGoalCheer = true;
    setText("arcadeMusicBtn", "♪ GOL READY");
    return;
  }

  pendingGoalCheer = false;
  const { ctx, gain } = arcadeAudio;
  const now = ctx.currentTime + 0.02;
  gain.gain.setTargetAtTime(0.05, now, 0.05);
  const cheerGain = ctx.createGain();
  cheerGain.gain.setValueAtTime(0.0001, now);
  cheerGain.gain.exponentialRampToValueAtTime(0.24, now + 0.12);
  cheerGain.gain.exponentialRampToValueAtTime(0.1, now + 1.15);
  cheerGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.25);
  cheerGain.connect(gain);

  const bufferSize = Math.floor(ctx.sampleRate * 2.25);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize * 0.35);
  }

  const noise = ctx.createBufferSource();
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 950;
  band.Q.value = 0.65;
  noise.buffer = buffer;
  noise.connect(band);
  band.connect(cheerGain);
  noise.start(now);
  noise.stop(now + 2.25);

  [392, 494, 587, 784].forEach((freq, i) => {
    playChipNote(freq, now + i * 0.08, 0.24, "square", 0.18);
  });
}

function showGoalToast(label = "Gol no jogo!") {
  let toast = document.getElementById("goalCheerToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "goalCheerToast";
    toast.className = "goal-cheer-toast";
    document.body.appendChild(toast);
  }
  toast.innerHTML = `<strong>GOOOOL!</strong><span>${label}</span>`;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 3200);
}

function playGoalCheer(label = "Gol no jogo!") {
  showGoalToast(label);
  if (!arcadeAudio) arcadeAudio = createArcadeAudio();
  if (!arcadeAudio || arcadeAudio.ctx.state !== "running") {
    pendingGoalCheer = true;
    setText("arcadeMusicBtn", "GOL! CLIQUE AQUI");
    return;
  }

  pendingGoalCheer = false;
  const { ctx } = arcadeAudio;
  const now = ctx.currentTime + 0.02;
  const cheerGain = ctx.createGain();
  cheerGain.gain.setValueAtTime(0.0001, now);
  cheerGain.gain.exponentialRampToValueAtTime(0.38, now + 0.1);
  cheerGain.gain.exponentialRampToValueAtTime(0.22, now + 1.5);
  cheerGain.gain.exponentialRampToValueAtTime(0.0001, now + 3.2);
  cheerGain.connect(ctx.destination);

  const bufferSize = Math.floor(ctx.sampleRate * 3.2);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    const wave = Math.sin(i / 18) * 0.35 + Math.sin(i / 43) * 0.2;
    data[i] = ((Math.random() * 2 - 1) * 0.65 + wave) * (1 - i / bufferSize * 0.25);
  }

  const noise = ctx.createBufferSource();
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 780;
  band.Q.value = 0.55;
  noise.buffer = buffer;
  noise.connect(band);
  band.connect(cheerGain);
  noise.start(now);
  noise.stop(now + 3.2);

  [392, 494, 587, 784, 988, 784].forEach((freq, i) => {
    playChipNote(freq, now + i * 0.075, 0.22, "square", 0.28);
  });
}

async function unlockArcadeAudio() {
  if (!arcadeAudio) arcadeAudio = createArcadeAudio();
  if (!arcadeAudio) return;
  await arcadeAudio.ctx.resume();
  if (pendingGoalCheer) playGoalCheer();
}

async function toggleArcadeMusic(force) {
  if (force === false || arcadeMusicOn) {
    arcadeMusicOn = false;
    stopCustomMusic();
    if (arcadeAudio) {
      arcadeAudio.timers.forEach(clearTimeout);
      arcadeAudio.timers = [];
      arcadeAudio.gain.gain.setTargetAtTime(0.0001, arcadeAudio.ctx.currentTime, 0.05);
    }
    setText("arcadeMusicBtn", "♪ START SOUND");
    return;
  }
  if (!arcadeAudio) arcadeAudio = createArcadeAudio();
  if (!arcadeAudio) return;
  await arcadeAudio.ctx.resume();
  if (pendingGoalCheer) playGoalCheer();
  arcadeMusicOn = true;
  setText("arcadeMusicBtn", "♪ SOUND ON");
  const customStarted = await playCustomMusicIfAvailable();
  if (customStarted) {
    arcadeAudio.gain.gain.setTargetAtTime(0.0001, arcadeAudio.ctx.currentTime, 0.05);
    arcadeAudio.timers.forEach(clearTimeout);
    arcadeAudio.timers = [];
  } else {
    arcadeAudio.gain.gain.setTargetAtTime(0.018, arcadeAudio.ctx.currentTime, 0.08);
    scheduleArcadeLoop();
  }
}

// ==================== DOM HELPERS ====================

function setHTML(id, html) { const el = document.getElementById(id); if (el) el.innerHTML = html; }
function setText(id, text) { const el = document.getElementById(id); if (el) el.innerText = text; }
function setNote(id, text) { const el = document.getElementById(id); if (el) el.textContent = text || ""; }

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
  const summary = getParticipantSummary(participantId);
  const styleName = getParticipantStyle(summary);
  const badges = getParticipantBadges(participantId);

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

    <div class="profile-roast">
      <div>
        <span>Perfil do apostador</span>
        <strong>${styleName}</strong>
        <small>${summary.zeroes} zero(s), ${summary.exact} cravada(s), ${summary.draws} empate(s) apostado(s). Aqui não tem julgamento, só estatística com deboche.</small>
      </div>
      <div class="profile-badges">
        ${badges.map(([icon, label]) => `<span>${icon} ${label}</span>`).join("")}
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
  renderHomeKnockoutRadar();
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
  const liveMatches = matches.filter(isLiveMatch);
  const dayMatches = matches.filter(m => m.date === today && !isLiveMatch(m));
  const knockoutDayMatches = knockoutMatches.filter(match => match.date === today);
  let todayMatches = [
    ...sortMatchesForArcade([...liveMatches, ...dayMatches]).map(match => ({ type: "group", match })),
    ...sortKnockoutMatchesForHome(knockoutDayMatches).map(match => ({ type: "knockout", match }))
  ];
  if (!todayMatches.length) {
    todayMatches = [
      ...sortKnockoutMatchesForHome(knockoutMatches.filter(match => getKnockoutStatus(match) === "Aberto")).slice(0, 3).map(match => ({ type: "knockout", match })),
      ...sortMatchesForArcade(matches.filter(isFuture)).slice(0, 3).map(match => ({ type: "group", match }))
    ].slice(0, 4);
  }
  setHTML("todayMatches",
    todayMatches.length
      ? todayMatches.map(item => item.type === "knockout" ? renderHomeKnockoutMatchCard(item.match) : renderPremiumMatchCard(item.match)).join("")
      : `<div class="empty-state">📭 Nenhum jogo cadastrado para hoje.</div>`
  );
}

function getKnockoutTimestamp(match) {
  const parsed = new Date(`${match.date || "2999-12-31"}T${match.time || "23:59"}`);
  return Number.isNaN(parsed.getTime()) ? Number.MAX_SAFE_INTEGER : parsed.getTime();
}

function sortKnockoutMatchesForHome(list) {
  return [...list].sort((a, b) => {
    const statusWeight = match => getKnockoutStatus(match) === "Finalizado" ? 1 : getKnockoutStatus(match) === "Aberto" ? 3 : 2;
    const diff = statusWeight(b) - statusWeight(a);
    if (diff) return diff;
    return getKnockoutTimestamp(a) - getKnockoutTimestamp(b);
  });
}

function renderHomeKnockoutMatchCard(match) {
  const home = getKnockoutTeam(match, "home");
  const away = getKnockoutTeam(match, "away");
  const status = getKnockoutStatus(match);
  const predCount = getKnockoutPredictionRows(match.match_id).filter(pred => isFilled(pred.pred_home) && isFilled(pred.pred_away)).length;
  return `
    <div class="premium-match-card knockout-home-card ${status === "Finalizado" ? "finished" : status === "Aberto" ? "live" : ""}" onclick="openKnockoutMatchModal('${match.match_id}')" style="cursor:pointer" title="Ver palpites do mata-mata">
      <div class="premium-match-head">
        <div class="match-meta-left">
          <span class="match-num">${match.match_id}</span>
          <span class="match-group">${match.phase || "Mata-Mata"}</span>
          <span class="status-pill ${status === "Finalizado" ? "status-done" : status === "Aberto" ? "status-live" : "status-future"}">${status}</span>
        </div>
        <div class="match-meta-right">
          <span class="match-time">${match.time || "-"}</span>
          <span class="match-date">${formatDateBR(match.date)}</span>
        </div>
      </div>
      <div class="premium-versus">
        <div class="team-side">
          ${renderKnockoutFlag(home)}
          <strong>${home}</strong>
        </div>
        <div class="vs-block">
          ${isFilled(match.home_score) && isFilled(match.away_score)
            ? `<div class="score-live">${match.home_score}<span>x</span>${match.away_score}</div>`
            : `<span class="vs-text">VS</span>`}
        </div>
        <div class="team-side">
          ${renderKnockoutFlag(away)}
          <strong>${away}</strong>
        </div>
      </div>
      <div class="match-drama">🏁 ${predCount} palpite(s) publicados · +3 quem passa / +8 com margem</div>
    </div>
  `;
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
  const drama = getMatchDrama(match);

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

      <div class="match-drama">${drama}</div>

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

function renderHomeKnockoutRadar() {
  const board = getKnockoutLeaderboard();
  const finalBoard = getFinalLeaderboard();
  const openMatches = knockoutMatches.filter(match => getKnockoutStatus(match) === "Aberto").length;
  const finishedMatches = knockoutMatches.filter(match => getKnockoutStatus(match) === "Finalizado").length;
  const nextMatches = sortKnockoutMatchesForHome(knockoutMatches.filter(match => getKnockoutStatus(match) !== "Finalizado")).slice(0, 2);
  const nextText = nextMatches.length
    ? nextMatches.map(match => `${getTeamFlag(getKnockoutTeam(match, "home"))} ${getKnockoutTeam(match, "home")} x ${getKnockoutTeam(match, "away")} ${getTeamFlag(getKnockoutTeam(match, "away"))}`).join(" · ")
    : "Aguardando definicao dos confrontos";

  setHTML("homeKnockoutRadar", `
    <button class="bonus-card knockout-radar-card" onclick="goToPage('knockout')">
      <div class="bonus-card-top">
        <span class="bonus-badge">🏁 Fase final</span>
        <span class="status-pill status-live">${openMatches} abertos</span>
      </div>
      <div class="bonus-score">${finishedMatches}/${knockoutMatches.length || 0}</div>
      <div class="bonus-winners muted">jogos finalizados no mata-mata</div>
    </button>
    <button class="bonus-card knockout-radar-card" onclick="goToPage('ranking')">
      <div class="bonus-card-top">
        <span class="bonus-badge">🏆 Ranking final</span>
      </div>
      <div class="bonus-score">${finalBoard[0] ? finalBoard[0].name : "A definir"}</div>
      <div class="bonus-winners muted">${finalBoard[0] ? `${finalBoard[0].totalPoints} pts somando grupos + mata-mata` : "sem dados ainda"}</div>
    </button>
    <button class="bonus-card knockout-radar-card" onclick="goToPage('knockout')">
      <div class="bonus-card-top">
        <span class="bonus-badge">🎯 Líder KO</span>
      </div>
      <div class="bonus-score">${board[0] ? board[0].name : "A definir"}</div>
      <div class="bonus-winners muted">${board[0] ? `${board[0].points} pts na fase final` : "aguardando palpites"}</div>
    </button>
    <button class="bonus-card knockout-radar-card" onclick="goToPage('knockout')">
      <div class="bonus-card-top">
        <span class="bonus-badge">📅 Próximos KO</span>
      </div>
      <div class="bonus-winners">${nextText}</div>
      <div class="bonus-winners muted">tambem aparecem em Jogos do Dia quando tiverem data de hoje</div>
    </button>
  `);
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

// ==================== EXPERIÊNCIAS / ZOEIRA ====================

function getParticipantStyle(summary) {
  if (!summary.finishedPredictions) return "Ainda misterioso";
  if (summary.exact >= 3) return "Nostradamus do caraio";
  if (summary.zeroes >= Math.max(3, summary.finishedPredictions / 2)) return "Artilheiro do zero";
  if (summary.draws >= Math.max(3, summary.predictions * 0.35)) return "Sindicato do empate";
  if (summary.accuracy >= 60) return "Frio e calculista";
  return "Chutador com convicção";
}

function getParticipantBadges(participantId) {
  const summary = getParticipantSummary(participantId);
  const badges = [];
  if (getRankPosition(participantId) === 1) badges.push(["👑", "Segue o líder"]);
  if (getRankPosition(participantId) === ranking.length) badges.push(["🧯", "Lanterna oficial"]);
  if (summary.exact > 0) badges.push(["🎯", `${summary.exact} cravada(s)`]);
  if (summary.zeroes >= 3) badges.push(["🧊", "Colecionador de zero"]);
  if (summary.draws >= 3) badges.push(["🤝", "Empateiro"]);
  if (summary.accuracy >= 60) badges.push(["🧠", "Está sabendo brincar"]);
  if (!badges.length) badges.push(["⏳", "Em construção"]);
  return badges;
}

function getFinishedMatchesSorted() {
  return matches.filter(isFinished).sort((a, b) => `${a.date || ""} ${a.time || ""}`.localeCompare(`${b.date || ""} ${b.time || ""}`));
}

function getMatchPoints(match) {
  return getPredictionsForMatch(match.match_id)
    .map(pred => ({ participantId: pred.participant_id, name: getParticipantName(pred.participant_id), points: scorePrediction(match, pred), pred }))
    .sort((a, b) => b.points - a.points);
}

function getLastFinishedMatch() {
  const finished = getFinishedMatchesSorted();
  return finished[finished.length - 1] || null;
}

function getRankingBeforeMatch(matchId) {
  const targetIndex = getFinishedMatchesSorted().findIndex(m => String(m.match_id) === String(matchId));
  const previous = targetIndex <= 0 ? [] : getFinishedMatchesSorted().slice(0, targetIndex);
  const rows = participants.map(p => ({
    participantId: p.participant_id,
    name: p.name || p.nickname || getParticipantName(p.participant_id),
    points: previous.reduce((sum, match) => {
      const pred = predictions.find(item => String(item.participant_id) === String(p.participant_id) && String(item.match_id) === String(match.match_id));
      return sum + (pred ? scorePrediction(match, pred) : 0);
    }, 0)
  })).sort((a, b) => b.points - a.points);
  return rows.map((row, index) => ({ ...row, position: index + 1 }));
}

function getMatchImpact(match) {
  if (!match) return [];
  const before = getRankingBeforeMatch(match.match_id);
  const after = ranking.map((row, index) => ({
    participantId: row.participant_id || getParticipantIdByName(row.name || row.nickname),
    name: row.name || row.nickname,
    points: getPoints(row),
    position: index + 1
  }));
  return after.map(row => {
    const old = before.find(item => String(item.participantId) === String(row.participantId));
    const delta = old ? old.position - row.position : 0;
    const matchPoint = getMatchPoints(match).find(item => String(item.participantId) === String(row.participantId));
    return { ...row, delta, matchPoints: matchPoint ? matchPoint.points : 0 };
  }).sort((a, b) => b.delta - a.delta || b.matchPoints - a.matchPoints);
}

function getAutoNews() {
  const leader = ranking[0];
  const lantern = ranking[ranking.length - 1];
  const lastMatch = getLastFinishedMatch();
  const zebra = getBiggestZebra();
  const bestGame = getBestPointsGame();
  const news = [];
  if (leader) news.push({ icon: "👑", title: `${leader.name || leader.nickname} dorme líder`, text: `${getPoints(leader)} pts e o direito temporário de falar besteira no grupo.` });
  if (lantern) news.push({ icon: "🧯", title: `${lantern.name || lantern.nickname} segura a lanterna`, text: `A luz no fim do túnel é ele mesmo carregando.` });
  if (lastMatch) news.push({ icon: "⚽", title: `Último apito: ${lastMatch.home_team} ${lastMatch.home_score} x ${lastMatch.away_score} ${lastMatch.away_team}`, text: "A rodada mexeu no emocional e possivelmente em amizades antigas." });
  if (zebra) news.push({ icon: "🦓", title: "Zebra detectada", text: `Só ${zebra.pct}% foram no resultado de ${zebra.match.home_team} x ${zebra.match.away_team}.` });
  if (bestGame) news.push({ icon: "💎", title: "Jogo que mais pagou", text: `${bestGame.points} pontos distribuídos. Teve gente que saiu sorrindo sem merecer tanto.` });
  return news.slice(0, 5);
}

function getMatchDrama(match) {
  const stats = getPredictionResultStats(match);
  if (!stats.total) return "Sem palpites suficientes para criar crise.";
  const majority = getMajorityResult(match);
  if (isFinished(match)) {
    const real = getMatchResult(match.home_score, match.away_score);
    const right = real === "home" ? stats.home : real === "draw" ? stats.draw : stats.away;
    const pct = Math.round(right / stats.total * 100);
    return pct <= 25
      ? `Só ${pct}% acertaram o caminho. O resto vai chamar de zebra para não assumir.`
      : `${pct}% foram no resultado certo. Rodada sem tanta tragédia, o que é raro.`;
  }
  return majority && majority.pct >= 65
    ? `${majority.pct}% estão fechados com ${majority.label}. Se der ruim, a vergonha vem em grupo.`
    : "Jogo dividido. Excelente oportunidade para alguém virar gênio depois do apito.";
}

function renderRoundMode() {
  const today = getTodayLocal();
  let roundMatches = matches.filter(m => m.date === today || isLiveMatch(m));
  if (!roundMatches.length) roundMatches = matches.filter(isFuture).slice(0, 4);
  const last = getLastFinishedMatch();
  const impact = getMatchImpact(last).filter(item => item.delta || item.matchPoints).slice(0, 8);

  setHTML("roundNews", getAutoNews().map(item => `
    <div class="news-card">
      <div class="news-icon">${item.icon}</div>
      <div><strong>${item.title}</strong><small>${item.text}</small></div>
    </div>
  `).join(""));

  setHTML("roundImpact", `
    <div class="impact-head">
      <div>
        <span>Antes x Depois</span>
        <strong>${last ? `${last.home_team} ${last.home_score} x ${last.away_score} ${last.away_team}` : "Sem jogo finalizado ainda"}</strong>
      </div>
      <small>${last ? "Quem subiu, quem pontuou e quem só assistiu a tragédia." : "Quando o primeiro jogo acabar, o estrago aparece aqui."}</small>
    </div>
    <div class="impact-list">
      ${impact.length ? impact.map(item => `
        <div class="impact-row" onclick="openParticipantModal('${item.participantId}')">
          ${renderAvatar(item.name, 32)}
          <strong>${item.name}</strong>
          <span>${item.matchPoints} pts no jogo</span>
          <b class="${item.delta > 0 ? 'up' : item.delta < 0 ? 'down' : ''}">${item.delta > 0 ? `+${item.delta}` : item.delta} pos.</b>
        </div>
      `).join("") : `<div class="empty-state">Sem impacto relevante ainda.</div>`}
    </div>
  `);

  setHTML("roundMatches", roundMatches.map(renderPremiumMatchCard).join(""));
}

function renderArena() {
  const summaries = participants.map(p => getParticipantSummary(p.participant_id));
  const exactKing = [...summaries].sort((a, b) => b.exact - a.exact || b.points - a.points)[0];
  const zeroKing = [...summaries].sort((a, b) => b.zeroes - a.zeroes || a.points - b.points)[0];
  const drawKing = [...summaries].sort((a, b) => b.draws - a.draws)[0];
  const leader = ranking[0];
  const lantern = ranking[ranking.length - 1];
  const awards = [
    ["👑", "Dono da firma", leader && (leader.name || leader.nickname), "Está no topo, então merece elogio e perseguição."],
    ["🧯", "Lanterna oficial", lantern && (lantern.name || lantern.nickname), "Iluminando o caminho dos outros."],
    ["🎯", "Mãe Dináh", exactKing && exactKing.name, `${exactKing ? exactKing.exact : 0} placar(es) exato(s).`],
    ["🧊", "Rei do zero", zeroKing && zeroKing.name, `${zeroKing ? zeroKing.zeroes : 0} jogo(s) sem pontuar.`],
    ["🤝", "Empatador oficial", drawKing && drawKing.name, `${drawKing ? drawKing.draws : 0} empate(s) apostado(s).`]
  ];

  setHTML("arenaBadges", awards.map(([icon, title, name, text]) => `
    <div class="arena-card">
      <div class="arena-icon">${icon}</div>
      <span>${title}</span>
      <strong>${name || "A definir"}</strong>
      <small>${text}</small>
    </div>
  `).join(""));

  setHTML("achievementWall", participants.map(p => {
    const name = p.name || p.nickname || getParticipantName(p.participant_id);
    return `
      <div class="achievement-row" onclick="openParticipantModal('${p.participant_id}')">
        ${renderAvatar(name, 34)}
        <strong>${name}</strong>
        <div>${getParticipantBadges(p.participant_id).map(([icon, label]) => `<span class="achievement-badge">${icon} ${label}</span>`).join("")}</div>
      </div>
    `;
  }).join(""));

  renderPositionHistory();
  renderComebackSimulator();
}

function renderPositionHistory() {
  const finished = getFinishedMatchesSorted();
  const top = ranking.slice(0, 8).map(row => row.participant_id || getParticipantIdByName(row.name || row.nickname));
  setHTML("positionHistory", top.map(pid => {
    const name = getParticipantName(pid);
    let points = 0;
    const steps = finished.map(match => {
      const pred = predictions.find(p => String(p.participant_id) === String(pid) && String(p.match_id) === String(match.match_id));
      points += pred ? scorePrediction(match, pred) : 0;
      return points;
    });
    const max = Math.max(...steps, 1);
    return `
      <div class="history-row" onclick="openParticipantModal('${pid}')">
        <strong>${name}</strong>
        <div class="history-spark">${steps.length ? steps.map(value => `<i style="height:${Math.max(8, Math.round(value / max * 42))}px"></i>`).join("") : "<small>Sem jogos finalizados</small>"}</div>
        <span>${points} pts</span>
      </div>
    `;
  }).join(""));
}

function renderComebackSimulator() {
  const remaining = matches.filter(isFuture).length;
  const leaderPoints = ranking.length ? getPoints(ranking[0]) : 0;
  setHTML("comebackSimulator", ranking.slice(0, 10).map(row => {
    const name = row.name || row.nickname;
    const pid = row.participant_id || getParticipantIdByName(name);
    const current = getPoints(row);
    const need = Math.max(0, leaderPoints - current + 1);
    const exactNeeded = remaining ? Math.ceil(need / 5) : 0;
    const text = need === 0 ? "Depende só de não fazer besteira." : remaining ? `Precisa de ${exactNeeded} cravada(s) ou uma rodada bem maluca.` : "Matematicamente virou saudade.";
    return `
      <div class="sim-card" onclick="openParticipantModal('${pid}')">
        ${renderAvatar(name, 34)}
        <strong>${name}</strong>
        <span>${current} pts</span>
        <small>${text}</small>
      </div>
    `;
  }).join(""));
}

function getRoundSummaryText() {
  const leader = ranking[0];
  const lantern = ranking[ranking.length - 1];
  const last = getLastFinishedMatch();
  const exactKing = participants.map(p => getParticipantSummary(p.participant_id)).sort((a, b) => b.exact - a.exact)[0];
  return [
    "Resumo Eggbrothers 26:",
    leader ? `${leader.name || leader.nickname} lidera com ${getPoints(leader)} pts.` : "",
    lantern ? `${lantern.name || lantern.nickname} segura a lanterna.` : "",
    last ? `Último jogo: ${last.home_team} ${last.home_score} x ${last.away_score} ${last.away_team}.` : "",
    exactKing ? `${exactKing.name} é o atual caçador de cravadas (${exactKing.exact}).` : ""
  ].filter(Boolean).join(" ");
}

async function copyRoundSummary() {
  const text = getRoundSummaryText();
  try {
    await navigator.clipboard.writeText(text);
    setText("shareStatus", "Resumo copiado para o WhatsApp.");
  } catch (error) {
    setText("shareStatus", text);
  }
}

// ==================== MATA-MATA ====================

function getKnockoutMatch(matchId) {
  return knockoutMatches.find(match => String(match.match_id) === String(matchId));
}

function normalizeKnockoutData() {
  knockoutMatches = knockoutMatches.map(row => ({
    ...row,
    phase: row.phase || row.fase || "",
    game_no: row.game_no || row.jogo || "",
    home_team: row.home_team || row.mandante || row.mandante_base || "",
    away_team: row.away_team || row.visitante || row.visitante_base || "",
    date: row.date || row.data || "",
    time: row.time || row.hora || "",
    home_score: row.home_score || row.gols_mandante || "",
    away_score: row.away_score || row.gols_visitante || "",
    status: row.status_site || row.status || row.status_base || "",
    winner: row.winner || row.vencedor || "",
    loser: row.loser || row.perdedor || "",
    home_source_type: row.home_source_type || row.tipo_home || "",
    home_source_match: row.home_source_match || row.origem_home || "",
    away_source_type: row.away_source_type || row.tipo_away || "",
    away_source_match: row.away_source_match || row.origem_away || ""
  }));

  knockoutPredictions = knockoutPredictions.map(row => ({
    ...row,
    phase: row.phase || row.fase || "",
    home_team: row.home_team || row.mandante || "",
    away_team: row.away_team || row.visitante || "",
    penalty_winner: row.penalty_winner || row.penal_winner || row.quem_passa_penal || row.quem_passa || row.passa_penal || row["if penal quem passa"] || "",
    points: row.points || row.pontos || "",
    locked: row.locked || row.travado || "NAO"
  }));
}

function getKnockoutWinner(match) {
  if (!match || !isFilled(match.home_score) || !isFilled(match.away_score)) return "";
  const home = getKnockoutTeam(match, "home");
  const away = getKnockoutTeam(match, "away");
  if (num(match.home_score) > num(match.away_score)) return home;
  if (num(match.away_score) > num(match.home_score)) return away;
  return match.winner || "Definir nos penaltis";
}

function getKnockoutLoser(match) {
  if (!match || !isFilled(match.home_score) || !isFilled(match.away_score)) return "";
  const home = getKnockoutTeam(match, "home");
  const away = getKnockoutTeam(match, "away");
  if (num(match.home_score) > num(match.away_score)) return away;
  if (num(match.away_score) > num(match.home_score)) return home;
  return match.loser || "Definir nos penaltis";
}

function getKnockoutSourceTeam(type, matchId) {
  const source = getKnockoutMatch(matchId);
  if (!source) return "";
  return type === "P" ? getKnockoutLoser(source) : getKnockoutWinner(source);
}

function getKnockoutTeam(match, side) {
  const direct = side === "home" ? match.home_team : match.away_team;
  if (direct) return direct;
  const sourceType = side === "home" ? match.home_source_type : match.away_source_type;
  const sourceMatch = side === "home" ? match.home_source_match : match.away_source_match;
  return getKnockoutSourceTeam(sourceType, sourceMatch) || "Aguardando";
}

function getKnockoutStatus(match) {
  if (isFilled(match.home_score) && isFilled(match.away_score)) return "Finalizado";
  const home = getKnockoutTeam(match, "home");
  const away = getKnockoutTeam(match, "away");
  if (home !== "Aguardando" && away !== "Aguardando") return "Aberto";
  return match.status || "Pendente";
}

function getTeamFlag(teamName) {
  const team = String(teamName || "").trim();
  if (!team || team === "Aguardando") return "⏳";

  const knownMatch = matches.find(match =>
    sameTeam(match.home_team, team) || sameTeam(match.away_team, team)
  );
  if (knownMatch) {
    if (sameTeam(knownMatch.home_team, team) && knownMatch.home_flag) return knownMatch.home_flag;
    if (sameTeam(knownMatch.away_team, team) && knownMatch.away_flag) return knownMatch.away_flag;
  }

  const flags = {
    "africa do sul": "🇿🇦",
    "alemanha": "🇩🇪",
    "arabia saudita": "🇸🇦",
    "argentina": "🇦🇷",
    "argelia": "🇩🇿",
    "australia": "🇦🇺",
    "austria": "🇦🇹",
    "belgica": "🇧🇪",
    "bolivia": "🇧🇴",
    "brasil": "🇧🇷",
    "canada": "🇨🇦",
    "chile": "🇨🇱",
    "colombia": "🇨🇴",
    "coreia do sul": "🇰🇷",
    "costa do marfim": "🇨🇮",
    "croacia": "🇭🇷",
    "dinamarca": "🇩🇰",
    "egito": "🇪🇬",
    "equador": "🇪🇨",
    "escocia": "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
    "espanha": "🇪🇸",
    "estados unidos": "🇺🇸",
    "eua": "🇺🇸",
    "franca": "🇫🇷",
    "gana": "🇬🇭",
    "holanda": "🇳🇱",
    "inglaterra": "🏴",
    "ira": "🇮🇷",
    "italia": "🇮🇹",
    "japao": "🇯🇵",
    "marrocos": "🇲🇦",
    "mexico": "🇲🇽",
    "nigeria": "🇳🇬",
    "noruega": "🇳🇴",
    "nova zelandia": "🇳🇿",
    "panama": "🇵🇦",
    "paraguai": "🇵🇾",
    "peru": "🇵🇪",
    "polonia": "🇵🇱",
    "portugal": "🇵🇹",
    "qatar": "🇶🇦",
    "senegal": "🇸🇳",
    "servia": "🇷🇸",
    "suecia": "🇸🇪",
    "suica": "🇨🇭",
    "tchequia": "🇨🇿",
    "tunisia": "🇹🇳",
    "turquia": "🇹🇷",
    "ucrania": "🇺🇦",
    "uruguai": "🇺🇾"
  };
  return flags[normalizeName(team)] || "🌐";
}

function getTeamFlagCode(teamName) {
  const codes = {
    "africa do sul": "za",
    "alemanha": "de",
    "arabia saudita": "sa",
    "argentina": "ar",
    "argelia": "dz",
    "australia": "au",
    "austria": "at",
    "belgica": "be",
    "bolivia": "bo",
    "brasil": "br",
    "canada": "ca",
    "chile": "cl",
    "colombia": "co",
    "coreia do sul": "kr",
    "costa do marfim": "ci",
    "croacia": "hr",
    "dinamarca": "dk",
    "egito": "eg",
    "equador": "ec",
    "escocia": "gb-sct",
    "espanha": "es",
    "estados unidos": "us",
    "eua": "us",
    "franca": "fr",
    "gana": "gh",
    "holanda": "nl",
    "inglaterra": "gb-eng",
    "ira": "ir",
    "italia": "it",
    "japao": "jp",
    "marrocos": "ma",
    "mexico": "mx",
    "nigeria": "ng",
    "noruega": "no",
    "nova zelandia": "nz",
    "panama": "pa",
    "paraguai": "py",
    "peru": "pe",
    "polonia": "pl",
    "portugal": "pt",
    "qatar": "qa",
    "senegal": "sn",
    "servia": "rs",
    "suecia": "se",
    "suica": "ch",
    "tchequia": "cz",
    "tunisia": "tn",
    "turquia": "tr",
    "ucrania": "ua",
    "uruguai": "uy"
  };
  return codes[normalizeName(teamName)];
}

function renderKnockoutFlag(teamName, extraClass = "") {
  const code = getTeamFlagCode(teamName);
  const fallback = getTeamFlag(teamName);
  const label = String(teamName || "Aguardando").replace(/"/g, "&quot;");
  const src = code && /^[a-z]{2}$/.test(code)
    ? `https://cdn.jsdelivr.net/npm/country-flag-icons@1.5.19/3x2/${code.toUpperCase()}.svg`
    : code ? `https://flagcdn.com/${code}.svg` : "";
  return `
    <span class="knockout-flag ${code ? `flag-${code}` : ""} ${extraClass}">
      ${code
        ? `<img class="knockout-flag-img" src="${src}" alt="Bandeira ${label}" onerror="this.replaceWith(document.createTextNode('${fallback}'))">`
        : `<span class="knockout-flag-fallback">${fallback}</span>`}
    </span>
  `;
}

function getKnockoutPredictedWinner(match, pred) {
  if (!match || !pred || !isFilled(pred.pred_home) || !isFilled(pred.pred_away)) return "";
  const home = getKnockoutTeam(match, "home");
  const away = getKnockoutTeam(match, "away");
  const predHome = num(pred.pred_home);
  const predAway = num(pred.pred_away);
  if (predHome > predAway) return home;
  if (predAway > predHome) return away;
  return pred.penalty_winner || pred["if penal quem passa"] || "";
}

function scoreKnockoutPrediction(match, pred) {
  if (!match || !isFilled(match.home_score) || !isFilled(match.away_score)) return isFilled(pred.points) ? num(pred.points) : 0;
  if (!isFilled(pred.pred_home) || !isFilled(pred.pred_away)) return 0;
  const realWinner = getKnockoutWinner(match);
  const predWinner = getKnockoutPredictedWinner(match, pred);
  if (!predWinner || !sameTeam(predWinner, realWinner)) return 0;
  return Math.abs(num(pred.pred_home) - num(pred.pred_away)) === Math.abs(num(match.home_score) - num(match.away_score)) ? 8 : 3;
}

function getKnockoutPredictionRows(matchId) {
  return knockoutPredictions.filter(pred => String(pred.match_id) === String(matchId));
}

function getKnockoutLeaderboard() {
  const board = {};
  knockoutPredictions.forEach(pred => {
    const id = pred.participant_id || pred.participant_name || "Participante";
    const name = pred.participant_name || getParticipantName(pred.participant_id) || id;
    const match = getKnockoutMatch(pred.match_id);
    if (!board[id]) board[id] = { id, name, points: 0, hits: 0, marginHits: 0, predictions: 0 };
    const pts = scoreKnockoutPrediction(match, pred);
    board[id].points += pts;
    board[id].hits += pts ? 1 : 0;
    board[id].marginHits += pts === 8 ? 1 : 0;
    board[id].predictions += isFilled(pred.pred_home) && isFilled(pred.pred_away) ? 1 : 0;
  });
  return Object.values(board).sort((a, b) => b.points - a.points || b.marginHits - a.marginHits);
}

function getGroupRankingEntry(participantId, fallbackName = "") {
  const name = fallbackName || getParticipantName(participantId);
  return ranking.find(row => {
    const rowId = row.participant_id || getParticipantIdByName(row.name || row.nickname);
    return String(rowId) === String(participantId) || (name && (row.name || row.nickname) === name);
  });
}

function getKnockoutStatsMap() {
  const map = {};
  participants.forEach(player => {
    const id = String(player.participant_id);
    map[id] = {
      id,
      name: player.name || player.nickname || getParticipantName(id),
      points: 0,
      hits: 0,
      marginHits: 0,
      predictions: 0
    };
  });

  getKnockoutLeaderboard().forEach(row => {
    const id = String(row.id);
    map[id] = { ...row, id, name: row.name || getParticipantName(id) || id };
  });

  return map;
}

function getFinalLeaderboard() {
  const koMap = getKnockoutStatsMap();
  const players = participants.length
    ? participants
    : ranking.map(row => ({
        participant_id: row.participant_id || getParticipantIdByName(row.name || row.nickname),
        name: row.name || row.nickname
      }));

  return players.map(player => {
    const id = String(player.participant_id || getParticipantIdByName(player.name || player.nickname) || player.name);
    const name = player.name || player.nickname || getParticipantName(id);
    const groupRow = getGroupRankingEntry(id, name);
    const groupPoints = groupRow ? getPoints(groupRow) : calcTotalPoints(id);
    const knockout = koMap[id] || { points: 0, hits: 0, marginHits: 0, predictions: 0 };
    return {
      id,
      name,
      groupPoints,
      knockoutPoints: knockout.points || 0,
      totalPoints: groupPoints + (knockout.points || 0),
      knockoutHits: knockout.hits || 0,
      knockoutMarginHits: knockout.marginHits || 0,
      knockoutPredictions: knockout.predictions || 0
    };
  }).sort((a, b) =>
    b.totalPoints - a.totalPoints ||
    b.knockoutPoints - a.knockoutPoints ||
    b.groupPoints - a.groupPoints ||
    a.name.localeCompare(b.name)
  );
}

function openKnockoutMatchModal(matchId) {
  const match = getKnockoutMatch(matchId);
  if (!match) return;
  const modal = document.getElementById("matchModal");
  const content = document.getElementById("matchModalContent");
  const home = getKnockoutTeam(match, "home");
  const away = getKnockoutTeam(match, "away");
  const homeFlag = getTeamFlag(home);
  const awayFlag = getTeamFlag(away);
  const rows = getKnockoutPredictionRows(matchId);
  content.innerHTML = `
    <div class="match-modal-header">
      <span class="match-modal-group">${match.phase}</span>
      <span class="match-modal-date">${getKnockoutStatus(match)}</span>
    </div>
    <div class="match-modal-score knockout-modal-score">
      <div class="match-modal-team">
        ${renderKnockoutFlag(home, "match-modal-flag")}
        <strong>${home}</strong>
      </div>
      <div class="match-modal-result">
        ${isFilled(match.home_score) && isFilled(match.away_score)
          ? `<span class="match-modal-scoreline">${match.home_score} - ${match.away_score}</span>`
          : `<span class="match-modal-vs">VS</span>`}
      </div>
      <div class="match-modal-team">
        ${renderKnockoutFlag(away, "match-modal-flag")}
        <strong>${away}</strong>
      </div>
    </div>
    <h3 class="modal-section-title">Palpites do mata-mata</h3>
    <div class="match-preds-list">
      ${rows.length ? rows.map(pred => {
        const pts = scoreKnockoutPrediction(match, pred);
        const predHome = pred.home_team || home;
        const predAway = pred.away_team || away;
        const predWinner = getKnockoutPredictedWinner(match, pred);
        const penaltyNote = num(pred.pred_home) === num(pred.pred_away) && predWinner
          ? ` · passa: ${getTeamFlag(predWinner)} ${predWinner}`
          : "";
        return `
          <div class="match-pred-row" onclick="${pred.participant_id ? `openParticipantModal('${pred.participant_id}')` : ""}">
            ${renderAvatar(pred.participant_name || getParticipantName(pred.participant_id), 32)}
            <div class="pred-info">
              <strong>${pred.participant_name || getParticipantName(pred.participant_id)}</strong>
              <small>${getTeamFlag(predHome)} ${predHome} ${pred.pred_home || "-"} x ${pred.pred_away || "-"} ${predAway} ${getTeamFlag(predAway)}${penaltyNote}</small>
            </div>
            <span class="pts-badge ${pts === 8 ? "pts-bonus" : pts === 3 ? "pts-3" : "pts-0"}">${pts ? `+${pts}` : "0"}</span>
          </div>
        `;
      }).join("") : `<div class="empty-state">Sem palpites publicados para este jogo.</div>`}
    </div>
  `;
  modal.classList.add("open");
  document.body.style.overflow = "hidden";
}

function renderKnockout() {
  const finished = knockoutMatches.filter(match => getKnockoutStatus(match) === "Finalizado").length;
  const open = knockoutMatches.filter(match => getKnockoutStatus(match) === "Aberto").length;
  const pending = knockoutMatches.length - finished - open;
  const board = getKnockoutLeaderboard();
  const finalBoard = getFinalLeaderboard();
  setHTML("knockoutSummary", `
    <button class="arcade-stat-card" onclick="goToPage('knockout')"><span>KO MATCHES</span><strong>${knockoutMatches.length}</strong><b>${finished}</b><small>finalizados</small></button>
    <button class="arcade-stat-card" onclick="goToPage('knockout')"><span>ABERTOS</span><strong>${open}</strong><b>PLAY</b><small>times definidos para palpitar</small></button>
    <button class="arcade-stat-card" onclick="goToPage('knockout')"><span>PENDENTES</span><strong>${pending}</strong><b>WAIT</b><small>dependem de vencedores anteriores</small></button>
    <button class="arcade-stat-card" onclick="goToPage('knockout')"><span>LEADER</span><strong>${board[0] ? board[0].name : "A definir"}</strong><b>${board[0] ? board[0].points : 0}</b><small>pontos no mata-mata</small></button>
    <button class="arcade-stat-card" onclick="goToPage('ranking')"><span>FINAL RANK</span><strong>${finalBoard[0] ? finalBoard[0].name : "A definir"}</strong><b>${finalBoard[0] ? finalBoard[0].totalPoints : 0}</b><small>grupos + mata-mata</small></button>
  `);

  setHTML("knockoutLeaderboard", `
    <div class="two-column-grid">
      <div>
        <div class="shame-head">
          <div><span>Ranking Mata-Mata</span><strong>Quem esta sobrevivendo no knockout</strong></div>
          <small>+3 vencedor | +8 vencedor e diferenca de gols</small>
        </div>
        <div class="shame-list">
          ${board.length ? board.slice(0, 10).map((row, index) => `
            <div class="shame-row" onclick="${row.id ? `openParticipantModal('${row.id}')` : ""}">
              <div class="shame-pos">${index + 1}</div>
              ${renderAvatar(row.name, 34)}
              <div class="shame-info"><strong>${row.name}</strong><small>${row.hits} acerto(s), ${row.marginHits} margem(ns), ${row.predictions} palpite(s)</small></div>
              <div class="shame-tag">${row.points} pts</div>
            </div>
          `).join("") : `<div class="empty-state">Assim que os palpites forem publicados, o ranking do mata-mata aparece aqui.</div>`}
        </div>
      </div>
      <div>
        <div class="shame-head">
          <div><span>Ranking Final</span><strong>Fase de grupos + fase final</strong></div>
          <small>Soma automatica do ranking atual com o mata-mata</small>
        </div>
        <div class="shame-list">
          ${finalBoard.length ? finalBoard.slice(0, 10).map((row, index) => `
            <div class="shame-row" onclick="${row.id ? `openParticipantModal('${row.id}')` : ""}">
              <div class="shame-pos">${index + 1}</div>
              ${renderAvatar(row.name, 34)}
              <div class="shame-info"><strong>${row.name}</strong><small>${row.groupPoints} grupos + ${row.knockoutPoints} mata-mata</small></div>
              <div class="shame-tag">${row.totalPoints} pts</div>
            </div>
          `).join("") : `<div class="empty-state">Ranking final aparece aqui quando os participantes carregarem.</div>`}
        </div>
      </div>
    </div>
  `);

  const phases = ["32 avos de final", "Oitavas de final", "Quartas de final", "Semi final", "Final", "Disputa de 3º Lugar"];
  setHTML("knockoutBracket", phases.map(phase => {
    const rows = knockoutMatches.filter(match => match.phase === phase);
    if (!rows.length) return "";
    return `
      <div class="knockout-phase">
        <h3>${phase}</h3>
        <div class="knockout-match-grid">
          ${rows.map(match => {
            const home = getKnockoutTeam(match, "home");
            const away = getKnockoutTeam(match, "away");
            const homeFlag = getTeamFlag(home);
            const awayFlag = getTeamFlag(away);
            const status = getKnockoutStatus(match);
            const predCount = getKnockoutPredictionRows(match.match_id).length;
            const statusCode = status === "Finalizado" ? "DONE" : status === "Aberto" ? "READY" : "LOCK";
            return `
              <div class="knockout-match-card ${status === "Finalizado" ? "finished" : status === "Aberto" ? "open" : "pending"}" onclick="openKnockoutMatchModal('${match.match_id}')">
                <div class="match-card-header">
                  <span class="badge ${status === "Finalizado" ? "badge-done" : status === "Aberto" ? "badge-live" : "badge-future"}">${status}</span>
                  <span class="match-card-meta">${match.match_id}</span>
                </div>
                <div class="knockout-versus">
                  <div class="knockout-team">
                    ${renderKnockoutFlag(home)}
                    <strong>${home}</strong>
                  </div>
                  <div class="knockout-score-core">
                    <span>${statusCode}</span>
                    <b>${isFilled(match.home_score) && isFilled(match.away_score) ? `${match.home_score} - ${match.away_score}` : "VS"}</b>
                  </div>
                  <div class="knockout-team knockout-team-away">
                    ${renderKnockoutFlag(away)}
                    <strong>${away}</strong>
                  </div>
                </div>
                <div class="match-arcade-strip">
                  <button><b>${predCount}</b><span>palpites</span></button>
                  <button><b>${status === "Pendente" ? "LOCK" : "OPEN"}</b><span>${status === "Pendente" ? "aguarde" : "clicar"}</span></button>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }).join(""));
}

// ==================== RANKING ====================

function filterRanking(query) {
  rankingSearch = query.toLowerCase();
  renderRanking();
}

function renderKnockoutRankingTable() {
  const board = getKnockoutLeaderboard();
  setHTML("knockoutRankingBody", board.map((row, index) => `
    <tr class="ranking-row" onclick="${row.id ? `openParticipantModal('${row.id}')` : ""}">
      <td class="rank-pos">${index + 1}</td>
      <td>
        <div class="table-player">
          ${renderAvatar(row.name, 36)}
          <div><strong>${row.name}</strong><small>fase final</small></div>
        </div>
      </td>
      <td class="green-number">${row.points}</td>
      <td class="blue-number">${row.hits}</td>
      <td class="yellow-number">${row.marginHits}</td>
      <td>${row.predictions}</td>
    </tr>
  `).join("") || `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:24px">Assim que a aba de palpites mata-mata estiver publicada, este ranking aparece aqui.</td></tr>`);
}

function renderFinalRankingTable() {
  const board = getFinalLeaderboard();
  const leader = board[0];
  const vice = board[1];
  const totalKoPoints = board.reduce((sum, row) => sum + row.knockoutPoints, 0);
  const maxPts = leader ? leader.totalPoints : 1;

  setHTML("finalRankingSummary", `
    <button class="arcade-stat-card" onclick="${leader ? `openParticipantModal('${leader.id}')` : ""}">
      <span>FINAL PLAYER 1</span><strong>${leader ? leader.name : "A definir"}</strong><b>${leader ? leader.totalPoints : 0}</b><small>pontos totais</small>
    </button>
    <button class="arcade-stat-card" onclick="goToPage('knockout')">
      <span>KO SCORE</span><strong>${totalKoPoints}</strong><b>PTS</b><small>pontos vindos da fase final</small>
    </button>
    <button class="arcade-stat-card" onclick="goToPage('ranking')">
      <span>LEAD GAP</span><strong>${leader && vice ? leader.totalPoints - vice.totalPoints : 0}</strong><b>PTS</b><small>vantagem no ranking final</small>
    </button>
  `);

  setHTML("finalRankingBody", board.map((row, index) => {
    const barWidth = maxPts > 0 ? Math.round(row.totalPoints / maxPts * 100) : 0;
    const medal = index === 0 ? "1P" : index === 1 ? "2P" : index === 2 ? "3P" : index + 1;
    return `
      <tr class="ranking-row ${index < 3 ? 'top-row' : ''}" onclick="${row.id ? `openParticipantModal('${row.id}')` : ""}">
        <td class="rank-pos">${medal}</td>
        <td>
          <div class="table-player">
            ${renderAvatar(row.name, 36)}
            <div>
              <strong>${row.name}</strong>
              <div class="pts-bar-wrap"><div class="pts-bar" style="width:${barWidth}%"></div></div>
            </div>
          </div>
        </td>
        <td class="green-number">${row.totalPoints}</td>
        <td>${row.groupPoints}</td>
        <td class="yellow-number">${row.knockoutPoints}</td>
        <td><span class="aprv-pill">${row.knockoutPredictions ? "KO ativo" : "aguardando KO"}</span></td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:24px">Ranking final aparece aqui quando os participantes carregarem.</td></tr>`);
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

  renderKnockoutRankingTable();
  renderFinalRankingTable();
}

// ==================== JOGOS ====================

function filterMatches(filter, btn) {
  currentMatchFilter = filter;
  document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  renderMatches();
}

function setMatchControl(key, value) {
  if (key === "group") matchGroupFilter = value;
  if (key === "bonus") matchBonusFilter = value;
  if (key === "search") matchSearch = String(value || "").toLowerCase();
  if (key === "sort") matchSort = value;
  renderMatches();
}

function getMatchTimestamp(match) {
  const parsed = new Date(`${match.date || "1900-01-01"}T${match.time || "00:00"}`);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function getMatchTotalPoints(match) {
  return getPredictionsForMatch(match.match_id).reduce((sum, pred) => sum + scorePrediction(match, pred), 0);
}

function getMatchExactWinners(match) {
  if (!isFinished(match)) return [];
  return getPredictionsForMatch(match.match_id)
    .filter(pred => num(pred.pred_home) === num(match.home_score) && num(pred.pred_away) === num(match.away_score))
    .map(pred => ({ participantId: pred.participant_id, name: getParticipantName(pred.participant_id), points: scorePrediction(match, pred) }));
}

function getMatchDramaScore(match) {
  const stats = getPredictionResultStats(match);
  if (!stats.total) return 0;
  const spread = Math.max(stats.homePct, stats.drawPct, stats.awayPct) - Math.min(stats.homePct, stats.drawPct, stats.awayPct);
  return (100 - spread) + (isFinished(match) ? Math.max(0, 20 - getMatchExactWinners(match).length * 3) : 0);
}

function sortMatchesForArcade(list) {
  return [...list].sort((a, b) => {
    if (matchSort === "oldest") return getMatchTimestamp(a) - getMatchTimestamp(b);
    if (matchSort === "points") return getMatchTotalPoints(b) - getMatchTotalPoints(a);
    if (matchSort === "drama") return getMatchDramaScore(b) - getMatchDramaScore(a);
    const weight = match => isLiveMatch(match) ? 4 : isFinished(match) ? 3 : 1;
    const statusDiff = weight(b) - weight(a);
    if (statusDiff) return statusDiff;
    if (isFuture(a) && isFuture(b)) return getMatchTimestamp(a) - getMatchTimestamp(b);
    return getMatchTimestamp(b) - getMatchTimestamp(a);
  });
}

function renderMatchAdvancedFilters(filteredCount) {
  const groups = [...new Set(matches.map(m => m.group).filter(Boolean))].sort();
  setHTML("matchAdvancedFilters", `
    <div class="arcade-control">
      <label>Buscar</label>
      <input value="${matchSearch}" oninput="setMatchControl('search', this.value)" placeholder="Time, grupo ou #jogo">
    </div>
    <div class="arcade-control">
      <label>Grupo</label>
      <select onchange="setMatchControl('group', this.value)">
        <option value="all"${matchGroupFilter === "all" ? " selected" : ""}>Todos</option>
        ${groups.map(group => `<option value="${group}"${matchGroupFilter === group ? " selected" : ""}>${group}</option>`).join("")}
      </select>
    </div>
    <div class="arcade-control">
      <label>Tipo</label>
      <select onchange="setMatchControl('bonus', this.value)">
        <option value="all"${matchBonusFilter === "all" ? " selected" : ""}>Todos</option>
        <option value="bonus"${matchBonusFilter === "bonus" ? " selected" : ""}>Bonus</option>
        <option value="normal"${matchBonusFilter === "normal" ? " selected" : ""}>Normal</option>
      </select>
    </div>
    <div class="arcade-control">
      <label>Ordem</label>
      <select onchange="setMatchControl('sort', this.value)">
        <option value="latest"${matchSort === "latest" ? " selected" : ""}>Ultimo realizado primeiro</option>
        <option value="oldest"${matchSort === "oldest" ? " selected" : ""}>Calendario</option>
        <option value="points"${matchSort === "points" ? " selected" : ""}>Mais pontos</option>
        <option value="drama"${matchSort === "drama" ? " selected" : ""}>Mais drama</option>
      </select>
    </div>
    <div class="arcade-counter"><span>${filteredCount}</span><small>jogos no visor</small></div>
  `);
}

function renderMatches() {
  let filtered = [...matches];
  if (currentMatchFilter === "live") filtered = matches.filter(isLiveMatch);
  if (currentMatchFilter === "finished") filtered = matches.filter(isFinished);
  if (currentMatchFilter === "future") filtered = matches.filter(isFuture);
  if (matchGroupFilter !== "all") filtered = filtered.filter(match => match.group === matchGroupFilter);
  if (matchBonusFilter !== "all") {
    const bonusIds = getBonusMatchIds();
    filtered = filtered.filter(match => matchBonusFilter === "bonus" ? bonusIds.includes(String(match.match_id)) : !bonusIds.includes(String(match.match_id)));
  }
  if (matchSearch) {
    filtered = filtered.filter(match => `${match.match_id || ""} ${match.home_team || ""} ${match.away_team || ""} ${match.group || ""}`.toLowerCase().includes(matchSearch));
  }
  filtered = sortMatchesForArcade(filtered);
  renderMatchAdvancedFilters(filtered.length);
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
  const drama = getMatchDrama(match);
  const stats = getPredictionResultStats(match);
  const totalPts = getMatchTotalPoints(match);
  const exactWinners = getMatchExactWinners(match);
  const majority = getMajorityResult(match);

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
      <div class="match-drama">${drama}</div>
      <div class="match-arcade-strip">
        <button onclick="openMatchModal('${match.match_id}');event.stopPropagation()"><b>${stats.total}</b><span>palpites</span></button>
        <button onclick="openMatchModal('${match.match_id}');event.stopPropagation()"><b>${totalPts}</b><span>pts</span></button>
        <button onclick="openMatchModal('${match.match_id}');event.stopPropagation()"><b>${exactWinners.length}</b><span>cravadas</span></button>
        <button onclick="openMatchModal('${match.match_id}');event.stopPropagation()"><b>${majority ? majority.pct : 0}%</b><span>${majority ? majority.label : "sem maioria"}</span></button>
      </div>
      ${exactWinners.length ? `
        <div class="match-winners-line">
          <span>PERFECT HIT</span>
          ${exactWinners.slice(0, 4).map(item => `<button onclick="openParticipantModal('${item.participantId}');event.stopPropagation()">${item.name} +${item.points}</button>`).join("")}
        </div>
      ` : ""}
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

  renderArcadeStats();
  renderAccuracyBoards();
  renderSpecialInsights();
  renderComebackTable();
}

function getStatsLeaders() {
  const summaries = participants.map(p => getParticipantSummary(p.participant_id));
  const bestAccuracy = [...summaries].filter(s => s.finishedPredictions >= 2).sort((a, b) => b.accuracy - a.accuracy || b.points - a.points)[0];
  const mostZeroes = [...summaries].sort((a, b) => b.zeroes - a.zeroes || a.points - b.points)[0];
  const mostDraws = [...summaries].sort((a, b) => b.draws - a.draws)[0];
  return { bestAccuracy, mostZeroes, mostDraws };
}

function getExactRate() {
  const finishedPreds = predictions.filter(pred => {
    const match = getMatchById(pred.match_id);
    return match && isFinished(match);
  });
  if (!finishedPreds.length) return 0;
  const exact = finishedPreds.filter(pred => {
    const match = getMatchById(pred.match_id);
    const pts = scorePrediction(match, pred);
    return pts === 5 || pts === 10;
  }).length;
  return Math.round(exact / finishedPreds.length * 100);
}

function getAverageGoals() {
  const finished = matches.filter(isFinished);
  if (!finished.length) return 0;
  const goals = finished.reduce((sum, match) => sum + num(match.home_score) + num(match.away_score), 0);
  return (goals / finished.length).toFixed(1);
}

function renderArcadeStats() {
  const leader = ranking[0];
  const vice = ranking[1];
  const leaderGap = leader && vice ? getPoints(leader) - getPoints(vice) : 0;
  const totalPoints = matches.filter(isFinished).reduce((sum, match) => sum + getMatchTotalPoints(match), 0);
  const zebra = getBiggestZebra();
  const bestGame = getBestPointsGame();
  const commonScore = getCommonScore();
  const consensus = getHighestConsensus();
  const { bestAccuracy, mostZeroes, mostDraws } = getStatsLeaders();
  const koFinished = knockoutMatches.filter(match => getKnockoutStatus(match) === "Finalizado").length;
  const koOpen = knockoutMatches.filter(match => getKnockoutStatus(match) === "Aberto").length;
  const koBoard = getKnockoutLeaderboard();
  const koPoints = koBoard.reduce((sum, row) => sum + row.points, 0);
  const finalBoard = getFinalLeaderboard();
  const finalLeader = finalBoard[0];

  setHTML("statsArcadePanel", `
    ${leader ? `
      <button class="arcade-stat-card" onclick="openParticipantModal('${leader.participant_id || getParticipantIdByName(leader.name || leader.nickname)}')">
        <span>PLAYER 1</span><strong>${leader.name || leader.nickname}</strong><b>+${leaderGap}</b><small>pontos de vantagem</small>
      </button>` : ""}
    <button class="arcade-stat-card" onclick="goToPage('charts')">
      <span>TOTAL SCORE</span><strong>${totalPoints}</strong><b>PTS</b><small>distribuidos nos jogos finalizados</small>
    </button>
    <button class="arcade-stat-card" onclick="goToPage('predictions')">
      <span>PERFECT RATE</span><strong>${getExactRate()}%</strong><b>CRAVADA</b><small>taxa de placar exato nos palpites ja revelados</small>
    </button>
    ${bestAccuracy ? `
      <button class="arcade-stat-card" onclick="openParticipantModal('${bestAccuracy.participantId}')">
        <span>HOT HAND</span><strong>${bestAccuracy.name}</strong><b>${bestAccuracy.accuracy}%</b><small>melhor aproveitamento com jogos finalizados</small>
      </button>` : ""}
    ${zebra ? `
      <button class="arcade-stat-card danger" onclick="openMatchModal('${zebra.match.match_id}')">
        <span>BOSS FIGHT</span><strong>${zebra.match.home_team} x ${zebra.match.away_team}</strong><b>${zebra.pct}%</b><small>foram no resultado vencedor</small>
      </button>` : ""}
    ${bestGame ? `
      <button class="arcade-stat-card" onclick="openMatchModal('${bestGame.match.match_id}')">
        <span>JACKPOT</span><strong>${bestGame.match.home_team} x ${bestGame.match.away_team}</strong><b>${bestGame.points}</b><small>pontos gerados nesse jogo</small>
      </button>` : ""}
    ${commonScore ? `
      <button class="arcade-stat-card" onclick="goToPage('charts')">
        <span>POPULAR BET</span><strong>${commonScore.score}</strong><b>${commonScore.count}x</b><small>placar mais escolhido</small>
      </button>` : ""}
    <button class="arcade-stat-card" onclick="goToPage('matches')">
      <span>GOAL METER</span><strong>${getAverageGoals()}</strong><b>G/J</b><small>media de gols por jogo finalizado</small>
    </button>
    ${consensus ? `
      <button class="arcade-stat-card" onclick="openMatchModal('${consensus.match.match_id}')">
        <span>CROWD MODE</span><strong>${consensus.match.home_team} x ${consensus.match.away_team}</strong><b>${consensus.pct}%</b><small>maior arquibancada virtual</small>
      </button>` : ""}
    ${mostZeroes ? `
      <button class="arcade-stat-card danger" onclick="openParticipantModal('${mostZeroes.participantId}')">
        <span>GAME OVER</span><strong>${mostZeroes.name}</strong><b>${mostZeroes.zeroes}</b><small>rodadas zeradas</small>
      </button>` : ""}
    ${mostDraws ? `
      <button class="arcade-stat-card" onclick="openParticipantModal('${mostDraws.participantId}')">
        <span>DRAW COMBO</span><strong>${mostDraws.name}</strong><b>${mostDraws.draws}</b><small>palpites em empate</small>
      </button>` : ""}
    <button class="arcade-stat-card" onclick="goToPage('knockout')">
      <span>KO OPEN</span><strong>${koOpen}</strong><b>JOGOS</b><small>mata-mata pronto para palpitar</small>
    </button>
    <button class="arcade-stat-card" onclick="goToPage('knockout')">
      <span>KO SCORE</span><strong>${koPoints}</strong><b>PTS</b><small>pontos distribuidos na fase final</small>
    </button>
    <button class="arcade-stat-card" onclick="goToPage('knockout')">
      <span>KO LEADER</span><strong>${koBoard[0] ? koBoard[0].name : "A definir"}</strong><b>${koBoard[0] ? koBoard[0].points : 0}</b><small>${koFinished} jogo(s) finalizado(s)</small>
    </button>
    <button class="arcade-stat-card" onclick="goToPage('ranking')">
      <span>FINAL LEADER</span><strong>${finalLeader ? finalLeader.name : "A definir"}</strong><b>${finalLeader ? finalLeader.totalPoints : 0}</b><small>ranking geral + mata-mata</small>
    </button>
  `);
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
      legend: { labels: { color: "#d9fff0", font: { family: "Silkscreen, Inter" } } }
    },
    scales: {
      x: { ticks: { color: "#8fb9aa" }, grid: { color: "rgba(85,255,127,0.12)" } },
      y: { ticks: { color: "#8fb9aa" }, grid: { color: "rgba(85,255,127,0.12)" } }
    },
    ...extra
  };
}

function renderCharts() {
  if (chartsRendered) {
    Object.values(charts).forEach(c => c && c.destroy && c.destroy());
    charts = {};
  }
  safeRender("Resenha", renderChartsRoast);
  safeRender("Resumo", renderChartsStory);
  safeRender("Corneta", renderShameBoard);
  safeRender("Pontos", renderPointsChart);
  safeRender("Exatos", renderExactChart);
  safeRender("Acertos", renderCorrectChart);
  safeRender("Distribuição", renderPredictionResultChart);
  safeRender("Status", renderMatchStatusChart);
  safeRender("Correlação", renderPointsExactChart);
  safeRender("Volume", renderPredictionVolumeChart);
  safeRender("Gols", renderFinishedGoalsChart);
  safeRender("Países", renderTopCountriesChart);
  safeRender("Placares", renderTopResultsChart);
  chartsRendered = true;
}

function getTopRanking(limit = 15) { return ranking.slice(0, limit); }

function safeRender(label, fn) {
  try {
    fn();
  } catch (error) {
    console.error(`Erro ao renderizar ${label}:`, error);
  }
}

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
      title: leader ? `${leader.name || leader.nickname}: segue o líder` : "Sem líder ainda",
      text: leader ? `${getPoints(leader)} pts. Média da galera: ${avgPoints}. Está confortável, mas pode peidar.` : "Quando tiver pontuação, a gente conversa.",
      action: leaderId ? `openParticipantModal('${leaderId}')` : ""
    },
    {
      tone: "danger",
      icon: "🧯",
      label: "Lanterna oficial",
      title: lantern ? `${lantern.name || lantern.nickname} está iluminando o caminho` : "Sem lanterna ainda",
      text: lantern ? `${getPoints(lantern)} pts e ${leaderGap} atrás do líder. Desiste aí... ou crava três seguidas só para calar geral.` : "A vergonha será calculada com carinho.",
      action: lanternId ? `openParticipantModal('${lanternId}')` : ""
    },
    {
      tone: "green",
      icon: "🎯",
      label: "Nostradamus do caraio",
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

function getChartSummaries() {
  return participants.map(p => getParticipantSummary(p.participant_id))
    .filter(item => item.predictions > 0 || item.finishedPredictions > 0);
}

function getAveragePoints() {
  return ranking.length ? Math.round(ranking.reduce((sum, p) => sum + getPoints(p), 0) / ranking.length) : 0;
}

function getChartLeader() {
  return ranking[0] || null;
}

function getChartLantern() {
  return ranking.length ? ranking[ranking.length - 1] : null;
}

function renderChartsStory() {
  const leader = getChartLeader();
  const lantern = getChartLantern();
  const finished = matches.filter(isFinished).length;
  const remaining = matches.filter(isFuture).length;
  const avg = getAveragePoints();
  const gap = leader && lantern ? getPoints(leader) - getPoints(lantern) : 0;
  const summaries = getChartSummaries();
  const zeroBoss = [...summaries].sort((a, b) => b.zeroes - a.zeroes || a.points - b.points)[0];

  setHTML("chartsStory", `
    <div class="story-main">
      <span>Resumo sem passar pano</span>
      <strong>${leader ? `${leader.name || leader.nickname} lidera com ${getPoints(leader)} pts` : "O bolão ainda está zerado"}</strong>
      <small>${leader && lantern ? `${lantern.name || lantern.nickname} segura a lanterna, ${gap} ponto(s) atrás. Média geral: ${avg} pts.` : "Assim que os resultados entrarem, a corneta começa oficialmente."}</small>
    </div>
    <div class="story-mini">
      <span>Jogos finalizados</span>
      <strong>${finished}</strong>
      <small>${remaining} ainda podem destruir certezas.</small>
    </div>
    <div class="story-mini">
      <span>Modo sofrimento</span>
      <strong>${zeroBoss && zeroBoss.zeroes ? zeroBoss.zeroes : 0}</strong>
      <small>${zeroBoss && zeroBoss.zeroes ? `${zeroBoss.name} é o atual especialista em sair sem ponto.` : "Ninguém merece corneta ainda."}</small>
    </div>
  `);
}

function renderShameBoard() {
  const summaries = getChartSummaries();
  const rows = summaries.map(item => ({
    ...item,
    painScore: item.zeroes * 3 + Math.max(0, 5 - item.exact) + Math.max(0, 25 - item.accuracy)
  })).sort((a, b) => b.painScore - a.painScore || a.points - b.points).slice(0, 8);

  setHTML("shameBoard", `
    <div class="shame-head">
      <div>
        <span>Mural da Corneta</span>
        <strong>Quem está devendo explicações</strong>
      </div>
      <small>Critério científico: zeros, baixo aproveitamento e pouca cravada. Ruim pa carai, mas com metodologia.</small>
    </div>
    <div class="shame-list">
      ${rows.length ? rows.map((row, index) => `
        <div class="shame-row" onclick="openParticipantModal('${row.participantId}')">
          <div class="shame-pos">${index + 1}</div>
          ${renderAvatar(row.name, 34)}
          <div class="shame-info">
            <strong>${row.name}</strong>
            <small>${row.zeroes} zero(s), ${row.exact} exato(s), ${row.accuracy}% aproveitamento</small>
          </div>
          <div class="shame-tag">${index === 0 ? "meme da vez" : row.points ? `${row.points} pts` : "em obras"}</div>
        </div>
      `).join("") : `<div class="empty-state">Ainda sem dados suficientes para cornetar com justiça.</div>`}
    </div>
  `);
}

function chartColorsForRanking(data, base = "#38bdf8") {
  return data.map((_, index) => {
    if (index === 0) return "#facc15";
    if (index === data.length - 1 && data.length > 2) return "#ef4444";
    return base;
  });
}

function chartTooltipSuffix(context, unit) {
  const label = context.label || "";
  const value = context.parsed && typeof context.parsed === "object" ? context.parsed.y ?? context.parsed.x : context.parsed;
  return `${label}: ${value} ${unit}`;
}

function renderPointsChart() {
  const data = getTopRanking();
  const leader = data[0];
  const last = data[data.length - 1];
  const gap = leader && last ? getPoints(leader) - getPoints(last) : 0;
  createChart("pointsChart", {
    type: "bar",
    data: {
      labels: data.map(p => p.name || p.nickname || "-"),
      datasets: [{ label: "Pontos", data: data.map(p => getPoints(p)), backgroundColor: chartColorsForRanking(data, "#22c55e"), borderColor: "#86efac", borderWidth: 1, borderRadius: 6 }]
    },
    options: baseChartOptions({ plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => chartTooltipSuffix(ctx, "pts") } } } })
  });
  setNote("pointsChartNote", leader && last ? `${leader.name || leader.nickname} olha todo mundo de cima. ${last.name || last.nickname} aparece em vermelho porque alguém precisa fechar a porta.` : "Quando entrar pontuação, este gráfico vira o placar oficial da provocação.");
}

function renderExactChart() {
  // FIX: usa recálculo local
  const data = getTopRanking().map(p => ({
    name: p.name || p.nickname || "-",
    value: calcExactScores(p.participant_id || getParticipantIdByName(p.name || p.nickname))
  })).sort((a, b) => b.value - a.value);
  const top = data[0];
  const bottom = data[data.length - 1];

  createChart("exactChart", {
    type: "bar",
    data: {
      labels: data.map(p => p.name),
      datasets: [{ label: "Placares exatos", data: data.map(p => p.value), backgroundColor: chartColorsForRanking(data, "#facc15"), borderColor: "#fde68a", borderWidth: 1, borderRadius: 6 }]
    },
    options: baseChartOptions({ indexAxis: "y", plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => chartTooltipSuffix(ctx, "cravada(s)") } } } })
  });
  setNote("exactChartNote", top && top.value ? `${top.name} está no modo vidente com ${top.value} placar(es) exato(s). ${bottom && bottom.value === 0 ? `${bottom.name} ainda está procurando a senha da bola de cristal.` : "Cravada aqui vale respeito e um pouco de desconfiança."}` : "Ainda ninguém cravou. O chute coletivo segue em fase de aquecimento.");
}

function renderCorrectChart() {
  // FIX: usa recálculo local
  const data = getTopRanking().map(p => ({
    name: p.name || p.nickname || "-",
    value: calcCorrectResults(p.participant_id || getParticipantIdByName(p.name || p.nickname))
  })).sort((a, b) => b.value - a.value);
  const top = data[0];

  createChart("correctChart", {
    type: "bar",
    data: {
      labels: data.map(p => p.name),
      datasets: [{ label: "Acertos (resultado)", data: data.map(p => p.value), backgroundColor: chartColorsForRanking(data, "#38bdf8"), borderColor: "#bae6fd", borderWidth: 1, borderRadius: 6 }]
    },
    options: baseChartOptions({ plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => chartTooltipSuffix(ctx, "acerto(s)") } } } })
  });
  setNote("correctChartNote", top && top.value ? `${top.name} está ganhando no arroz com feijão: acerta resultado mesmo sem acertar o placar bonito.` : "Sem acertos simples ainda. A turma está escolhendo lados com fé, não com evidência.");
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
  const max = Math.max(home, draw, away);
  const mood = max === home ? "mandantes" : max === away ? "visitantes" : "empates";
  setNote("predictionResultChartNote", `O bolão está mais inclinado para ${mood}. Quando todo mundo concorda muito, normalmente vem a rodada para ensinar humildade.`);
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
  const finished = matches.filter(isFinished).length;
  const live = matches.filter(isLiveMatch).length;
  const future = matches.filter(isFuture).length;
  setNote("matchStatusChartNote", `${finished} finalizado(s), ${live} ao vivo e ${future} pela frente. Ainda tem muito espaço para virada e para arrependimento público.`);
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
        backgroundColor: data.map(point => point.y === Math.max(...data.map(d => d.y)) ? "#facc15" : point.y === Math.min(...data.map(d => d.y)) ? "#ef4444" : "#38bdf8"),
        borderColor: "#dbeafe", pointRadius: 7, pointHoverRadius: 10
      }]
    },
    options: baseChartOptions({
      scales: {
        x: { title: { display: true, text: "Placares exatos", color: "#dbeafe" }, ticks: { color: "#94a3b8" }, grid: { color: "rgba(148,163,184,0.1)" } },
        y: { title: { display: true, text: "Pontos", color: "#dbeafe" }, ticks: { color: "#94a3b8" }, grid: { color: "rgba(148,163,184,0.1)" } }
      }
    })
  });
  setNote("pointsExactChartNote", "Quanto mais para cima e para a direita, mais a pessoa pode falar grosso no grupo. Embaixo e à esquerda é território de silêncio estratégico.");
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
    options: baseChartOptions({ indexAxis: "y", plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => chartTooltipSuffix(ctx, "palpite(s)") } } } })
  });
  const top = data[0];
  setNote("predictionVolumeChartNote", top ? `${top.name} está presente em ${top.count} palpite(s). Pelo menos não dá para acusar de abandono de elenco.` : "Sem volume de palpites para analisar.");
}

function renderFinishedGoalsChart() {
  const fin = matches.filter(isFinished);
  const goalData = fin.map(m => ({ match: m, goals: num(m.home_score) + num(m.away_score) }));
  const wild = [...goalData].sort((a, b) => b.goals - a.goals)[0];
  createChart("finishedGoalsChart", {
    type: "line",
    data: {
      labels: fin.map(m => `${m.home_team} x ${m.away_team}`),
      datasets: [{
        label: "Gols na partida",
        data: goalData.map(d => d.goals),
        borderColor: "#22c55e", backgroundColor: "rgba(34,197,94,0.15)", tension: 0.35, fill: true,
        pointBackgroundColor: "#22c55e", pointRadius: 5
      }]
    },
    options: baseChartOptions()
  });
  setNote("finishedGoalsChartNote", wild ? `${wild.match.home_team} x ${wild.match.away_team} teve ${wild.goals} gol(s). Jogo bom para quem gosta de caos e ruim para quem apostou 0 x 0.` : "Assim que sair resultado, aparece aqui onde a rodada foi mais animada.");
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
      datasets: [{ label: "Vezes apostada como vencedora", data: data.map(d => d[1]), backgroundColor: chartColorsForRanking(data, "#f97316"), borderColor: "#fdba74", borderWidth: 1, borderRadius: 6 }]
    },
    options: baseChartOptions({ plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => chartTooltipSuffix(ctx, "voto(s)") } } } })
  });
  setNote("topCountriesChartNote", data[0] ? `${data[0][0]} virou queridinha do bolão com ${data[0][1]} aposta(s) como vencedora. Favoritismo popular, que é diferente de garantia.` : "Sem apostas suficientes para eleger a seleção do coração.");
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
      datasets: [{ label: "Vezes apostado", data: data.map(d => d[1]), backgroundColor: chartColorsForRanking(data, "#06b6d4"), borderColor: "#67e8f9", borderWidth: 1, borderRadius: 6 }]
    },
    options: baseChartOptions({ plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => chartTooltipSuffix(ctx, "vez(es)") } } } })
  });
  setNote("topResultsChartNote", data[0] ? `${data[0][0].replace("-", " x ")} é o placar mais popular. É o palpite confortável: parece inteligente até a bola rolar.` : "Quando os palpites entrarem, este gráfico mostra o placar preferido da massa.");
}

// ==================== INIT ====================

async function init() {
  try {
    [participants, matches, predictions, ranking, knockoutMatches, knockoutPredictions] = await Promise.all([
      fetchCsv(SHEETS.PARTICIPANTS, "Participantes"),
      fetchCsv(SHEETS.MATCHES, "Jogos"),
      fetchCsv(SHEETS.PREDICTIONS, "Palpites"),
      fetchCsv(SHEETS.RANKING, "Ranking"),
      fetchOptionalCsv(FINAL_SHEETS.MATCHES, "Jogos mata-mata"),
      fetchOptionalCsv(FINAL_SHEETS.PREDICTIONS, "Palpites mata-mata")
    ]);

    normalizeMatchRows();
    normalizeKnockoutData();
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
    renderKnockout();
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
document.addEventListener("pointerdown", () => {
  if (pendingGoalCheer) unlockArcadeAudio();
}, { passive: true });

