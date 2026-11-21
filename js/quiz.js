(function () {
  "use strict";

  const STORAGE_KEY = "alekseevka_routes_quiz_progress_v1";
  const PASS_FRACTION = 0.6;

  function validScore(score, total) {
    return Number.isSafeInteger(total) && total > 0 &&
      Number.isSafeInteger(score) && score >= 0 && score <= total;
  }

  function result(score, total) {
    return { score, total, passed: score >= Math.ceil(total * PASS_FRACTION) };
  }

  function loadProgress() {
    try {
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
      if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};

      const progress = {};
      for (const [id, entry] of Object.entries(stored)) {
        if (/^[1-9]\d*$/.test(id) && entry && validScore(entry.score, entry.total)) {
          progress[id] = result(entry.score, entry.total);
        }
      }
      return progress;
    } catch {
      return {};
    }
  }

  function keepBest(progress, id, attempt) {
    const previous = progress[id];
    if (!previous || attempt.score / attempt.total >= previous.score / previous.total) {
      progress[id] = attempt;
    }
  }

  function record(progress, routeId, score, total) {
    if (!/^[1-9]\d*$/.test(String(routeId)) || !validScore(score, total)) return;
    // Another tab may have finished a different walk since this page was opened.
    for (const [id, entry] of Object.entries(loadProgress())) {
      keepBest(progress, id, entry);
    }
    keepBest(progress, routeId, result(score, total));
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch {
      // The score remains available in this tab if the browser blocks storage.
    }
  }

  function shuffledQuestions(source) {
    let previousCorrect = -1;
    return source.map((question) => {
      const order = question.options.map((_, index) => index);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      let correct = order.indexOf(question.correct);
      if (correct === previousCorrect && order.length > 1) {
        const offset = 1 + Math.floor(Math.random() * (order.length - 1));
        const other = (correct + offset) % order.length;
        [order[correct], order[other]] = [order[other], order[correct]];
        correct = other;
      }
      previousCorrect = correct;
      return { ...question, options: order.map((index) => question.options[index]), correct };
    });
  }

  function escapeText(value) {
    return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  }

  function questionMarkup(item, index, prefix) {
    const headingId = `${prefix}-question-${index}`;
    const options = item.options.map((option, optionIndex) => `
      <button type="button" class="quiz-option-btn" data-q="${index}" data-o="${optionIndex}">
        <span aria-hidden="true" class="quiz-opt-letter mono">${optionIndex + 1}</span>
        <span>${escapeText(option)}</span>
      </button>`).join("");
    const route = item.routeNumber ? ` <small class="quiz-sub">· Маршрут ${escapeText(item.routeNumber)}</small>` : "";
    return `
      <div class="quiz-question-row" role="group" aria-labelledby="${headingId}">
        <div class="quiz-q-head">
          <span class="quiz-q-num mono" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
          <h4 class="quiz-q-title" id="${headingId}">${escapeText(item.q)}${route}</h4>
        </div>
        <div class="quiz-options">${options}</div>
        <p class="quiz-explanation hidden" tabindex="-1"></p>
      </div>`;
  }

  function mount(container, config) {
    if (!container) return;
    const { title, subtitle, questions: source, routeId = null, onClose, onComplete } = config;
    const total = source.length;
    if (!total) {
      container.textContent = "Для этой викторины пока нет вопросов.";
      return;
    }

    const threshold = Math.ceil(total * PASS_FRACTION);
    const prefix = routeId === null ? "quiz-city" : `quiz-route-${Number(routeId)}`;
    const questions = shuffledQuestions(source);
    const completed = new Set();
    let score = 0;

    container.innerHTML = `
      <div class="quiz-box">
        <div class="quiz-header">
          <div>
            <h3 tabindex="-1">${escapeText(title)}</h3>
            <span class="quiz-sub">${escapeText(subtitle)}. Для зачёта нужно ${threshold} из ${total} правильных ответов (от 60 %).</span>
          </div>
          ${onClose ? '<button type="button" class="text-btn" data-quiz-close>Закрыть тест</button>' : ""}
        </div>
        <p class="quiz-sub" data-quiz-progress>Ответов 0 из ${total}</p>
        <div class="quiz-progress-track" aria-hidden="true"><div class="quiz-progress-fill" style="width:0"></div></div>
        ${questions.map((item, index) => questionMarkup(item, index, prefix)).join("")}
        <div class="quiz-summary-bar hidden">
          <div>
            <strong class="tabular"></strong>
            <span data-quiz-verdict></span>
          </div>
          <button type="button" class="btn btn-line btn-sm" data-quiz-reset>Пройти заново</button>
        </div>
      </div>`;

    const box = container.querySelector(".quiz-box");
    box.querySelector("[data-quiz-close]")?.addEventListener("click", onClose);
    box.querySelector("[data-quiz-reset]").addEventListener("click", () => {
      if (config.onRestart) {
        config.onRestart();
        return;
      }
      mount(container, config);
      container.querySelector("h3").focus();
    });

    box.addEventListener("click", (event) => {
      const button = event.target.closest("[data-q]");
      if (!button) return;
      const index = Number(button.dataset.q);
      if (completed.has(index)) return;
      completed.add(index);

      const item = questions[index];
      const chosen = Number(button.dataset.o);
      const correct = chosen === item.correct;
      if (correct) score++;

      const row = button.closest(".quiz-question-row");
      row.querySelectorAll("[data-o]").forEach((option) => {
        const position = Number(option.dataset.o);
        option.disabled = true;
        option.classList.toggle("correct", position === item.correct);
        option.classList.toggle("wrong", position === chosen && !correct);
      });

      box.querySelector("[data-quiz-progress]").textContent = `Ответов ${completed.size} из ${total}`;
      box.querySelector(".quiz-progress-fill").style.width = `${completed.size / total * 100}%`;
      const feedback = row.querySelector(".quiz-explanation");
      const verdict = correct ? "Верно." : `Неверно. Правильный ответ — ${item.options[item.correct]}.`;
      feedback.textContent = [verdict, item.explanation].filter(Boolean).join(" ");

      if (completed.size === total) {
        const summary = box.querySelector(".quiz-summary-bar");
        const resultText = `Результат: ${score} из ${total} (${Math.round(score / total * 100)} %)`;
        const passedText = score >= threshold ? "Викторина пройдена." : `Для зачёта нужно ${threshold} из ${total}.`;
        summary.querySelector("strong").textContent = resultText;
        summary.querySelector("[data-quiz-verdict]").textContent = passedText;
        summary.classList.remove("hidden");
        const resultId = `${prefix}-result`;
        summary.id = resultId;
        feedback.setAttribute("aria-describedby", resultId);
        if (routeId !== null) onComplete?.(routeId, score, total);
      }
      // Focus on the explanation. The next Tab continues past the answered row.
      feedback.classList.remove("hidden");
      feedback.focus({ preventScroll: event.detail !== 0 });
      if (event.detail !== 0 && window.matchMedia("(max-width: 760px)").matches) {
        feedback.scrollIntoView({ block: "nearest", behavior: "instant" });
      }
    });
  }

  window.GuideQuiz = { loadProgress, record, mount };
})();
