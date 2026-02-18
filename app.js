// Matematik Quiz Uygulaması (vanilla JS)
const state = {
  config: null,
  currentQuestion: null,
  questionIndex: 0,
  finished: false,
  records: [],
  stats: {
    total: 0,
    correct: 0,
    wrong: 0,
    blank: 0,
  },
};

const el = {
  operationType: document.getElementById('operationType'),
  difficulty: document.getElementById('difficulty'),
  questionCount: document.getElementById('questionCount'),
  startBtn: document.getElementById('startBtn'),
  questionText: document.getElementById('questionText'),
  choicesContainer: document.getElementById('choicesContainer'),
  hintBtn: document.getElementById('hintBtn'),
  hintText: document.getElementById('hintText'),
  feedbackText: document.getElementById('feedbackText'),
  progressText: document.getElementById('progressText'),
  skipBtn: document.getElementById('skipBtn'),
  finishBtn: document.getElementById('finishBtn'),
  downloadBtn: document.getElementById('downloadBtn'),
  statTotal: document.getElementById('statTotal'),
  statCorrect: document.getElementById('statCorrect'),
  statWrong: document.getElementById('statWrong'),
  statBlank: document.getElementById('statBlank'),
  historyList: document.getElementById('historyList'),
};

const DIFFICULTY_RANGES = {
  easy: { min: 1, max: 10 },
  medium: { min: 10, max: 40 },
  hard: { min: 25, max: 120 },
};

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getOperationSymbol(type) {
  return { add: '+', subtract: '-', multiply: '×', divide: '÷' }[type] || '+';
}

function pickOperation(type) {
  if (type !== 'mixed') return type;
  const types = ['add', 'subtract', 'multiply', 'divide'];
  return types[randInt(0, types.length - 1)];
}

// Soruyu üretir: işlem, metin, doğru cevap ve ipucu.
function generateQuestion() {
  const operation = pickOperation(state.config.operationType);
  const range = DIFFICULTY_RANGES[state.config.difficulty];

  let a = randInt(range.min, range.max);
  let b = randInt(range.min, range.max);
  let correctAnswer = 0;

  if (operation === 'add') {
    correctAnswer = a + b;
  } else if (operation === 'subtract') {
    if (b > a) [a, b] = [b, a]; // negatif sonucu azalt
    correctAnswer = a - b;
  } else if (operation === 'multiply') {
    correctAnswer = a * b;
  } else if (operation === 'divide') {
    // tam bölünebilir soru oluştur
    b = randInt(Math.max(2, Math.floor(range.min / 2)), Math.max(3, Math.floor(range.max / 2)));
    correctAnswer = randInt(range.min, range.max);
    a = b * correctAnswer;
  }

  const text = `${a} ${getOperationSymbol(operation)} ${b} = ?`;
  const hint = `İpucu: ${a} ve ${b} sayıları için ${getOperationSymbol(operation)} işlemini adım adım düşün.`;

  const choices = generateChoices(correctAnswer, { a, b, operation });

  return {
    text,
    operation,
    operands: { a, b },
    correctAnswer,
    hint,
    choices,
    hintUsed: false,
  };
}

// Doğru cevap etrafında 2 kandırmacalı şık üretir ve A/B/C olarak karıştırır.
function generateChoices(correctAnswer, context) {
  const wrongSet = new Set();
  // En az bir strateji kesin uygulanır.
  const forcedWrong = applyDistractorStrategy(correctAnswer, context, true);
  if (forcedWrong !== correctAnswer) wrongSet.add(forcedWrong);

  while (wrongSet.size < 2) {
    const candidate = applyDistractorStrategy(correctAnswer, context, false);
    if (candidate !== correctAnswer && candidate >= 0) wrongSet.add(candidate);
  }

  const values = shuffle([correctAnswer, ...wrongSet]);
  const labels = ['A', 'B', 'C'];
  return labels.map((label, index) => ({
    label,
    value: values[index],
    isCorrect: values[index] === correctAnswer,
  }));
}

// Kandirmacalı şık stratejileri.
function applyDistractorStrategy(correctAnswer, context, forceStrategy) {
  const { a, b, operation } = context;
  const strategies = [
    // Birler basamağı aynı
    () => {
      const ones = Math.abs(correctAnswer) % 10;
      const base = Math.max(0, Math.floor(correctAnswer / 10) * 10);
      const delta = randInt(1, 5) * 10;
      return Math.max(0, base + (Math.random() > 0.5 ? delta : -delta) + ones);
    },
    // Yakın değer
    () => correctAnswer + shuffle([1, -1, 2, -2, 5, -5, 10, -10])[0],
    // Sık hata: işlem yerine başka işlem kullanma
    () => {
      if (operation === 'subtract') return b - a; // yönü ters
      if (operation === 'multiply') return a + b; // çarpma yerine toplama
      if (operation === 'divide') return Math.max(0, Math.floor(a / (b + 1))); // 10'luk/çarpan kaydırma benzeri
      if (operation === 'add') return Math.abs(a - b);
      return correctAnswer + 3;
    },
    // 10'luk kaydırma / çarpan kayması
    () => {
      if (operation === 'multiply') return a * Math.max(1, b - 1);
      return correctAnswer + (Math.random() > 0.5 ? 10 : -10);
    },
  ];

  const chosen = forceStrategy ? strategies[randInt(0, strategies.length - 1)] : shuffle(strategies)[0];
  return chosen();
}

function setActiveControls(isActive) {
  [...el.choicesContainer.querySelectorAll('.choice')].forEach((btn) => {
    btn.disabled = !isActive;
  });
  el.skipBtn.disabled = !isActive;
  el.hintBtn.disabled = !isActive;
}

function renderQuestion() {
  const q = state.currentQuestion;
  if (!q) return;

  el.questionText.textContent = q.text;
  el.progressText.textContent = `Soru ${state.questionIndex + 1} / ${state.config.questionCount}`;
  el.hintText.textContent = q.hint;
  el.hintText.classList.add('hidden');

  const choiceButtons = [...el.choicesContainer.querySelectorAll('.choice')];
  choiceButtons.forEach((btn) => {
    const c = q.choices.find((item) => item.label === btn.dataset.choice);
    btn.textContent = `${c.label}) ${c.value}`;
  });

  el.feedbackText.textContent = '';
  el.feedbackText.className = 'feedback';
  setActiveControls(true);
}

function updateStatsUI() {
  el.statTotal.textContent = String(state.stats.total);
  el.statCorrect.textContent = String(state.stats.correct);
  el.statWrong.textContent = String(state.stats.wrong);
  el.statBlank.textContent = String(state.stats.blank);
}

function startQuiz() {
  state.config = {
    operationType: el.operationType.value,
    difficulty: el.difficulty.value,
    questionCount: Number(el.questionCount.value),
  };
  state.currentQuestion = null;
  state.questionIndex = 0;
  state.finished = false;
  state.records = [];
  state.stats = { total: 0, correct: 0, wrong: 0, blank: 0 };

  el.downloadBtn.disabled = true;
  updateStatsUI();
  nextQuestion();
}

function showFeedback(type, text) {
  el.feedbackText.textContent = text;
  el.feedbackText.className = `feedback ${type}`;
}

// Cevabı kaydeder, istatistikleri günceller ve soru kaydını tutar.
function recordAnswer(selectedLabel) {
  if (!state.currentQuestion || state.finished) return;

  const q = state.currentQuestion;
  const correctChoice = q.choices.find((c) => c.isCorrect);
  const selectedChoice = q.choices.find((c) => c.label === selectedLabel);

  state.stats.total += 1;

  let result = 'Boş';
  if (!selectedLabel) {
    state.stats.blank += 1;
    showFeedback('warn', `Boş geçildi. Doğru cevap: ${correctChoice.label}) ${correctChoice.value}`);
  } else if (selectedChoice && selectedChoice.isCorrect) {
    state.stats.correct += 1;
    result = 'Doğru';
    showFeedback('ok', `Doğru! Cevap: ${correctChoice.label}) ${correctChoice.value}`);
  } else {
    state.stats.wrong += 1;
    result = 'Yanlış';
    showFeedback('bad', `Yanlış. Doğru cevap: ${correctChoice.label}) ${correctChoice.value}`);
  }

  state.records.push({
    soru_no: state.questionIndex + 1,
    soru_metni: q.text,
    secenekler: q.choices.map((c) => `${c.label}) ${c.value}`),
    dogru_sik: correctChoice.label,
    dogru_deger: correctChoice.value,
    kullanici_secimi: selectedLabel || 'BOŞ',
    sonuc: result,
    hint_used: q.hintUsed,
  });

  updateStatsUI();
  setActiveControls(false);

  state.questionIndex += 1;
  if (state.questionIndex >= state.config.questionCount) {
    finishQuiz();
    return;
  }

  setTimeout(() => {
    nextQuestion();
  }, 500);
}

function nextQuestion() {
  state.currentQuestion = generateQuestion();
  renderQuestion();
}

function getSessionPayload() {
  return {
    timestamp: new Date().toISOString(),
    config: { ...state.config },
    stats: { ...state.stats },
    records: [...state.records],
  };
}

function saveSessionToHistory(sessionData) {
  const key = 'math_quiz_history';
  const current = JSON.parse(localStorage.getItem(key) || '[]');
  current.unshift(sessionData);
  localStorage.setItem(key, JSON.stringify(current.slice(0, 10)));
}

function renderHistory() {
  const key = 'math_quiz_history';
  const sessions = JSON.parse(localStorage.getItem(key) || '[]');
  el.historyList.innerHTML = '';

  if (!sessions.length) {
    el.historyList.innerHTML = '<li>Henüz kayıt yok.</li>';
    return;
  }

  sessions.forEach((session, index) => {
    const li = document.createElement('li');
    const dt = new Date(session.timestamp).toLocaleString('tr-TR');
    li.textContent = `${index + 1}. ${dt} | ${session.config.operationType}/${session.config.difficulty} | D:${session.stats.correct} Y:${session.stats.wrong} B:${session.stats.blank}`;
    el.historyList.appendChild(li);
  });
}

function finishQuiz() {
  if (state.finished || !state.config) return;
  state.finished = true;
  setActiveControls(false);

  const payload = getSessionPayload();
  saveSessionToHistory(payload);
  renderHistory();

  el.progressText.textContent = 'Oturum tamamlandı.';
  el.questionText.textContent = 'Quiz bitti. TXT indir butonu ile kaydı indirebilirsiniz.';
  el.downloadBtn.disabled = false;
}

// TXT olarak dışa aktarır ve browser üzerinden indirir.
function exportTxt() {
  if (!state.records.length) return;

  const now = new Date().toLocaleString('tr-TR');
  const lines = [
    '=== MATEMATIK QUIZ OTURUM KAYDI ===',
    `Tarih-saat: ${now}`,
    `İşlem türü: ${state.config.operationType}`,
    `Zorluk: ${state.config.difficulty}`,
    `Soru adedi: ${state.config.questionCount}`,
    `Toplam: ${state.stats.total} | Doğru: ${state.stats.correct} | Yanlış: ${state.stats.wrong} | Boş: ${state.stats.blank}`,
    '',
    '--- SORU DETAYLARI ---',
  ];

  state.records.forEach((r) => {
    lines.push(`Soru ${r.soru_no}: ${r.soru_metni}`);
    lines.push(`Şıklar: ${r.secenekler.join(' | ')}`);
    lines.push(`Doğru şık/değer: ${r.dogru_sik} / ${r.dogru_deger}`);
    lines.push(`Kullanıcı seçimi: ${r.kullanici_secimi}`);
    lines.push(`hint_used: ${r.hint_used}`);
    lines.push('');
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'quiz_kayitlari.txt';
  a.click();
  URL.revokeObjectURL(url);
}

function onChoiceClick(event) {
  const btn = event.target.closest('.choice');
  if (!btn || btn.disabled) return;
  recordAnswer(btn.dataset.choice);
}

function onKeyControl(event) {
  if (state.finished || !state.currentQuestion) return;
  const key = event.key.toUpperCase();
  if (['A', 'B', 'C'].includes(key)) {
    recordAnswer(key);
  } else if (event.key === 'Enter') {
    recordAnswer(null);
  }
}

function bindEvents() {
  el.startBtn.addEventListener('click', startQuiz);
  el.choicesContainer.addEventListener('click', onChoiceClick);
  el.skipBtn.addEventListener('click', () => recordAnswer(null));
  el.finishBtn.addEventListener('click', finishQuiz);
  el.downloadBtn.addEventListener('click', exportTxt);

  el.hintBtn.addEventListener('click', () => {
    if (!state.currentQuestion) return;
    state.currentQuestion.hintUsed = true;
    el.hintText.classList.remove('hidden');
  });

  document.addEventListener('keydown', onKeyControl);
}

bindEvents();
setActiveControls(false);
renderHistory();
