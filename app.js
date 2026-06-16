const SHEETS = {
  PARTICIPANTS: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRqE3kkDDcPtqpGJ3PguUDsikJMNFbm0zdl9AJeK6e-_egbJmgYX29r50ESGoFqV0qe_aToL4aNgbBh/pub?gid=496109362&single=true&output=csv",
  MATCHES: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRqE3kkDDcPtqpGJ3PguUDsikJMNFbm0zdl9AJeK6e-_egbJmgYX29r50ESGoFqV0qe_aToL4aNgbBh/pub?gid=606750094&single=true&output=csv",
  PREDICTIONS: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRqE3kkDDcPtqpGJ3PguUDsikJMNFbm0zdl9AJeK6e-_egbJmgYX29r50ESGoFqV0qe_aToL4aNgbBh/pub?gid=1378690055&single=true&output=csv",
  RANKING: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRqE3kkDDcPtqpGJ3PguUDsikJMNFbm0zdl9AJeK6e-_egbJmgYX29r50ESGoFqV0qe_aToL4aNgbBh/pub?gid=379623986&single=true&output=csv"
};

function proxiedUrls(url) {
  return [
    url,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
  ];
}

let participants = [];
let matches = [];
let predictions = [];
let ranking = [];
let charts = {};

function showPage(pageId) {
  document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));
  document.getElementById(pageId).classList.add("active");
}

function setHTML(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.innerText = text;
}

async function fetchCsv(baseUrl, name) {
  const urls = proxiedUrls(baseUrl);
  let lastError = "";

  for (const url of urls) {
    try {
      const response = await fetch(url);

      if (!response.ok) {
        lastError = `${name} falhou. Status: ${response.status}`;
        continue;
      }

      const text = await response.text();

      if (!text || text.includes("<html") || text.includes("<!DOCTYPE html")) {
        lastError = `${name} retornou HTML, não CSV.`;
        continue;
      }

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

    headers.forEach((header, index) => {
      obj[header] = values[index] ? values[index].trim() : "";
    });

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

    if (char === '"' && insideQuotes && next === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === "," && !insideQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

function num(value) {
  if (value === null || value === undefined || value === "") return 0;
  return Number(String(value).replace(",", ".")) || 0;
}

function isFilled(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function getMatchResult(home, away) {
  const h = num(home);
  const a = num(away);

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

function isFuture(match) {
  return !isFinished(match);
}

function getParticipant(participantId) {
  return participants.find(p => String(p.participant_id) === String(participantId));
}

function getParticipantName(participantId) {
  const participant = getParticipant(participantId);
  return participant ? participant.name || participant.nickname || "Participante" : "Participante";
}

function getParticipantInitialByName(name) {
  return String(name || "?").trim().charAt(0).toUpperCase();
}

function getParticipantInitial(participantId) {
  const participant = getParticipant(participantId);
  const source = participant ? participant.avatar_initial || participant.name || participant.nickname : "?";
  return String(source || "?").trim().charAt(0).toUpperCase();
}

function getExactScores(row) {
  return num(row.exact_scores || row.exactScores);
}

function getCorrectResults(row) {
  return num(row.correct_results || row.correctResults);
}

function getPoints(row) {
  return num(row.points);
}

function getTodayLocal() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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

function scorePrediction(match, pred) {
  if (!match || !isFinished(match)) return 0;
  if (!isFilled(pred.pred_home) || !isFilled(pred.pred_away)) return 0;

  const realHome = num(match.home_score);
  const realAway = num(match.away_score);
  const predHome = num(pred.pred_home);
  const predAway = num(pred.pred_away);

  if (realHome === predHome && realAway === predAway) return 5;

  const realResult = getMatchResult(realHome, realAway);
  const predResult = getMatchResult(predHome, predAway);

  return realResult === predResult ? 3 : 0;
}

function getPredictionResultStats(match) {
  const matchPredictions = getPredictionsForMatch(match.match_id).filter(
    p => isFilled(p.pred_home) && isFilled(p.pred_away)
  );

  const total = matchPredictions.length || 1;

  const home = matchPredictions.filter(p => getMatchResult(p.pred_home, p.pred_away) === "home").length;
  const draw = matchPredictions.filter(p => getMatchResult(p.pred_home, p.pred_away) === "draw").length;
  const away = matchPredictions.filter(p => getMatchResult(p.pred_home, p.pred_away) === "away").length;

  return {
    total: matchPredictions.length,
    home,
    draw,
    away,
    homePct: Math.round(home / total * 100),
    drawPct: Math.round(draw / total * 100),
    awayPct: Math.round(away / total * 100)
  };
}

function getMajorityResult(match) {
  const stats = getPredictionResultStats(match);
  const options = [
    { key: "home", count: stats.home, pct: stats.homePct, label: match.home_team },
    { key: "draw", count: stats.draw, pct: stats.drawPct, label: "Empate" },
    { key: "away", count: stats.away, pct: stats.awayPct, label: match.away_team }
  ];

  return options.sort((a, b) => b.count - a.count)[0];
}

function getCommonScore() {
  const scoreCount = {};
  let exampleNames = [];

  predictions.forEach(pred => {
    if (!isFilled(pred.pred_home) || !isFilled(pred.pred_away)) return;

    const key = `${num(pred.pred_home)} - ${num(pred.pred_away)}`;
    scoreCount[key] = (scoreCount[key] || 0) + 1;
  });

  const top = Object.entries(scoreCount).sort((a, b) => b[1] - a[1])[0];

  if (!top) return null;

  predictions.forEach(pred => {
    const key = `${num(pred.pred_home)} - ${num(pred.pred_away)}`;
    if (key === top[0] && exampleNames.length < 5) {
      exampleNames.push(getParticipantName(pred.participant_id));
    }
  });

  return {
    score: top[0],
    count: top[1],
    names: exampleNames.join(", ")
  };
}

function renderHome() {
  const leader = ranking[0];
  const finished = matches.filter(isFinished).length;
  const exactTotal = ranking.reduce((sum, r) => sum + getExactScores(r), 0);

  setText("leaderName", leader ? leader.name || leader.nickname || "-" : "-");
  setText("leaderPoints", leader ? `${getPoints(leader)} pts` : "- pts");
  setText("totalParticipants", participants.length);
  setText("finishedMatches", finished);
  setText("exactScores", exactTotal);

  setHTML("top3", ranking.slice(0, 3).map((p, i) => `
    <div class="kpi top-card">
      <span>${i === 0 ? "🏆 Líder" : i === 1 ? "🥈 Segundo lugar" : "🥉 Terceiro lugar"}</span>
      <strong>${p.name || p.nickname || "-"}</strong>
      <small>${getPoints(p)} pts</small>
    </div>
  `).join(""));

  renderTodayMatches();
  renderBonusMatches();
  renderHomeCuriosities();
}

function renderTodayMatches() {
  const today = getTodayLocal();
  let todayMatches = matches.filter(m => m.date === today);

  if (!todayMatches.length) {
    todayMatches = matches.filter(isFuture).slice(0, 3);
  }

  setHTML("todayMatches",
    todayMatches.length
      ? todayMatches.map(renderPremiumMatchCard).join("")
      : `<div class="match-card">Nenhum jogo cadastrado para hoje.</div>`
  );
}

function renderPremiumMatchCard(match) {
  const stats = getPredictionResultStats(match);
  const previewPredictions = getPredictionsForMatch(match.match_id).slice(0, 2);
  const homeFlag = match.home_flag || "";
  const awayFlag = match.away_flag || "";
  const matchNumber = match.match_id ? `#${match.match_id}` : "";

  return `
    <div class="premium-match-card">
      <div class="premium-match-head">
        <span><b>${matchNumber}</b> ${match.group || ""} · ${match.time || "-"}</span>
        <strong>${match.time || "-"}</strong>
      </div>

      <div class="premium-versus">
        <div class="team-side">
          <div class="flag-ball">${homeFlag || "🏳️"}</div>
          <strong>${match.home_team || "-"}</strong>
        </div>

        <div class="vs-block">
          ${isFinished(match)
            ? `<span>${match.home_score} x ${match.away_score}</span>`
            : `<span>VS</span>`
          }
        </div>

        <div class="team-side">
          <div class="flag-ball">${awayFlag || "🏳️"}</div>
          <strong>${match.away_team || "-"}</strong>
        </div>
      </div>

      <div class="premium-predictions">
        ${previewPredictions.length ? previewPredictions.map(pred => `
          <div class="premium-prediction-row">
            <div class="avatar">${getParticipantInitial(pred.participant_id)}</div>
            <div>
              <small>Palpite · ${getParticipantName(pred.participant_id)}</small>
              <strong>${match.home_team} ${pred.pred_home || "-"} - ${pred.pred_away || "-"} ${match.away_team}</strong>
            </div>
            <span>Aposta registrada</span>
          </div>
        `).join("") : `<div class="premium-prediction-row empty">Sem palpites cadastrados.</div>`}
      </div>

      <div class="majority-box">
        <small>O que a maioria apostou (${stats.total} participantes)</small>
        <div class="majority-bar">
          <div style="width:${stats.homePct}%"></div>
          <div style="width:${stats.drawPct}%"></div>
          <div style="width:${stats.awayPct}%"></div>
        </div>

        <div class="majority-stats">
          <div>
            <span>${match.home_team}</span>
            <strong>${stats.homePct}%</strong>
          </div>
          <div>
            <span>Empate</span>
            <strong>${stats.drawPct}%</strong>
          </div>
          <div>
            <span>${match.away_team}</span>
            <strong>${stats.awayPct}%</strong>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderBonusMatches() {
  let bonus = matches.filter(m => {
    const value = String(m.bonus_game || m.is_bonus || m.bonus || "").toLowerCase();
    return ["true", "yes", "sim", "1", "bonus", "bônus"].includes(value);
  });

  if (!bonus.length) {
    bonus = matches
      .filter(m => isFuture(m) && m.date !== getTodayLocal())
      .slice(0, 6);
  }

  setHTML("bonusMatches",
    bonus.length
      ? bonus.map(renderBonusMatchCard).join("")
      : `<div class="match-card">Nenhum jogo bônus cadastrado.</div>`
  );
}

function renderBonusMatchCard(match) {
  const homeScore = isFilled(match.home_score) ? match.home_score : "";
  const awayScore = isFilled(match.away_score) ? match.away_score : "";

  return `
    <div class="bonus-card">
      <span>${formatDateBR(match.date)} · ${match.time || "-"}</span>
      <strong>
        ${match.home_flag || ""} ${match.home_team}
        ${isFinished(match) ? `${homeScore} - ${awayScore}` : "vs"}
        ${match.away_team} ${match.away_flag || ""}
      </strong>
      <em>${isFinished(match) ? "Encerrado" : "Futuro"}</em>
    </div>
  `;
}

function renderHomeCuriosities() {
  const consensus = getHighestConsensus();
  const balanced = getMostBalancedMatch();
  const commonScore = getCommonScore();

  setHTML("homeCuriosities", `
    <div class="curiosity-card">
      <span>Maior consenso</span>
      <strong>${consensus ? `${consensus.match.home_team} vs ${consensus.match.away_team}` : "-"}</strong>
      <b>${consensus ? `${consensus.pct}%` : "0%"}</b>
      <small>${consensus ? `${consensus.count} apostadores foram no mesmo resultado` : "Sem dados"}</small>
    </div>

    <div class="curiosity-card">
      <span>Jogo mais equilibrado</span>
      <strong>${balanced ? `${balanced.match.home_team} vs ${balanced.match.away_team}` : "-"}</strong>
      <b>${balanced ? `${balanced.balance}%` : "0%"}</b>
      <small>${balanced ? "distribuição mais dividida entre os palpites" : "Sem dados"}</small>
    </div>

    <div class="curiosity-card">
      <span>Placar mais comum</span>
      <strong>${commonScore ? commonScore.score : "-"}</strong>
      <b>${commonScore ? `${commonScore.count}x` : "0x"}</b>
      <small>${commonScore ? `ex: ${commonScore.names}` : "Sem dados"}</small>
    </div>
  `);
}

function getHighestConsensus() {
  const data = matches.map(match => {
    const stats = getPredictionResultStats(match);
    const majority = getMajorityResult(match);

    return {
      match,
      pct: majority ? majority.pct : 0,
      count: majority ? majority.count : 0
    };
  }).filter(d => d.count > 0);

  return data.sort((a, b) => b.pct - a.pct)[0] || null;
}

function getMostBalancedMatch() {
  const data = matches.map(match => {
    const stats = getPredictionResultStats(match);
    if (!stats.total) return null;

    const values = [stats.homePct, stats.drawPct, stats.awayPct];
    const spread = Math.max(...values) - Math.min(...values);

    return {
      match,
      balance: 100 - spread
    };
  }).filter(Boolean);

  return data.sort((a, b) => b.balance - a.balance)[0] || null;
}

function renderRanking() {
  setHTML("rankingBody", ranking.map((r, index) => `
    <tr>
      <td>${index === 0 ? "🏆" : index === 1 ? "🥈" : index === 2 ? "🥉" : index + 1}</td>
      <td>${r.name || r.nickname || "-"}</td>
      <td>${getPoints(r)}</td>
      <td>${getExactScores(r)}</td>
      <td>${getCorrectResults(r)}</td>
    </tr>
  `).join(""));
}

function renderMatches() {
  setHTML("matchesList", matches.map(renderMatchCard).join(""));
}

function renderMatchCard(match) {
  const homeScore = isFilled(match.home_score) ? match.home_score : "-";
  const awayScore = isFilled(match.away_score) ? match.away_score : "-";
  const homeFlag = match.home_flag || "";
  const awayFlag = match.away_flag || "";

  return `
    <div class="match-card">
      <span class="badge">${match.status || "future"}</span>
      <div class="score">
        ${homeFlag} ${match.home_team} ${homeScore} x ${awayScore} ${awayFlag} ${match.away_team}
      </div>
      <div class="meta">${match.date || "-"} · ${match.time || "-"} · ${match.group || ""}</div>
      ${renderPredictionSummary(match)}
    </div>
  `;
}

function renderPredictionSummary(match) {
  const matchPredictions = getPredictionsForMatch(match.match_id);

  if (!matchPredictions.length) {
    return `<div class="meta">Sem palpites cadastrados.</div>`;
  }

  if (!isFinished(match)) {
    return `<div class="meta locked">🔒 Palpites bloqueados até o fim da partida.</div>`;
  }

  const stats = getPredictionResultStats(match);

  return `
    <div class="meta">
      Palpites: ${match.home_team} ${stats.homePct}% ·
      Empate ${stats.drawPct}% ·
      ${match.away_team} ${stats.awayPct}%
    </div>
  `;
}

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
        <div class="match-card">
          <span class="badge">${match.date || "-"}</span>
          <div class="score">${match.home_team} x ${match.away_team}</div>
          <div class="meta locked">🔒 Palpites bloqueados até o fim da partida.</div>
        </div>
      `;
    }

    const cards = grouped[matchId].map(pred => `
      <div class="prediction-card">
        <strong>${getParticipantName(pred.participant_id)}</strong>
        <span>${match.home_team} ${pred.pred_home} x ${pred.pred_away} ${match.away_team}</span>
      </div>
    `).join("");

    return `
      <div class="match-card">
        <span class="badge">${match.date || "-"}</span>
        <div class="score">${match.home_team} x ${match.away_team}</div>
        <div class="card-list">${cards}</div>
      </div>
    `;
  }).join(""));
}

function renderStats() {
  const totalPoints = ranking.reduce((sum, r) => sum + getPoints(r), 0);
  const avgPoints = ranking.length ? Math.round(totalPoints / ranking.length) : 0;
  const totalPredictions = predictions.length;
  const finished = matches.filter(isFinished).length;
  const exactTotal = ranking.reduce((sum, r) => sum + getExactScores(r), 0);

  setHTML("statsContent", `
    <div class="kpi">
      <span>Total de palpites</span>
      <strong>${totalPredictions}</strong>
      <small>palpites registrados</small>
    </div>

    <div class="kpi">
      <span>Média de pontos</span>
      <strong>${avgPoints}</strong>
      <small>por participante</small>
    </div>

    <div class="kpi">
      <span>Jogos cadastrados</span>
      <strong>${matches.length}</strong>
      <small>total</small>
    </div>

    <div class="kpi">
      <span>Jogos finalizados</span>
      <strong>${finished}</strong>
      <small>com resultado</small>
    </div>

    <div class="kpi">
      <span>Placares exatos</span>
      <strong>${exactTotal}</strong>
      <small>cravadas no bolão</small>
    </div>
  `);

  renderAccuracyBoards();
  renderSpecialInsights();
  renderComebackTable();
}

function renderAccuracyBoards() {
  const exact = [...ranking].sort((a, b) => getExactScores(b) - getExactScores(a)).slice(0, 8);
  const simple = [...ranking].sort((a, b) => getCorrectResults(b) - getCorrectResults(a)).slice(0, 8);

  setHTML("accuracyBoards", `
    <div class="ranking-board">
      <h3>🎯 Placares Exatos</h3>
      ${exact.map(p => renderMiniRankRow(p.name || p.nickname, getExactScores(p), "cravadas")).join("")}
    </div>

    <div class="ranking-board">
      <h3>✅ Resultados Simples</h3>
      ${simple.map(p => renderMiniRankRow(p.name || p.nickname, getCorrectResults(p), "acertos")).join("")}
    </div>
  `);
}

function renderMiniRankRow(name, value, label) {
  return `
    <div class="mini-rank-row">
      <div class="avatar">${getParticipantInitialByName(name)}</div>
      <strong>${name || "-"}</strong>
      <div>
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
        <span>Maior zebra acertada</span>
        <strong>${zebra ? `#${zebra.match.match_id} ${zebra.match.home_team} ${zebra.match.home_score} - ${zebra.match.away_score} ${zebra.match.away_team}` : "-"}</strong>
        <small>${zebra ? `Apenas ${zebra.pct}% apostaram em ${zebra.resultLabel}. ${zebra.exactNames || "Ninguém cravou o placar."}` : "Ainda sem jogos suficientes."}</small>
      </div>
    </div>

    <div class="insight-card green">
      <div class="insight-icon">🏆</div>
      <div>
        <span>Jogo que mais rendeu pontos</span>
        <strong>${bestGame ? `#${bestGame.match.match_id} ${bestGame.match.home_team} ${bestGame.match.home_score} - ${bestGame.match.away_score} ${bestGame.match.away_team}` : "-"}</strong>
        <small>${bestGame ? `Os apostadores somaram ${bestGame.points} pontos neste jogo.` : "Ainda sem jogos finalizados."}</small>
      </div>
    </div>
  `);
}

function getBiggestZebra() {
  const finished = matches.filter(isFinished);
  const zebras = [];

  finished.forEach(match => {
    const stats = getPredictionResultStats(match);
    if (!stats.total) return;

    const realResult = getMatchResult(match.home_score, match.away_score);
    const resultCount = realResult === "home" ? stats.home : realResult === "draw" ? stats.draw : stats.away;
    const pct = Math.round(resultCount / stats.total * 100);

    const exactNames = getPredictionsForMatch(match.match_id)
      .filter(p => num(p.pred_home) === num(match.home_score) && num(p.pred_away) === num(match.away_score))
      .map(p => getParticipantName(p.participant_id))
      .slice(0, 5)
      .join(", ");

    zebras.push({
      match,
      pct,
      resultLabel: getResultLabel(realResult, match),
      exactNames: exactNames ? `${exactNames} cravou/cravaram o placar.` : ""
    });
  });

  return zebras.sort((a, b) => a.pct - b.pct)[0] || null;
}

function getBestPointsGame() {
  const data = matches.filter(isFinished).map(match => {
    const points = getPredictionsForMatch(match.match_id)
      .reduce((sum, pred) => sum + scorePrediction(match, pred), 0);

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
          <th>Já feitos</th>
          <th>Ainda na mesa</th>
          <th>Máximo</th>
          <th>% de vencer</th>
        </tr>
      </thead>
      <tbody>
        ${ranking.slice(0, 12).map(p => {
          const current = getPoints(p);
          const available = remaining * 5;
          const max = current + available;
          const chance = max <= 0 ? 0 : Math.min(99, Math.max(1, Math.round((current / Math.max(leaderPoints, 1)) * 55 + (available > 0 ? 5 : 0))));

          return `
            <tr>
              <td>
                <div class="table-player">
                  <div class="avatar">${getParticipantInitialByName(p.name || p.nickname)}</div>
                  <strong>${p.name || p.nickname || "-"}</strong>
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

function destroyChart(id) {
  if (charts[id]) {
    charts[id].destroy();
  }
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
      legend: {
        labels: {
          color: "#dbeafe"
        }
      }
    },
    scales: {
      x: {
        ticks: { color: "#94a3b8" },
        grid: { color: "rgba(148, 163, 184, 0.12)" }
      },
      y: {
        ticks: { color: "#94a3b8" },
        grid: { color: "rgba(148, 163, 184, 0.12)" }
      }
    },
    ...extra
  };
}

function renderCharts() {
  renderPointsChart();
  renderExactChart();
  renderCorrectChart();
  renderPredictionResultChart();
  renderMatchStatusChart();
  renderPointsExactChart();
  renderPredictionVolumeChart();
  renderFinishedGoalsChart();
}

function getTopRanking(limit = 15) {
  return ranking.slice(0, limit);
}

function renderPointsChart() {
  const data = getTopRanking();

  createChart("pointsChart", {
    type: "bar",
    data: {
      labels: data.map(p => p.name || p.nickname || "-"),
      datasets: [{
        label: "Pontos",
        data: data.map(p => getPoints(p)),
        backgroundColor: "#22c55e",
        borderColor: "#86efac",
        borderWidth: 1
      }]
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
      datasets: [{
        label: "Placares exatos",
        data: data.map(p => getExactScores(p)),
        backgroundColor: "#facc15",
        borderColor: "#fde68a",
        borderWidth: 1
      }]
    },
    options: baseChartOptions({
      indexAxis: "y",
      plugins: { legend: { display: false } }
    })
  });
}

function renderCorrectChart() {
  const data = getTopRanking();

  createChart("correctChart", {
    type: "bar",
    data: {
      labels: data.map(p => p.name || p.nickname || "-"),
      datasets: [{
        label: "Acertos",
        data: data.map(p => getCorrectResults(p)),
        backgroundColor: "#38bdf8",
        borderColor: "#bae6fd",
        borderWidth: 1
      }]
    },
    options: baseChartOptions({ plugins: { legend: { display: false } } })
  });
}

function renderPredictionResultChart() {
  let home = 0;
  let draw = 0;
  let away = 0;

  predictions.forEach(p => {
    if (!isFilled(p.pred_home) || !isFilled(p.pred_away)) return;

    const result = getMatchResult(p.pred_home, p.pred_away);

    if (result === "home") home++;
    if (result === "draw") draw++;
    if (result === "away") away++;
  });

  createChart("predictionResultChart", {
    type: "doughnut",
    data: {
      labels: ["Mandante", "Empate", "Visitante"],
      datasets: [{
        data: [home, draw, away],
        backgroundColor: ["#22c55e", "#facc15", "#3b82f6"],
        borderColor: "#0f1d33"
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          labels: { color: "#dbeafe" }
        }
      }
    }
  });
}

function renderMatchStatusChart() {
  const statusCount = {};

  matches.forEach(match => {
    const status = match.status || "future";
    statusCount[status] = (statusCount[status] || 0) + 1;
  });

  createChart("matchStatusChart", {
    type: "pie",
    data: {
      labels: Object.keys(statusCount),
      datasets: [{
        data: Object.values(statusCount),
        backgroundColor: ["#22c55e", "#facc15", "#3b82f6", "#ef4444"],
        borderColor: "#0f1d33"
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          labels: { color: "#dbeafe" }
        }
      }
    }
  });
}

function renderPointsExactChart() {
  const data = getTopRanking();

  createChart("pointsExactChart", {
    type: "scatter",
    data: {
      datasets: [{
        label: "Participantes",
        data: data.map(p => ({
          x: getExactScores(p),
          y: getPoints(p)
        })),
        backgroundColor: "#facc15",
        borderColor: "#fde68a"
      }]
    },
    options: baseChartOptions({
      scales: {
        x: {
          title: { display: true, text: "Placares exatos", color: "#dbeafe" },
          ticks: { color: "#94a3b8" },
          grid: { color: "rgba(148, 163, 184, 0.12)" }
        },
        y: {
          title: { display: true, text: "Pontos", color: "#dbeafe" },
          ticks: { color: "#94a3b8" },
          grid: { color: "rgba(148, 163, 184, 0.12)" }
        }
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

  const data = Object.entries(volume)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  createChart("predictionVolumeChart", {
    type: "bar",
    data: {
      labels: data.map(d => d.name),
      datasets: [{
        label: "Palpites enviados",
        data: data.map(d => d.count),
        backgroundColor: "#a855f7",
        borderColor: "#d8b4fe",
        borderWidth: 1
      }]
    },
    options: baseChartOptions({
      indexAxis: "y",
      plugins: { legend: { display: false } }
    })
  });
}

function renderFinishedGoalsChart() {
  const finishedMatches = matches.filter(isFinished);

  createChart("finishedGoalsChart", {
    type: "line",
    data: {
      labels: finishedMatches.map(m => `${m.home_team} x ${m.away_team}`),
      datasets: [{
        label: "Gols na partida",
        data: finishedMatches.map(m => num(m.home_score) + num(m.away_score)),
        borderColor: "#22c55e",
        backgroundColor: "rgba(34, 197, 94, 0.18)",
        tension: 0.35,
        fill: true
      }]
    },
    options: baseChartOptions()
  });
}

async function init() {
  try {
    participants = await fetchCsv(SHEETS.PARTICIPANTS, "CSV_PARTICIPANTS");
    matches = await fetchCsv(SHEETS.MATCHES, "CSV_MATCHES");
    predictions = await fetchCsv(SHEETS.PREDICTIONS, "CSV_PREDICTIONS");
    ranking = await fetchCsv(SHEETS.RANKING, "CSV_RANKING");

    ranking = ranking.sort((a, b) => getPoints(b) - getPoints(a));

    renderHome();
    renderRanking();
    renderMatches();
    renderPredictions();
    renderStats();
    renderCharts();

    setText("lastUpdated", new Date().toLocaleString("pt-BR"));
  } catch (error) {
    console.error(error);

    document.body.innerHTML = `
      <main>
        <h1>Erro ao carregar o bolão</h1>
        <p>${error.message}</p>
      </main>
    `;
  }
}

init();

setInterval(() => {
  init();
}, 300000);
