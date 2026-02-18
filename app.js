/* ════════════════════════════════════════
   MatikQuiz – app.js
   ════════════════════════════════════════ */

"use strict";

// ── Global session state ─────────────────
let settings = { operation: "mixed", difficulty: "easy", questionCount: 10 };
let questions = [];       // generated question objects
let currentIndex = 0;
let stats = { correct: 0, wrong: 0, empty: 0, total: 0 };
let sessionLog = [];      // for TXT export
let hintUsed = false;
let answered = false;

// ── DOM refs ─────────────────────────────
const screens = { setup: document.getElementById("screen-setup"), quiz: document.getElementById("screen-quiz"), result: document.getElementById("screen-result") };

// ════════════════════════════════════════
// UTILITIES
// ════════════════════════════════════════

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rand(0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function showScreen(name) {
  Object.entries(screens).forEach(([k, el]) => {
    el.classList.toggle("active", k === name);
  });
}

// ════════════════════════════════════════
// QUESTION GENERATION
// ════════════════════════════════════════

/**
 * getRanges(difficulty, operation)
 * Returns number range config per difficulty.
 */
function getRanges(difficulty, operation) {
  const ranges = {
    easy:   { min: 1,  max: 20  },
    medium: { min: 5,  max: 99  },
    hard:   { min: 10, max: 999 },
  };
  return ranges[difficulty];
}

/**
 * generateQuestion()
 * Builds a question object: { text, answer, hint, operation }
 */
function generateQuestion(operation, difficulty) {
  const ops = (operation === "mixed")
    ? ["add", "sub", "mul", "div"][rand(0, 3)]
    : operation;

  const { min, max } = getRanges(difficulty, ops);
  let a, b, answer, text, hint;

  if (ops === "add") {
    a = rand(min, max); b = rand(min, max);
    answer = a + b;
    text = `${a} + ${b} = ?`;
    hint = `${a}'e ${b} ekle. Önce birler basamağını topla.`;

  } else if (ops === "sub") {
    // ensure positive result
    a = rand(min, max); b = rand(min, a);
    answer = a - b;
    text = `${a} − ${b} = ?`;
    hint = `${a}'den ${b} çıkar. Sonuç negatif olmayacak.`;

  } else if (ops === "mul") {
    // tighter range for mul to stay readable
    const mMax = difficulty === "hard" ? 30 : (difficulty === "medium" ? 15 : 10);
    a = rand(2, mMax); b = rand(2, mMax);
    answer = a * b;
    text = `${a} × ${b} = ?`;
    hint = `${a}'i ${b} kez topla, ya da çarpım tablosunu hatırla.`;

  } else { // div
    // generate exact divisible pair
    const dMax = difficulty === "hard" ? 20 : (difficulty === "medium" ? 12 : 9);
    b = rand(2, dMax);
    const maxQ = difficulty === "hard" ? 30 : (difficulty === "medium" ? 15 : 10);
    const quotient = rand(2, maxQ);
    a = b * quotient;
    answer = quotient;
    text = `${a} ÷ ${b} = ?`;
    hint = `${b} × ? = ${a} sorusunu düşün. Çarpım tablosundan bul.`;
  }

  return { text, answer, hint, operation: ops, a, b };
}

/**
 * applyDistractorStrategy(correct, operation, a, b)
 * Returns an array of 2 distinct wrong numbers.
 * Applies at least one strategy per question.
 */
function applyDistractorStrategy(correct, operation, a, b) {
  const strategies = [];

  // Strategy 1: Same units digit (birler basamağı aynı)
  const unitsDigit = Math.abs(correct) % 10;
  const s1a = correct + 10; const s1b = correct - 10;
  if (s1a !== correct && s1a > 0) strategies.push(s1a);
  if (s1b !== correct && s1b > 0) strategies.push(s1b);

  // Strategy 2: Small deviations ±1, ±2, ±5
  [1, 2, 5].forEach(d => {
    if (correct + d !== correct) strategies.push(correct + d);
    if (correct - d > 0 && correct - d !== correct) strategies.push(correct - d);
  });

  // Strategy 3: Common mistakes
  if (operation === "sub") {
    // reversed subtraction
    const reversed = b - a;
    if (reversed !== correct && reversed > 0) strategies.push(reversed);
    // add instead of subtract
    const addedInstead = a + b;
    if (addedInstead !== correct) strategies.push(addedInstead);
  }
  if (operation === "mul") {
    // add instead of multiply
    const addInstead = a + b;
    if (addInstead !== correct) strategies.push(addInstead);
    // adjacent multiplication (a × (b-1))
    const adj = a * (b - 1);
    if (adj !== correct && adj > 0) strategies.push(adj);
  }
  if (operation === "div") {
    // multiply instead of divide
    const mulInstead = a * b;
    if (mulInstead !== correct) strategies.push(mulInstead);
    // off-by-one divisor: a / (b+1)
    const offDiv = Math.round(a / (b + 1));
    if (offDiv !== correct && offDiv > 0) strategies.push(offDiv);
  }
  if (operation === "add") {
    // multiply instead of add
    const mulInstead = a * b;
    if (mulInstead !== correct) strategies.push(mulInstead);
    // subtract instead
    const subInstead = Math.abs(a - b);
    if (subInstead !== correct) strategies.push(subInstead);
  }

  // De-duplicate, remove correct, keep positives
  const unique = [...new Set(strategies)].filter(v => v !== correct && v > 0 && Number.isInteger(v));

  // Pick 2 distractors
  const picked = [];
  // Ensure at least 1 from strategies; shuffle
  shuffle(unique);
  while (picked.length < 2 && unique.length > 0) {
    const candidate = unique.shift();
    if (!picked.includes(candidate)) picked.push(candidate);
  }

  // Fill remaining with random fallback
  let safety = 0;
  while (picked.length < 2 && safety < 100) {
    safety++;
    const offset = rand(1, 15) * (Math.random() < 0.5 ? 1 : -1);
    const candidate = correct + offset;
    if (candidate !== correct && candidate > 0 && !picked.includes(candidate)) {
      picked.push(candidate);
    }
  }

  return picked;
}

/**
 * generateChoices(correct, operation, a, b)
 * Returns shuffled array of 3 choice objects: { value, isCorrect, label }
 */
function generateChoices(correct, operation, a, b) {
  const distractors = applyDistractorStrategy(correct, operation, a, b);
  const all = [
    { value: correct, isCorrect: true },
    { value: distractors[0], isCorrect: false },
    { value: distractors[1], isCorrect: false },
  ];
  shuffle(all);
  // Assign labels A/B/C
  return all.map((item, i) => ({ ...item, label: ["A", "B", "C"][i] }));
}

// ════════════════════════════════════════
// SESSION RECORDING
// ════════════════════════════════════════

/**
 * recordAnswer(questionObj, choices, userLabel, hintUsed)
 * Pushes a full record into sessionLog.
 */
function recordAnswer(questionObj, choices, userLabel, hintWasUsed) {
  const correctChoice = choices.find(c => c.isCorrect);
  sessionLog.push({
    index:       sessionLog.length + 1,
    text:        questionObj.text,
    choices:     choices,                    // [{label, value, isCorrect}]
    correctLabel: correctChoice.label,
    correctValue: correctChoice.value,
    userAnswer:  userLabel || "BOŞ",
    hint_used:   hintWasUsed,
    result:      !userLabel ? "boş" : (userLabel === correctChoice.label ? "doğru" : "yanlış"),
  });
}

// ════════════════════════════════════════
// TXT EXPORT
// ════════════════════════════════════════

/**
 * exportTxt(log, settings, stats)
 * Builds a human-readable TXT and triggers download.
 */
function exportTxt(log, cfg, st) {
  const now = new Date();
  const dateStr = now.toLocaleString("tr-TR");
  const opLabels = { mixed: "Karışık", add: "Toplama", sub: "Çıkarma", mul: "Çarpma", div: "Bölme" };
  const diffLabels = { easy: "Kolay", medium: "Orta", hard: "Zor" };

  let txt = "";
  txt += "╔══════════════════════════════════════════╗\n";
  txt += "║           MATİKQUİZ – OTURUM KAYDI       ║\n";
  txt += "╚══════════════════════════════════════════╝\n\n";
  txt += `Tarih / Saat   : ${dateStr}\n`;
  txt += `İşlem Türü     : ${opLabels[cfg.operation]}\n`;
  txt += `Zorluk         : ${diffLabels[cfg.difficulty]}\n`;
  txt += `Soru Adedi     : ${cfg.questionCount}\n`;
  txt += `\n─────────────────────────────────────────\n`;
  txt += `  TOPLAM: ${st.total}   DOĞRU: ${st.correct}   YANLIŞ: ${st.wrong}   BOŞ: ${st.empty}\n`;
  const pct = st.total > 0 ? Math.round((st.correct / st.total) * 100) : 0;
  txt += `  BAŞARI ORANI: %${pct}\n`;
  txt += `─────────────────────────────────────────\n\n`;

  log.forEach(r => {
    txt += `S${String(r.index).padStart(2, "0")}.  ${r.text}\n`;
    r.choices.forEach(c => {
      const mark = c.isCorrect ? " ✓" : "  ";
      txt += `     [${c.label}]${mark} ${c.value}\n`;
    });
    txt += `     Doğru Cevap  : [${r.correctLabel}] = ${r.correctValue}\n`;
    txt += `     Cevabınız    : ${r.userAnswer}\n`;
    txt += `     İpucu Kullanıldı: ${r.hint_used ? "EVET" : "HAYIR"}\n`;
    txt += `     Sonuç        : ${r.result.toUpperCase()}\n`;
    txt += "\n";
  });

  txt += "╔══════════════════════════════════════════╗\n";
  txt += "║           KAYIT SONU – MATİKQUİZ         ║\n";
  txt += "╚══════════════════════════════════════════╝\n";

  const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `quiz_kayitlari_${now.toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// ════════════════════════════════════════
// LOCALSTORAGE HISTORY
// ════════════════════════════════════════

function saveToHistory(cfg, st) {
  const key = "matikquiz_history";
  let history = [];
  try { history = JSON.parse(localStorage.getItem(key)) || []; } catch (e) {}
  const opLabels = { mixed: "Karışık", add: "Toplama", sub: "Çıkarma", mul: "Çarpma", div: "Bölme" };
  const diffLabels = { easy: "Kolay", medium: "Orta", hard: "Zor" };
  history.unshift({
    date: new Date().toLocaleString("tr-TR"),
    operation: opLabels[cfg.operation],
    difficulty: diffLabels[cfg.difficulty],
    total: st.total,
    correct: st.correct,
    wrong: st.wrong,
    empty: st.empty,
  });
  if (history.length > 10) history = history.slice(0, 10);
  try { localStorage.setItem(key, JSON.stringify(history)); } catch (e) {}
}

function loadHistory() {
  const key = "matikquiz_history";
  let history = [];
  try { history = JSON.parse(localStorage.getItem(key)) || []; } catch (e) {}
  const panel = document.getElementById("history-panel");
  const list = document.getElementById("history-list");
  if (history.length === 0) { panel.style.display = "none"; return; }
  panel.style.display = "block";
  list.innerHTML = history.map(h =>
    `<li><strong>${h.date}</strong> &nbsp;|&nbsp; ${h.operation} · ${h.difficulty}<br>
     Toplam: ${h.total} &nbsp; Doğru: <span style="color:var(--correct)">${h.correct}</span> &nbsp;
     Yanlış: <span style="color:var(--wrong)">${h.wrong}</span> &nbsp;
     Boş: <span style="color:var(--empty)">${h.empty}</span></li>`
  ).join("");
}

// ════════════════════════════════════════
// UI HELPERS
// ════════════════════════════════════════

function updateStatsUI() {
  document.getElementById("stat-correct").textContent = stats.correct;
  document.getElementById("stat-wrong").textContent   = stats.wrong;
  document.getElementById("stat-empty").textContent   = stats.empty;
  document.getElementById("stat-total").textContent   = stats.total;
}

function renderQuestion() {
  if (currentIndex >= questions.length) { showResult(); return; }

  answered = false;
  hintUsed = false;
  const q = questions[currentIndex];
  const choices = generateChoices(q.answer, q.operation, q.a, q.b);
  q.choices = choices; // store for recording

  // Progress
  document.getElementById("q-progress").textContent = `${currentIndex + 1} / ${questions.length}`;
  document.getElementById("q-number").textContent   = `Soru ${currentIndex + 1}`;
  document.getElementById("q-text").textContent     = q.text;

  // Choices
  choices.forEach((c, i) => {
    const btn = document.querySelector(`.choice-btn[data-idx="${i}"]`);
    btn.disabled = false;
    btn.className = "choice-btn";
    btn.querySelector(".choice-key").textContent = c.label;
    document.getElementById(`c${i}`).textContent = c.value;
  });

  // Hint
  document.getElementById("hint-box").style.display = "none";
  document.getElementById("hint-box").textContent = q.hint;
  document.getElementById("btn-hint").disabled = false;

  // Feedback
  const fb = document.getElementById("feedback-box");
  fb.style.display = "none";
  fb.className = "feedback-box";

  // Buttons
  document.getElementById("btn-skip").style.display = "";
  document.getElementById("btn-next").style.display = "none";

  // Force animation restart
  const card = document.querySelector(".question-card");
  card.style.animation = "none";
  card.offsetHeight; // reflow
  card.style.animation = "";
}

function handleAnswer(userLabel) {
  if (answered) return;
  answered = true;

  const q = questions[currentIndex];
  const choices = q.choices;
  const correctChoice = choices.find(c => c.isCorrect);

  // Highlight choices
  choices.forEach((c, i) => {
    const btn = document.querySelector(`.choice-btn[data-idx="${i}"]`);
    btn.disabled = true;
    if (c.isCorrect)             btn.classList.add("correct-ans");
    if (c.label === userLabel && !c.isCorrect) btn.classList.add("wrong-ans");
    if (c.label === userLabel && c.isCorrect)  btn.classList.add("selected");
  });

  // Stats
  let resultType = "empty";
  if (!userLabel) {
    stats.empty++;
    resultType = "empty";
  } else if (userLabel === correctChoice.label) {
    stats.correct++;
    resultType = "correct";
  } else {
    stats.wrong++;
    resultType = "wrong";
  }
  stats.total++;
  updateStatsUI();

  // Feedback
  const fb = document.getElementById("feedback-box");
  fb.style.display = "block";
  fb.className = `feedback-box ${resultType}`;
  const labels = { correct: "✓ Doğru!", wrong: "✗ Yanlış!", empty: "○ Boş geçildi." };
  fb.innerHTML = `${labels[resultType]}<br>Doğru cevap: <strong>[${correctChoice.label}] = ${correctChoice.value}</strong>`;

  // Record
  recordAnswer(q, choices, userLabel, hintUsed);

  // Buttons
  document.getElementById("btn-skip").style.display = "none";
  document.getElementById("btn-next").style.display = "";
}

function advanceQuestion() {
  currentIndex++;
  if (currentIndex >= questions.length) showResult();
  else renderQuestion();
}

function showResult() {
  saveToHistory(settings, stats);

  document.getElementById("rs-total").textContent   = stats.total;
  document.getElementById("rs-correct").textContent = stats.correct;
  document.getElementById("rs-wrong").textContent   = stats.wrong;
  document.getElementById("rs-empty").textContent   = stats.empty;

  const pct = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
  document.getElementById("score-pct").textContent = `%${pct}`;

  // Animate bar after screen shown
  setTimeout(() => {
    document.getElementById("score-bar").style.width = pct + "%";
  }, 100);

  // Result message
  const icon  = pct >= 80 ? "🏆" : pct >= 60 ? "🎯" : pct >= 40 ? "📚" : "💪";
  const title = pct >= 80 ? "Mükemmel!" : pct >= 60 ? "İyi İş!" : pct >= 40 ? "Devam Edin!" : "Pratik Gerekli!";
  document.getElementById("result-icon").textContent = icon;
  document.getElementById("result-title").textContent = title;

  showScreen("result");
}

// ════════════════════════════════════════
// SETUP SCREEN TOGGLE GROUPS
// ════════════════════════════════════════

function initToggleGroup(groupId, settingKey) {
  const group = document.getElementById(groupId);
  group.querySelectorAll(".tog-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      group.querySelectorAll(".tog-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      settings[settingKey] = btn.dataset.val;
    });
  });
}

// ════════════════════════════════════════
// KEYBOARD SUPPORT
// ════════════════════════════════════════

document.addEventListener("keydown", e => {
  if (!screens.quiz.classList.contains("active")) return;

  if (!answered) {
    if (e.key.toUpperCase() === "A") {
      const btn = document.querySelector('.choice-btn[data-idx="0"]');
      if (!btn.disabled) handleAnswer(btn.querySelector(".choice-key").textContent);
    } else if (e.key.toUpperCase() === "B") {
      const btn = document.querySelector('.choice-btn[data-idx="1"]');
      if (!btn.disabled) handleAnswer(btn.querySelector(".choice-key").textContent);
    } else if (e.key.toUpperCase() === "C") {
      const btn = document.querySelector('.choice-btn[data-idx="2"]');
      if (!btn.disabled) handleAnswer(btn.querySelector(".choice-key").textContent);
    } else if (e.key === "Enter") {
      handleAnswer(null);
    }
  } else {
    if (e.key === "Enter") {
      advanceQuestion();
    }
  }
});

// ════════════════════════════════════════
// EVENT LISTENERS
// ════════════════════════════════════════

// Choice buttons
document.querySelectorAll(".choice-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    if (!answered) {
      const label = btn.querySelector(".choice-key").textContent;
      handleAnswer(label);
    }
  });
});

// Skip / Next
document.getElementById("btn-skip").addEventListener("click", () => handleAnswer(null));
document.getElementById("btn-next").addEventListener("click", advanceQuestion);

// Hint
document.getElementById("btn-hint").addEventListener("click", () => {
  hintUsed = true;
  const hb = document.getElementById("hint-box");
  hb.style.display = hb.style.display === "none" ? "block" : "none";
  document.getElementById("btn-hint").disabled = true;
});

// Exit
document.getElementById("btn-exit").addEventListener("click", () => {
  if (confirm("Testi bitirmek istediğinize emin misiniz?")) {
    showResult();
  }
});

// Start
document.getElementById("btn-start").addEventListener("click", () => {
  // Reset state
  questions = [];
  sessionLog = [];
  currentIndex = 0;
  stats = { correct: 0, wrong: 0, empty: 0, total: 0 };

  const count = parseInt(settings.questionCount, 10);
  for (let i = 0; i < count; i++) {
    questions.push(generateQuestion(settings.operation, settings.difficulty));
  }

  // Mode badge
  const opLabels = { mixed: "Karışık", add: "Toplama", sub: "Çıkarma", mul: "Çarpma", div: "Bölme" };
  const diffLabels = { easy: "Kolay", medium: "Orta", hard: "Zor" };
  document.getElementById("q-mode-badge").textContent =
    `${opLabels[settings.operation]} · ${diffLabels[settings.difficulty]}`;

  updateStatsUI();
  showScreen("quiz");
  renderQuestion();
});

// Download TXT
document.getElementById("btn-download").addEventListener("click", () => {
  exportTxt(sessionLog, settings, stats);
});

// Restart
document.getElementById("btn-restart").addEventListener("click", () => {
  loadHistory();
  showScreen("setup");
});

// ════════════════════════════════════════
// INIT
// ════════════════════════════════════════

initToggleGroup("op-group",    "operation");
initToggleGroup("diff-group",  "difficulty");
initToggleGroup("count-group", "questionCount");

settings.questionCount = "10"; // default string for parseInt compatibility

loadHistory();
