(function () {
  const STORAGE_KEY = "anre-quiz-progress-v1";
  const app = document.getElementById("app");
  const allQuestions = (window.QUIZ_DATA && window.QUIZ_DATA.questions) || [];
  const playable = allQuestions.filter((q) => q.complete);

  const state = {
    view: "home",
    mode: "practice",
    queue: [],
    index: 0,
    selected: null,
    locked: false,
    answers: {},
    examSize: 30,
    timerSec: 0,
    timerId: null,
    useTimer: false,
    search: "",
  };

  function loadProgress() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function saveProgress(partial) {
    const current = { ...loadProgress(), ...partial };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  }

  function shuffle(list) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function optionOrder(question) {
    const keys = ["a", "b", "c"].filter((k) => question.options[k]);
    return state.mode === "browse" ? keys : shuffle(keys);
  }

  function isCorrect(question, letter) {
    return (question.answers || []).includes(letter);
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function stopTimer() {
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  function startTimer() {
    stopTimer();
    state.timerId = setInterval(() => {
      state.timerSec += 1;
      const el = document.querySelector(".timer");
      if (el) el.textContent = formatTime(state.timerSec);
    }, 1000);
  }

  function startSession(mode, size) {
    state.mode = mode;
    state.selected = null;
    state.locked = false;
    state.answers = {};
    state.index = 0;
    state.timerSec = 0;
    const pool = shuffle(playable);
    if (mode === "exam") {
      state.examSize = size;
      state.queue = pool.slice(0, size);
      state.useTimer = true;
      startTimer();
    } else if (mode === "mistakes") {
      const progress = loadProgress();
      const wrong = new Set(progress.wrongIds || []);
      state.queue = shuffle(playable.filter((q) => wrong.has(q.id)));
      state.useTimer = false;
      stopTimer();
    } else {
      state.queue = pool;
      state.useTimer = false;
      stopTimer();
    }
    state.queue = state.queue.map((q) => ({ ...q, order: optionOrder(q) }));
    state.view = state.queue.length ? "quiz" : "home";
    render();
  }

  function currentQuestion() {
    return state.queue[state.index];
  }

  function recordAnswer(question, letter) {
    const ok = isCorrect(question, letter);
    const progress = loadProgress();
    const answeredIds = new Set(progress.answeredIds || []);
    const wrongIds = new Set(progress.wrongIds || []);
    answeredIds.add(question.id);
    if (ok) wrongIds.delete(question.id);
    else wrongIds.add(question.id);
    saveProgress({
      answeredIds: [...answeredIds],
      wrongIds: [...wrongIds],
      correctCount: (progress.correctCount || 0) + (ok ? 1 : 0),
      answeredCount: (progress.answeredCount || 0) + 1,
    });
  }

  function submitCurrent() {
    const question = currentQuestion();
    if (!question || state.selected == null || state.locked) return;
    state.locked = true;
    state.answers[question.id] = state.selected;
    if (state.mode !== "exam") recordAnswer(question, state.selected);
    render();
  }

  function nextQuestion() {
    if (state.index >= state.queue.length - 1) {
      if (state.mode === "exam") finishExam();
      else {
        state.view = "home";
        stopTimer();
        render();
      }
      return;
    }
    state.index += 1;
    state.selected = null;
    state.locked = false;
    render();
  }

  function finishExam() {
    stopTimer();
    const total = state.queue.length;
    let correct = 0;
    const wrongIds = [];
    state.queue.forEach((q) => {
      const chosen = state.answers[q.id];
      if (chosen && isCorrect(q, chosen)) correct += 1;
      else wrongIds.push(q.id);
    });
    const progress = loadProgress();
    saveProgress({
      lastExam: {
        correct,
        total,
        percent: Math.round((correct / total) * 100),
        seconds: state.timerSec,
        at: Date.now(),
      },
      wrongIds: [...new Set([...(progress.wrongIds || []), ...wrongIds])],
    });
    state.view = "results";
    render();
  }

  function homeView() {
    const progress = loadProgress();
    const answered = (progress.answeredIds || []).length;
    const remaining = playable.length - answered;
    const wrong = (progress.wrongIds || []).length;
    const last = progress.lastExam;

    return `
      <header class="topbar">
        <div class="brand">
          <h1>${window.QUIZ_DATA.title}</h1>
          <p>${window.QUIZ_DATA.category} · ${window.QUIZ_DATA.source}</p>
        </div>
        <span class="chip">${playable.length} întrebări</span>
      </header>

      <div class="stats">
        <div class="stat"><b>${answered}</b><span>parcurse</span></div>
        <div class="stat"><b>${remaining}</b><span>rămase</span></div>
        <div class="stat"><b>${wrong}</b><span>de recapitulat</span></div>
      </div>

      ${
        last
          ? `<div class="card" style="margin-bottom:14px">
              <h2>Ultimul examen</h2>
              <p>${last.correct}/${last.total} corecte · ${last.percent}% · ${formatTime(last.seconds)}</p>
            </div>`
          : ""
      }

      <div class="grid">
        <article class="card">
          <h2>Practică</h2>
          <p>Întrebări amestecate, cu răspuns imediat. Ideal pentru învățat.</p>
          <button class="btn" data-action="practice">Începe practica</button>
        </article>
        <article class="card">
          <h2>Examen simulare</h2>
          <p>Fără indicii până la final. Promovarea este la 80%.</p>
          <div class="row" style="margin-bottom:12px">
            <label class="field">Număr întrebări
              <select id="exam-size">
                <option value="20">20</option>
                <option value="30" selected>30</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </label>
          </div>
          <button class="btn" data-action="exam">Pornește examenul</button>
        </article>
        <article class="card">
          <h2>Recapitulare greșeli</h2>
          <p>Reia doar întrebările la care ai greșit.</p>
          <button class="btn secondary" data-action="mistakes" ${wrong ? "" : "disabled"}>Recapitulează (${wrong})</button>
        </article>
        <article class="card">
          <h2>Caută în bancă</h2>
          <p>Răsfoiește toate întrebările, inclusiv cele cu schemă.</p>
          <button class="btn ghost" data-action="browse">Deschide banca</button>
        </article>
      </div>
    `;
  }

  function quizView() {
    const q = currentQuestion();
    const total = state.queue.length;
    const pct = Math.round(((state.index + (state.locked ? 1 : 0)) / total) * 100);
    const chosen = state.selected;
    const showResult = state.mode !== "exam" && state.locked;
    const ok = chosen != null && isCorrect(q, chosen);

    const options = q.order
      .map((letter) => {
        const classes = ["option"];
        if (chosen === letter) classes.push("selected");
        if (showResult && isCorrect(q, letter)) classes.push("correct");
        if (showResult && chosen === letter && !ok) classes.push("wrong");
        const disabled = state.mode === "exam" ? false : state.locked;
        return `
          <button class="${classes.join(" ")}" data-choose="${letter}" ${disabled ? "disabled" : ""}>
            <span class="key">${letter.toUpperCase()}</span>
            <span>${escapeHtml(q.options[letter])}</span>
          </button>
        `;
      })
      .join("");

    return `
      <header class="topbar">
        <div class="brand">
          <h1>${state.mode === "exam" ? "Examen" : "Practică"}</h1>
          <p>Întrebarea ${q.id}</p>
        </div>
        <div class="row">
          ${state.useTimer ? `<span class="chip timer">${formatTime(state.timerSec)}</span>` : ""}
          <button class="btn secondary" data-action="home">Ieșire</button>
        </div>
      </header>
      <div class="q-meta">
        <span>${state.index + 1} / ${total}</span>
        <span>${pct}%</span>
      </div>
      <div class="progress"><span style="width:${pct}%"></span></div>
      <article class="card" style="margin-top:16px">
        ${q.hasDiagram ? `<div class="warn">Această întrebare se referă la o schemă din Excel care nu a fost importată în aplicație.</div>` : ""}
        <p class="q-text">${escapeHtml(q.text)}</p>
        <div class="options">${options}</div>
        ${
          showResult
            ? `<div class="feedback ${ok ? "ok" : "bad"}">${ok ? "Corect" : "Greșit. Varianta corectă este " + q.answers.map((x) => x.toUpperCase()).join(" / ") + "."}</div>`
            : ""
        }
        <div class="row" style="margin-top:16px">
          ${
            state.mode === "exam"
              ? `<button class="btn" data-action="next" ${chosen == null ? "disabled" : ""}>${state.index === total - 1 ? "Finalizează" : "Următoarea"}</button>`
              : state.locked
                ? `<button class="btn" data-action="next">${state.index === total - 1 ? "Gata" : "Următoarea"}</button>`
                : `<button class="btn" data-action="submit" ${chosen == null ? "disabled" : ""}>Verifică</button>`
          }
        </div>
      </article>
    `;
  }

  function resultsView() {
    const last = loadProgress().lastExam || { correct: 0, total: 1, percent: 0, seconds: 0 };
    const passed = last.percent >= 80;
    return `
      <header class="topbar">
        <div class="brand">
          <h1>Rezultat examen</h1>
          <p>${passed ? "Promovat" : "Nepromovat"} · prag 80%</p>
        </div>
        <button class="btn secondary" data-action="home">Acasă</button>
      </header>
      <article class="card">
        <div class="result-score">${last.percent}%</div>
        <p>${last.correct} răspunsuri corecte din ${last.total} · ${formatTime(last.seconds)}</p>
        <div class="row">
          <button class="btn" data-action="mistakes">Recapitulează greșelile</button>
          <button class="btn secondary" data-action="exam-again">Alt examen</button>
        </div>
      </article>
    `;
  }

  function browseView() {
    const term = state.search.trim().toLowerCase();
    const matches = !term
      ? playable.slice(0, 40)
      : allQuestions.filter((q) => {
          const blob = `${q.id} ${q.text} ${q.options.a} ${q.options.b} ${q.options.c}`.toLowerCase();
          return blob.includes(term);
        }).slice(0, 60);

    return `
      <header class="topbar">
        <div class="brand">
          <h1>Banca de întrebări</h1>
          <p>Caută după enunț, variantă sau număr</p>
        </div>
        <button class="btn secondary" data-action="home">Acasă</button>
      </header>
      <input type="search" id="q-search" placeholder="ex: Kirchhoff, condensator, 193" value="${escapeAttr(state.search)}" />
      <div class="search-list">
        ${matches
          .map(
            (q) => `
          <button class="search-item" data-open="${q.id}">
            <small>#${q.id}${q.hasDiagram ? " · schemă" : ""}${q.complete ? "" : " · fără variante text"}</small>
            <div>${escapeHtml(q.text)}</div>
          </button>`
          )
          .join("")}
      </div>
    `;
  }

  function questionDetail(id) {
    const q = allQuestions.find((item) => item.id === id);
    if (!q) return browseView();
    const opts = ["a", "b", "c"]
      .filter((k) => q.options[k])
      .map((k) => {
        const cls = isCorrect(q, k) ? "option correct" : "option";
        return `<div class="${cls}"><span class="key">${k.toUpperCase()}</span><span>${escapeHtml(q.options[k])}</span></div>`;
      })
      .join("");
    return `
      <header class="topbar">
        <div class="brand"><h1>Întrebarea ${q.id}</h1></div>
        <button class="btn secondary" data-action="browse">Înapoi</button>
      </header>
      <article class="card">
        ${q.hasDiagram ? `<div class="warn">Există o schemă asociată în fișierul Excel.</div>` : ""}
        <p class="q-text">${escapeHtml(q.text)}</p>
        <div class="options">${opts || "<p>Variantele sunt doar scheme, fără text.</p>"}</div>
      </article>
    `;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/"/g, "&quot;");
  }

  function render() {
    if (state.view === "home") app.innerHTML = homeView();
    else if (state.view === "quiz") app.innerHTML = quizView();
    else if (state.view === "results") app.innerHTML = resultsView();
    else if (state.view === "browse") app.innerHTML = browseView();
    else if (state.view === "detail") app.innerHTML = questionDetail(state.detailId);
  }

  app.addEventListener("click", (event) => {
    const actionEl = event.target.closest("[data-action]");
    const chooseEl = event.target.closest("[data-choose]");
    const openEl = event.target.closest("[data-open]");

    if (chooseEl) {
      state.selected = chooseEl.getAttribute("data-choose");
      if (state.mode === "exam") {
        state.answers[currentQuestion().id] = state.selected;
      }
      render();
      return;
    }

    if (openEl) {
      state.view = "detail";
      state.detailId = Number(openEl.getAttribute("data-open"));
      render();
      return;
    }

    if (!actionEl) return;
    const action = actionEl.getAttribute("data-action");
    if (action === "home") {
      stopTimer();
      state.view = "home";
      render();
    } else if (action === "practice") startSession("practice");
    else if (action === "exam" || action === "exam-again") {
      const size = Number(document.getElementById("exam-size")?.value || state.examSize || 30);
      startSession("exam", size);
    } else if (action === "mistakes") startSession("mistakes");
    else if (action === "browse") {
      stopTimer();
      state.view = "browse";
      render();
    } else if (action === "submit") submitCurrent();
    else if (action === "next") {
      if (state.mode === "exam" && currentQuestion()) {
        state.answers[currentQuestion().id] = state.selected;
      }
      nextQuestion();
    }
  });

  app.addEventListener("input", (event) => {
    if (event.target.id === "q-search") {
      state.search = event.target.value;
      const active = document.activeElement === event.target;
      render();
      if (active) {
        const input = document.getElementById("q-search");
        input.focus();
        input.setSelectionRange(state.search.length, state.search.length);
      }
    }
  });

  window.addEventListener("keydown", (event) => {
    if (state.view !== "quiz") return;
    const q = currentQuestion();
    if (!q || state.locked) {
      if (event.code === "Enter") nextQuestion();
      return;
    }
    const byNumber = { Digit1: 0, Digit2: 1, Digit3: 2 };
    if (byNumber[event.code] != null && q.order[byNumber[event.code]]) {
      state.selected = q.order[byNumber[event.code]];
      render();
    }
    if (event.code === "Enter") {
      if (state.mode === "exam" && state.selected) nextQuestion();
      else if (!state.locked) submitCurrent();
      else nextQuestion();
    }
  });

  render();
})();
