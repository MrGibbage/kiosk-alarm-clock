(function () {
  "use strict";

  // No Settings saved yet — send Skip there first instead of showing a
  // clock that can't reach HA.
  if (!ConfigStore.isConfigured()) {
    window.location.href = "settings.html";
    return;
  }

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var hideLeadingHourZero = ConfigStore.loadHideLeadingHourZero();
  var FIXED = ConfigStore.FIXED;

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

    var showHourTens = !(hideLeadingHourZero && h12 < 10);
    if (showHourTens) {
      // Coming back from hidden — snap the digit in instead of flipping
      // from whatever stale value it last held while off-screen.
      if (digits.h1.hidden) digits.h1._value = null;
      digits.h1.hidden = false;
      setDigit(digits.h1, hh[0]);
    } else {
      digits.h1.hidden = true;
    }
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

  /* ---------- day/night theme ---------- */
  /* Source of truth is input_boolean.kiosk_alarm_night_mode in HA — Tasker
     flips it at sunset/sunrise (the same profiles that already dim/undim
     the tablet's screen brightness, 2026-08-19), and this polls it on the
     same 30s cadence as the other pills. The sun/moon button writes back
     to that same boolean instead of setting data-theme directly, so a
     manual tap and the next poll never fight each other. */

  var toggle = document.getElementById("themeToggle");
  var root = document.documentElement;

  function applyTheme(isNight) {
    root.setAttribute("data-theme", isNight ? "dark" : "light");
  }

  function refreshTheme() {
    HAClient.getState(FIXED.nightMode).then(function (res) {
      if (res.ok && res.data) applyTheme(res.data.state === "on");
    });
  }

  refreshTheme();
  setInterval(refreshTheme, 30000);

  toggle.addEventListener("click", function () {
    var isNight = root.getAttribute("data-theme") === "dark";
    HAClient.callService("input_boolean", isNight ? "turn_off" : "turn_on", { entity_id: FIXED.nightMode })
      .then(refreshTheme);
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
  // Epoch ms the current skip runs until, or 0 if none active — populated by
  // refreshPills() from input_datetime's own `timestamp` attribute (HA
  // computes this for us regardless of has_time), read by skipTonight() to
  // decide tap-to-arm vs tap-to-cancel on the tile itself (see "reversed
  // icon, no banner" — the "Skipped through…" pill this used to live in is
  // gone).
  var skipUntilMs = 0;

  function goToAlarms() { window.location.href = "alarms.html"; }

  document.getElementById("alarmPill").addEventListener("click", goToAlarms);

  var clockLink = document.getElementById("clockLink");
  clockLink.addEventListener("click", goToAlarms);
  clockLink.addEventListener("keydown", function (evt) {
    if (evt.key === "Enter" || evt.key === " ") { evt.preventDefault(); goToAlarms(); }
  });

  function refreshPills() {
    // Which booleans are "our" alarms is tracked in ConfigStore, not
    // inferred by prefix — alarms are created via HA's WebSocket API,
    // which assigns its own id (e.g. input_boolean.new_alarm_enabled),
    // not the kiosk_alarm_N naming the old REST-based design used.
    var managedBoolIds = ConfigStore.listManagedAlarms().map(function (a) { return a.boolId; });

    HAClient.getStates().then(function (res) {
      if (!res.ok || !Array.isArray(res.data)) return;

      var enabledCount = res.data.filter(function (e) {
        return managedBoolIds.indexOf(e.entity_id) !== -1 && e.state === "on";
      }).length;
      // Counting enabled alarms rather than computing a precise "next
      // alarm time" — HA schedule helpers don't reliably expose a single
      // "next on" timestamp attribute across versions, and getting that
      // math wrong is worse than a simple honest count.
      // Kept short ("No alarms" / "1 alarm", not "...enabled") so the
      // status row stays on one line at the doubled pill font size
      // (2026-08-19) — a wrapped row pushes the bottom tile row off an
      // 800px-tall kiosk screen.
      alarmPillText.textContent = enabledCount === 0
        ? "No alarms"
        : enabledCount + " alarm" + (enabledCount === 1 ? "" : "s");

      var skipEntity = res.data.filter(function (e) { return e.entity_id === FIXED.skipUntil; })[0];
      skipUntilMs = (skipEntity && skipEntity.attributes && typeof skipEntity.attributes.timestamp === "number")
        ? skipEntity.attributes.timestamp * 1000
        : 0;
      // No banner for this any more — the Skip Tonight tile's own icon
      // inverts (filled accent background, see index.html's .is-skipping)
      // for as long as skip is active.
      var skipTile = buttonsNav.querySelector('[data-action="skip_tonight"]');
      if (skipTile) skipTile.classList.toggle("is-skipping", skipUntilMs > Date.now());
    });
  }

  // First call is deferred until after tiles are built below — refreshPills
  // looks up the Skip Tonight tile by data-action, which doesn't exist yet
  // this early in the script.
  setInterval(refreshPills, 30000);

  /* ---------- occupancy status ---------- */
  /* Lets Skip glance at the clock and see why a smart-skipped alarm
     didn't ring. Reads the entity list from HA's
     input_text.kiosk_alarm_occupancy_entities — the list
     kiosk_alarm.yaml's occupancy condition actually ORs — rather than
     this browser's localStorage copy, so the pill can't disagree with the
     automation if the two ever drift (the popup flags drift if it finds
     any). Tapping the pill opens a per-entity breakdown. */
  var occupancyPill = document.getElementById("occupancyPill");
  var occupancyPillText = document.getElementById("occupancyPillText");
  var occupancyBackdrop = document.getElementById("occupancyBackdrop");
  var occupancyVerdict = document.getElementById("occupancyVerdict");
  var occupancyList = document.getElementById("occupancyList");
  var occupancyNote = document.getElementById("occupancyNote");
  var occupancyDialogTimer = null;

  function formatClockTime(d) {
    var h = d.getHours();
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    return h12 + ":" + String(d.getMinutes()).padStart(2, "0") + " " + (h >= 12 ? "PM" : "AM");
  }

  function formatSince(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    var sameDay = d.toDateString() === new Date().toDateString();
    return "since " + (sameDay ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " ") + formatClockTime(d);
  }

  // Resolves to {ok, ids, entities:[{id, res}]}. ok=false means we couldn't
  // even read HA's list, so we genuinely don't know — distinct from an
  // entity that HA reports as unavailable (which the automation treats as
  // "not occupied", failing open).
  function loadOccupancy() {
    return HAClient.getState(FIXED.occupancyEntities).then(function (listRes) {
      if (!listRes.ok || !listRes.data) return { ok: false, ids: [], entities: [] };
      var ids = String(listRes.data.state || "").split(",")
        .map(function (s) { return s.trim(); })
        .filter(function (s) { return s && s !== "unknown" && s !== "unavailable"; });
      return Promise.all(ids.map(function (id) { return HAClient.getState(id); })).then(function (results) {
        return {
          ok: true,
          ids: ids,
          entities: ids.map(function (id, i) { return { id: id, res: results[i] }; })
        };
      });
    });
  }

  function isOccupied(snapshot) {
    return snapshot.entities.some(function (e) { return e.res.ok && e.res.data && e.res.data.state === "on"; });
  }

  function renderPill(snapshot) {
    if (!snapshot.ok) {
      occupancyPill.dataset.state = "";
      occupancyPillText.textContent = "Occupancy ?";
    } else if (!snapshot.ids.length) {
      occupancyPill.dataset.state = "";
      occupancyPillText.textContent = "Not set";
    } else {
      var occupied = isOccupied(snapshot);
      occupancyPill.dataset.state = occupied ? "occupied" : "";
      occupancyPillText.textContent = occupied ? "Occupied" : "Clear";
    }
  }

  function renderDialog(snapshot) {
    occupancyList.textContent = "";
    var notes = [];

    if (!snapshot.ok) {
      occupancyVerdict.dataset.state = "";
      occupancyVerdict.textContent = "Couldn't reach Home Assistant to read the tracked sensors.";
    } else if (!snapshot.ids.length) {
      occupancyVerdict.dataset.state = "";
      occupancyVerdict.textContent = "No sensors tracked: alarms always ring.";
    } else if (isOccupied(snapshot)) {
      occupancyVerdict.dataset.state = "occupied";
      occupancyVerdict.textContent = "Occupied: alarms would be skipped and a snooze would be cancelled (unless the alarm is set to Always ring).";
    } else {
      occupancyVerdict.dataset.state = "";
      occupancyVerdict.textContent = "Clear: alarms will ring.";
    }

    snapshot.entities.forEach(function (e) {
      var li = document.createElement("li");
      li.className = "occ-row";

      var name = document.createElement("div");
      name.className = "occ-name";
      var title = document.createElement("strong");
      var sub = document.createElement("small");
      sub.textContent = e.id;
      name.appendChild(title);
      name.appendChild(sub);

      var state = document.createElement("div");
      state.className = "occ-state";
      var stateText = document.createElement("strong");
      var since = document.createElement("small");
      state.appendChild(stateText);
      state.appendChild(since);

      if (!e.res.ok || !e.res.data) {
        title.textContent = e.id;
        stateText.textContent = e.res.status === 404 ? "Not found" : "Error";
        state.dataset.state = "error";
        notes.push(e.id + (e.res.status === 404
          ? " doesn't exist in Home Assistant. The alarm treats it as clear."
          : " couldn't be read just now."));
      } else {
        var st = e.res.data.state;
        title.textContent = (e.res.data.attributes && e.res.data.attributes.friendly_name) || e.id;
        stateText.textContent = st === "on" ? "Occupied" : st === "off" ? "Clear" : st.charAt(0).toUpperCase() + st.slice(1);
        since.textContent = formatSince(e.res.data.last_changed);
        state.dataset.state = st;
        if (st === "unavailable" || st === "unknown") {
          notes.push(title.textContent + " is " + st + ". The alarm treats that as clear (fails open).");
        }
      }

      li.appendChild(name);
      li.appendChild(state);
      occupancyList.appendChild(li);
    });

    // Settings writes both localStorage and the HA helper; flag it if a
    // failed push (or an edit made outside the app) left them different.
    if (snapshot.ok) {
      var localIds = ConfigStore.loadOccupancyEntities().filter(Boolean).map(function (s) { return s.id; });
      var same = localIds.length === snapshot.ids.length &&
        localIds.every(function (id) { return snapshot.ids.indexOf(id) !== -1; });
      if (!same) {
        notes.push("This clock's Settings list (" + (localIds.join(", ") || "none") +
          ") doesn't match what the alarm uses (" + (snapshot.ids.join(", ") || "none") +
          "). Re-save Occupancy Detection in Settings to sync them.");
      }
    }

    occupancyNote.hidden = !notes.length;
    occupancyNote.textContent = notes.join(" ");
  }

  function refreshOccupancy() {
    return loadOccupancy().then(function (snapshot) {
      renderPill(snapshot);
      if (occupancyBackdrop.classList.contains("is-open")) renderDialog(snapshot);
    });
  }

  function openOccupancyDialog() {
    occupancyVerdict.dataset.state = "";
    occupancyVerdict.textContent = "Checking…";
    occupancyList.textContent = "";
    occupancyNote.hidden = true;
    occupancyBackdrop.classList.add("is-open");
    refreshOccupancy();
    // Faster refresh while open, so walking past a motion sensor shows up
    // promptly while you're watching.
    occupancyDialogTimer = setInterval(refreshOccupancy, 3000);
  }

  function closeOccupancyDialog() {
    occupancyBackdrop.classList.remove("is-open");
    clearInterval(occupancyDialogTimer);
    occupancyDialogTimer = null;
  }

  occupancyPill.addEventListener("click", openOccupancyDialog);
  document.getElementById("occupancyDoneBtn").addEventListener("click", closeOccupancyDialog);
  occupancyBackdrop.addEventListener("click", function (evt) {
    if (evt.target === occupancyBackdrop) closeOccupancyDialog();
  });

  refreshOccupancy();
  setInterval(refreshOccupancy, 15000);

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
  /* Rendered from ConfigStore.loadButtons() (order/icon/label/action per
     slot, editable via buttons.html) rather than fixed markup — see the
     button-config-screen mockup (2026-08-12) this implements. */

  // input_datetime has no "clear" service — setting it a minute in the past
  // is what actually cancels a skip in progress, since the automation's
  // condition is "skip_until < now". Tapping the tile while already skipping
  // cancels; tapping while idle arms a fresh rolling 23h59m window.
  function setSkipUntil(d) {
    var pad = function (n) { return String(n).padStart(2, "0"); };
    return HAClient.callService("input_datetime", "set_datetime", {
      entity_id: FIXED.skipUntil,
      date: d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()),
      time: pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds())
    }).then(refreshPills);
  }

  function skipTonight() {
    if (skipUntilMs > Date.now()) {
      setSkipUntil(new Date(Date.now() - 60000));
      return;
    }
    setSkipUntil(new Date(Date.now() + (23 * 60 + 59) * 60 * 1000));
  }

  function snooze() {
    // Only meaningful if something is actually ringing right now — a stray
    // tap otherwise would arm a snooze timer that later re-triggers ringing
    // for no reason.
    HAClient.getState(FIXED.ringing).then(function (res) {
      if (res.ok && res.data && res.data.state === "on") {
        HAClient.callService("timer", "start", { entity_id: FIXED.snoozeTimer });
        HAClient.callService("input_boolean", "turn_off", { entity_id: FIXED.ringing });
      }
    });
  }

  function activateButton(btn) {
    if (btn.type === "app") {
      if (btn.action === "open_lighting") window.location.href = "lighting.html";
      else if (btn.action === "open_alarms") window.location.href = "alarms.html";
      else if (btn.action === "skip_tonight") skipTonight();
      else if (btn.action === "snooze") snooze();
    } else if (btn.type === "ha") {
      if (btn.action) HAClient.activateEntity(btn.action);
    }
  }

  ConfigStore.loadButtons().forEach(function (btn) {
    var tile = document.createElement("button");
    tile.className = "tile";
    tile.type = "button";
    if (btn.type === "app") tile.dataset.action = btn.action;
    tile.innerHTML = Icons.svg(btn.icon) + "<span>" + btn.label + "</span>";
    tile.addEventListener("click", function () { activateButton(btn); });
    buttonsNav.appendChild(tile);
  });

  refreshPills();
})();
