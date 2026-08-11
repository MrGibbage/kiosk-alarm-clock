(function () {
  "use strict";

  // No Settings saved yet — send Skip there first instead of showing a
  // clock that can't reach HA.
  if (!ConfigStore.isConfigured()) {
    window.location.href = "settings.html";
    return;
  }

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- flip clock (unchanged from mockup) ---------- */

  function buildDigit() {
    var wrap = document.createElement("div");
    wrap.className = "flap-digit";
    var top = document.createElement("div");
    top.className = "flap-face flap-face--top";
    var span = document.createElement("span");
    top.appendChild(span);
    wrap.appendChild(top);
    wrap._span = span;
    wrap._face = top;
    wrap._value = null;
    return wrap;
  }

  function setDigit(wrap, value) {
    if (wrap._value === value) return;
    var isFirstRender = wrap._value === null;
    wrap._value = value;

    if (isFirstRender || reduceMotion) {
      wrap._span.textContent = value;
      return;
    }

    var face = wrap._face;
    var settled = false;

    function settle() {
      if (settled) return;
      settled = true;
      face.style.transition = "none";
      face.style.transform = "rotateX(90deg)";
      void face.offsetHeight;
      face.style.transition = "transform 150ms ease-out";
      face.style.transform = "rotateX(0deg)";
      face.removeEventListener("transitionend", settle);
    }

    setTimeout(function () {
      if (!settled) {
        wrap._span.textContent = value;
        settle();
      }
    }, 250);

    face.addEventListener("transitionend", function onMid() {
      wrap._span.textContent = value;
      settle();
    }, { once: true });

    face.style.transition = "transform 150ms ease-in";
    face.style.transform = "rotateX(-90deg)";
  }

  var hourGroup = document.getElementById("hourGroup");
  var minuteGroup = document.getElementById("minuteGroup");
  var digits = {
    h1: buildDigit(), h2: buildDigit(),
    m1: buildDigit(), m2: buildDigit()
  };
  hourGroup.appendChild(digits.h1);
  hourGroup.appendChild(digits.h2);
  minuteGroup.appendChild(digits.m1);
  minuteGroup.appendChild(digits.m2);

  var meridiemEl = document.getElementById("meridiem");
  var dateEl = document.getElementById("date");

  function tick() {
    var now = new Date();
    var h = now.getHours();
    var meridiem = h >= 12 ? "PM" : "AM";
    var h12 = h % 12;
    if (h12 === 0) h12 = 12;
    var hh = String(h12).padStart(2, "0");
    var mm = String(now.getMinutes()).padStart(2, "0");

    setDigit(digits.h1, hh[0]);
    setDigit(digits.h2, hh[1]);
    setDigit(digits.m1, mm[0]);
    setDigit(digits.m2, mm[1]);
    meridiemEl.textContent = meridiem;

    dateEl.textContent = now.toLocaleDateString(undefined, {
      weekday: "long", month: "long", day: "numeric"
    });
  }

  tick();
  setInterval(tick, 1000);

  /* ---------- theme toggle (unchanged from mockup) ---------- */

  var toggle = document.getElementById("themeToggle");
  var root = document.documentElement;
  toggle.addEventListener("click", function () {
    var current = root.getAttribute("data-theme");
    var isDark = current
      ? current === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.setAttribute("data-theme", isDark ? "light" : "dark");
  });

  document.getElementById("settingsBtn").addEventListener("click", function () {
    window.location.href = "settings.html";
  });

  /* ---------- HA connection status + tile enable/disable ---------- */

  var connectionStatus = document.getElementById("connectionStatus");
  var buttonsNav = document.getElementById("buttons");
  var isOnline = true;

  function setConnection(online) {
    isOnline = online;
    var state = online ? "online" : "offline";
    connectionStatus.dataset.state = state;
    buttonsNav.dataset.connection = state;
  }

  function pollConnection() {
    HAClient.ping().then(function (res) { setConnection(res.ok); });
  }

  pollConnection();
  setInterval(pollConnection, 15000);

  /* ---------- alarm / skip pills ---------- */

  var alarmPillText = document.getElementById("alarmPillText");
  var skipPill = document.getElementById("skipPill");
  var skipPillText = document.getElementById("skipPillText");
  var FIXED = ConfigStore.FIXED;

  function refreshPills() {
    HAClient.getStates().then(function (res) {
      if (!res.ok || !Array.isArray(res.data)) return;

      var enabledCount = res.data.filter(function (e) {
        return e.entity_id.indexOf("input_boolean." + FIXED.alarmPrefix) === 0 &&
          e.entity_id.slice(-"_enabled".length) === "_enabled" &&
          e.state === "on";
      }).length;
      // Counting enabled alarms rather than computing a precise "next
      // alarm time" — HA schedule helpers don't reliably expose a single
      // "next on" timestamp attribute across versions, and getting that
      // math wrong is worse than a simple honest count.
      alarmPillText.textContent = enabledCount === 0
        ? "No alarms enabled"
        : enabledCount + " alarm" + (enabledCount === 1 ? "" : "s") + " enabled";

      var skipEntity = res.data.filter(function (e) { return e.entity_id === FIXED.skipUntil; })[0];
      if (skipEntity && skipEntity.state && skipEntity.state !== "unknown" && skipEntity.state !== "unavailable") {
        var skipDate = new Date(skipEntity.state + "T00:00:00");
        var today = new Date();
        today.setHours(0, 0, 0, 0);
        if (skipDate >= today) {
          skipPillText.textContent = "Skipped through " + skipDate.toLocaleDateString(undefined, { month: "short", day: "numeric" });
          skipPill.hidden = false;
        } else {
          skipPill.hidden = true;
        }
      } else {
        skipPill.hidden = true;
      }
    });
  }

  refreshPills();
  setInterval(refreshPills, 30000);

  /* ---------- ringing watcher ---------- */

  function pollRinging() {
    HAClient.getState(FIXED.ringing).then(function (res) {
      if (res.ok && res.data && res.data.state === "on") {
        window.location.href = "ringing.html";
      }
    });
  }

  setInterval(pollRinging, 5000);

  /* ---------- tiles ---------- */

  var cfg = ConfigStore.load();

  document.getElementById("tileLighting").addEventListener("click", function () {
    window.location.href = "lighting.html";
  });

  document.getElementById("tileCeilingLight").addEventListener("click", function () {
    if (cfg.entityCeilingLight) HAClient.activateEntity(cfg.entityCeilingLight);
  });

  document.getElementById("tileGoodNight").addEventListener("click", function () {
    if (cfg.entityGoodNight) HAClient.activateEntity(cfg.entityGoodNight);
  });

  document.getElementById("tileBathroom").addEventListener("click", function () {
    if (cfg.entityBathroom) HAClient.activateEntity(cfg.entityBathroom);
  });

  document.getElementById("tileSkipTonight").addEventListener("click", function () {
    var tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    var iso = tomorrow.toISOString().slice(0, 10);
    HAClient.callService("input_datetime", "set_datetime", {
      entity_id: FIXED.skipUntil,
      date: iso
    }).then(refreshPills);
  });

  document.getElementById("tileSnooze").addEventListener("click", function () {
    // Only meaningful if something is actually ringing right now — a stray
    // tap otherwise would arm a snooze timer that later re-triggers ringing
    // for no reason.
    HAClient.getState(FIXED.ringing).then(function (res) {
      if (res.ok && res.data && res.data.state === "on") {
        HAClient.callService("timer", "start", { entity_id: FIXED.snoozeTimer });
        HAClient.callService("input_boolean", "turn_off", { entity_id: FIXED.ringing });
      }
    });
  });
})();
