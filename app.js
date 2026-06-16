const CSV_PARTICIPANTS = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRqE3kkDDcPtqpGJ3PguUDsikJMNFbm0zdl9AJeK6e-_egbJmgYX29r50ESGoFqV0qe_aToL4aNgbBh/pub?gid=496109362&single=true&output=csv";
const CSV_MATCHES = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRqE3kkDDcPtqpGJ3PguUDsikJMNFbm0zdl9AJeK6e-_egbJmgYX29r50ESGoFqV0qe_aToL4aNgbBh/pub?gid=606750094&single=true&output=csv";
const CSV_PREDICTIONS = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRqE3kkDDcPtqpGJ3PguUDsikJMNFbm0zdl9AJeK6e-_egbJmgYX29r50ESGoFqV0qe_aToL4aNgbBh/pub?gid=1378690055&single=true&output=csv";
const CSV_RANKING = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRqE3kkDDcPtqpGJ3PguUDsikJMNFbm0zdl9AJeK6e-_egbJmgYX29r50ESGoFqV0qe_aToL4aNgbBh/pub?gid=379623986&single=true&output=csv";

let participants = [];
let matches = [];
let predictions = [];
let ranking = [];

function showPage(pageId) {
  document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));
  document.getElementById(pageId).classList.add("active");
}

async function fetchCsv(url, name) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`${name} falhou. Status: ${response.status}. URL: ${url}`);
  }

  const text = await response.text();

  if (!text || text.includes("<html") || text.includes("<!DOCTYPE html")) {
    throw new Error(`${name} não retornou CSV. Provavelmente o link está como HTML/iframe, não CSV.`);
  }

  return parseCsv(text);
}

function parseCsv(text) {
  const rows = text.trim().split(/\r?\n/);
  const headers = splitCsvLine(rows[0]).map(h => h.trim());

  return rows.slice(1).map(row => {
    const values = splitCsvLine(row);
    const obj = {};

    headers.forEach((header, index) => {
      obj[header] = values[index] ? values[index].trim() : "";
    });

    return obj;
  });
}

function splitCsvLine(line) {
  const result = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
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

function getMatchResult(home, away) {
  const h = Number(home);
  const a = Number(away);

  if (h > a) return "home";
  if (a > h) return "away";
  return "draw";
}

function getParticipantName(participantId) {
  const participant = participants.find(p => String(p.participant_id) === String(participantId));
  return participant ? participant.name || participant.nickname : "Participante";
}

function renderHome() {
  const leader = ranking[0];
  const finished = matches.filter(m => m.status === "finished").length;
  const exactTotal = ranking.reduce((sum, r) => sum + Number(r.exact_scores || r.exactScores || 0), 0);

  document.getElementById("leaderName").innerText = leader ? leader.name : "-";
  document.getElementById("leaderPoints").innerText = leader ? `${leader.points} pts` : "- pts";
  document.getElementById("totalParticipants").innerText = participants.length;
  document.getElementById("finishedMatches").innerText = finished;
  document.getElementById("exactScores").innerText = exactTotal;

  const today = new Date().toISOString().slice(0, 10);
  const todayMatches = matches.filter(m => m.date === today);

  document.getElementById("todayMatches").innerHTML =
    todayMatches.length
      ? todayMatches.map(renderMatchCard).join("")
      : `<div class="match-card">Nenhum jogo cadastrado para hoje.</div>`;
}

function renderRanking() {
  document.getElementById("rankingBody").innerHTML = ranking.map((r, index) => `
    <tr>
      <td>
       ${index === 0 ? '🏆' :
         index === 1 ? '🥈' :
         index === 2 ? '🥉' :
         index + 1}
      </td>
      <td>${r.name || r.nickname || "-"}</td>
      <td>${r.points || 0}</td>
      <td>${r.exact_scores || r.exactScores || 0}</td>
      <td>${r.correct_results || r.correctResults || 0}</td>
    </tr>
  `).join("");
}

function renderMatches() {
  document.getElementById("matchesList").innerHTML = matches.map(renderMatchCard).join("");
}

function renderMatchCard(match) {
  const homeScore = match.home_score !== "" ? match.home_score : "-";
  const awayScore = match.away_score !== "" ? match.away_score : "-";

  return `
    <div class="match-card">
      <span class="badge">${match.status || "future"}</span>
      <div class="score">${match.home_team} ${homeScore} x ${awayScore} ${match.away_team}</div>
      <div class="meta">${match.date || "-"} · ${match.time || "-"} · ${match.group || ""}</div>
      ${renderPredictionSummary(match)}
    </div>
  `;
}

function renderPredictionSummary(match) {
  const matchPredictions = predictions.filter(
    p => String(p.match_id) === String(match.match_id)
  );

  if (!matchPredictions.length) {
    return `<div class="meta">Sem palpites cadastrados.</div>`;
  }

  const homeWins = matchPredictions.filter(p => getMatchResult(p.pred_home, p.pred_away) === "home").length;
  const draws = matchPredictions.filter(p => getMatchResult(p.pred_home, p.pred_away) === "draw").length;
  const awayWins = matchPredictions.filter(p => getMatchResult(p.pred_home, p.pred_away) === "away").length;
  const total = matchPredictions.length;

  return `
    <div class="meta">
      Palpites: ${match.home_team} ${Math.round(homeWins / total * 100)}% ·
      Empate ${Math.round(draws / total * 100)}% ·
      ${match.away_team} ${Math.round(awayWins / total * 100)}%
    </div>
  `;
}

function renderPredictions() {
  const grouped = {};

  predictions.forEach(pred => {
    if (!grouped[pred.match_id]) grouped[pred.match_id] = [];
    grouped[pred.match_id].push(pred);
  });

  document.getElementById("predictionsList").innerHTML = Object.keys(grouped).map(matchId => {
    const match = matches.find(m => String(m.match_id) === String(matchId));

    if (!match) return "";

    const cards = grouped[matchId].map(pred => `
      <div class="prediction-card">
        <strong>${getParticipantName(pred.participant_id)}</strong>
        <span>${match.home_team} ${pred.pred_home} x ${pred.pred_away} ${match.away_team}</span>
      </div>
    `).join("");

    return `
      <div class="match-card">
        <span class="badge">${match.date}</span>
        <div class="score">${match.home_team} x ${match.away_team}</div>
        <div class="card-list">${cards}</div>
      </div>
    `;
  }).join("");
}

function renderStats() {
  const totalPoints = ranking.reduce((sum, r) => sum + Number(r.points || 0), 0);
  const avgPoints = ranking.length ? Math.round(totalPoints / ranking.length) : 0;
  const totalPredictions = predictions.length;
  const finished = matches.filter(m => m.status === "finished").length;

  document.getElementById("statsContent").innerHTML = `
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
  `;
}

async function init() {
  try {
   participants = await fetchCsv(CSV_PARTICIPANTS, "CSV_PARTICIPANTS");
   matches = await fetchCsv(CSV_MATCHES, "CSV_MATCHES");
   predictions = await fetchCsv(CSV_PREDICTIONS, "CSV_PREDICTIONS");
   ranking = await fetchCsv(CSV_RANKING, "CSV_RANKING");

    ranking = ranking.sort((a, b) => Number(b.points || 0) - Number(a.points || 0));

    renderHome();
    renderRanking();
    renderMatches();
    renderPredictions();
    renderStats();

    document.getElementById("lastUpdated").innerText =
      new Date().toLocaleString("pt-BR");
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
