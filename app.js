(function () {
  "use strict";

  var API_BASE = "https://api-vkfest.vvdev.ru";

  var WORKER_BASE = "https://vkfest-quest-proxy.prokopjevaleks.workers.dev";

  var REQUEST_BASE = WORKER_BASE || API_BASE;

  function api(path) {
    return REQUEST_BASE + path;
  }

  var CITIES_URL = "/api/cities/";
  var QUEST_URL = "/api/quests/active?cityId=";

  function absUrl(url) {
    if (!url) return "";
    if (/^https?:\/\//i.test(url)) return url;
    return API_BASE + (url.charAt(0) === "/" ? "" : "/") + url;
  }

  function moscowIso() {
    var now = new Date();
    // сдвигаем к UTC+3 и форматируем вручную
    var ms = now.getTime() + 3 * 3600 * 1000;
    var d = new Date(ms);
    var p = function (n, w) {
      n = String(n);
      while (n.length < (w || 2)) n = "0" + n;
      return n;
    };
    return (
      d.getUTCFullYear() +
      "-" + p(d.getUTCMonth() + 1) +
      "-" + p(d.getUTCDate()) +
      "T" + p(d.getUTCHours()) +
      ":" + p(d.getUTCMinutes()) +
      ":" + p(d.getUTCSeconds()) +
      "+03:00"
    );
  }

  var COIN_SVG =
    '<svg class="coin-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<circle cx="12" cy="12" r="10" fill="#FFCC00"/>' +
    '<circle cx="12" cy="12" r="7.5" fill="#FFD84D"/>' +
    '<text x="12" y="16.5" text-anchor="middle" font-size="11" font-weight="700" fill="#8A6D00">V</text>' +
    "</svg>";

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function renderCard(task) {
    var card = el("button", "card" + (task.isStarter ? " starter" : ""));
    card.type = "button";

    var imgWrap = el("div", "card-img-wrap");
    if (task.isStarter) imgWrap.appendChild(el("span", "card-badge", "Старт"));
    var img = el("img", "card-img");
    img.loading = "lazy";
    img.alt = task.title || "";
    img.src = absUrl(task.coverUrl);
    img.onerror = function () {
      this.style.display = "none";
    };
    imgWrap.appendChild(img);
    card.appendChild(imgWrap);

    var body = el("div", "card-body");
    body.appendChild(el("h3", "card-title", escapeHtml(task.title)));
    var coins = el("span", "coins", COIN_SVG + "<span>" + (task.rewardCoins || 0) + "</span>");
    body.appendChild(coins);
    card.appendChild(body);

    card.addEventListener("click", function () {
      openModal(task);
    });
    return card;
  }

  function renderSection(container, title, desc, tasks) {
    if (!tasks.length) return;
    container.appendChild(el("h2", "section-title", escapeHtml(title)));
    if (desc) container.appendChild(el("p", "section-desc", escapeHtml(desc)));
    var grid = el("div", "grid");
    tasks.forEach(function (t) {
      grid.appendChild(renderCard(t));
    });
    container.appendChild(grid);
  }

  var backdrop = document.getElementById("modalBackdrop");
  var modalTitle = document.getElementById("modalTitle");
  var modalBody = document.getElementById("modalBody");
  document.getElementById("modalClose").addEventListener("click", closeModal);
  backdrop.addEventListener("click", function (e) {
    if (e.target === backdrop) closeModal();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeModal();
  });

  function closeModal() {
    backdrop.hidden = true;
    modalBody.innerHTML = "";
  }

  function openModal(task) {
    modalTitle.textContent = task.title || "Задание";
    modalBody.innerHTML = "";

    var questions = task.questions || [];
    questions.forEach(function (q, idx) {
      var block = el("div", "question");
      if (questions.length > 1) {
        block.appendChild(el("div", "q-num", "Вопрос " + (idx + 1)));
      }
      if (q.text) block.appendChild(el("div", "q-text", escapeHtml(q.text)));

      var answerWrap = el("div", "answer");
      renderAnswer(answerWrap, task, q);
      block.appendChild(answerWrap);
      modalBody.appendChild(block);
    });

    backdrop.hidden = false;
  }

  function renderAnswer(wrap, task, q) {
    var type = q.answerType;

    if (type === "text") {
      wrap.appendChild(el("div", "answer-label", "Ответ:"));
      var ans = (q.correctAnswers && q.correctAnswers[0]) || "—";
      wrap.appendChild(el("div", "answer-text", escapeHtml(ans)));
      return;
    }

    if (type === "multiple" || type === "single") {
      wrap.appendChild(el("div", "answer-label", "Правильный ответ:"));
      var opts = el("div", "answer-options");
      (q.options || [])
        .filter(function (o) {
          return o.isCorrect;
        })
        .forEach(function (o) {
          if (o.mediaKind === "image" && o.mediaUrl) {
            var im = el("img", "answer-option-img");
            im.src = absUrl(o.mediaUrl);
            im.alt = o.text || "";
            opts.appendChild(im);
          } else {
            opts.appendChild(el("span", "answer-option-text", escapeHtml(o.text)));
          }
        });
      if (!opts.children.length) opts.appendChild(el("span", "answer-option-text", "—"));
      wrap.appendChild(opts);
      return;
    }

    if (type === "qr") {
      renderQr(wrap, task);
      return;
    }

    wrap.appendChild(el("div", "answer-label", "Тип ответа: " + escapeHtml(type)));
  }

  function renderQr(wrap, task) {
    var block = el("div", "qr-block");
    var canvasWrap = el("div", "qr-canvas-wrap");
    var canvas = document.createElement("canvas");
    canvasWrap.appendChild(canvas);
    block.appendChild(canvasWrap);

    var btn = el("button", "btn", "Обновить");
    btn.type = "button";
    block.appendChild(btn);

    function refresh() {
      var payload = JSON.stringify({ id: task.id, createdAt: moscowIso() });
      try {
        QRCode.render(canvas, payload, { size: 260, margin: 4, ecLevel: "M" });
      } catch (err) {
        var errEl = el("div", "qr-payload", "Ошибка генерации QR: " + err.message);
        block.insertBefore(errEl, btn);
      }
    }

    btn.addEventListener("click", refresh);
    refresh();
    wrap.appendChild(block);
  }

  function renderQuest(quest, content) {
    var tasks = quest.tasks || [];

    var subtitle = document.getElementById("questSubtitle");
    var parts = [];
    if (quest.name) parts.push(quest.name);
    if (quest.cityName) parts.push(quest.cityName);
    subtitle.textContent = parts.join(" · ");

    content.innerHTML = "";

    var starter = tasks.filter(function (t) {
      return t.isStarter;
    });
    var common = tasks.filter(function (t) {
      return !t.isStarter && t.questType === "common";
    });
    var child = tasks.filter(function (t) {
      return !t.isStarter && t.questType === "child";
    });

    renderSection(content, "Стартовое задание", "", starter);
    renderSection(content, "Квест", "Задания основного квеста", common);
    renderSection(content, "Детский квест", "Задания детского квеста", child);

    if (!tasks.length) {
      content.appendChild(el("p", "error", "Заданий пока нет."));
    }
  }

  function loadQuest(cityId) {
    var content = document.getElementById("content");
    var subtitle = document.getElementById("questSubtitle");
    subtitle.textContent = "";
    content.innerHTML = '<p class="loading">Загрузка квеста…</p>';

    fetch(api(QUEST_URL + encodeURIComponent(cityId)), { cache: "no-store" })
      .then(function (r) {
        return r.json().then(function (json) {
          return { ok: r.ok, status: r.status, json: json };
        });
      })
      .then(function (res) {
        if (res.status === 404) {
          content.innerHTML =
            '<p class="error">Квест в этом городе сейчас недоступен.</p>';
          return;
        }
        if (!res.ok) throw new Error("HTTP " + res.status);
        var quest = res.json.data || res.json;
        renderQuest(quest, content);
      })
      .catch(function (err) {
        content.innerHTML =
          '<p class="error">Не удалось загрузить квест: ' +
          escapeHtml(err.message) +
          "</p>";
      });
  }

  function init() {
    var select = document.getElementById("citySelect");
    var content = document.getElementById("content");

    fetch(api(CITIES_URL), { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (json) {
        var cities = json.list || [];
        select.innerHTML =
          '<option value="" disabled selected>Выберите город</option>';
        cities.forEach(function (c) {
          var opt = document.createElement("option");
          opt.value = c.id;
          opt.textContent = c.name;
          select.appendChild(opt);
        });

        select.addEventListener("change", function () {
          if (select.value) loadQuest(select.value);
        });

        content.innerHTML =
          '<p class="loading">Выберите город, чтобы увидеть квест.</p>';
      })
      .catch(function (err) {
        select.innerHTML = '<option value="" disabled selected>Ошибка загрузки</option>';
        content.innerHTML =
          '<p class="error">Не удалось загрузить список городов: ' +
          escapeHtml(err.message) +
          "</p>";
      });
  }

  init();
})();
