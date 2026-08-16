(function () {
  "use strict";

  if (!ConfigStore.isConfigured()) {
    window.location.href = "settings.html";
    return;
  }

  var SVGNS = "http://www.w3.org/2000/svg";
  var CX = 120, CY = 120, LABEL_R = 92;
  var DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

  var dial = document.getElementById("dial");
  var hourSegment = document.getElementById("hourSegment");
  var minuteSegment = document.getElementById("minuteSegment");
  var ampmButtons = Array.prototype.slice.call(document.querySelectorAll(".ampm-btn"));
  var dayChipButtons = Array.prototype.slice.call(document.querySelectorAll("#dayRow .day-chip"));
  var labelInput = document.getElementById("labelInput");
  var backdrop = document.getElementById("backdrop");
  var addAlarmRow = document.getElementById("addAlarmRow");
  var addAlarmBtn = document.getElementById("addAlarmBtn");
  var alarmList = document.getElementById("alarmList");
  var deleteBtn = document.getElementById("deleteBtn");

  var soundTrigger = document.getElementById("soundTrigger");
  var soundTriggerIcon = document.getElementById("soundTriggerIcon");
  var soundTriggerName = document.getElementById("soundTriggerName");
  var soundList = document.getElementById("soundList");

  var SOUND_ICONS = {
    audio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="sound-type-icon"><path d="M4 9v6h4l5 4V5L8 9H4Z"></path></svg>',
    video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="sound-type-icon"><rect x="3" y="5" width="18" height="14" rx="1.5"></rect><path d="M8 5v14M16 5v14"></path></svg>'
  };
  var PLAY_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg>';
  var PAUSE_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="5" width="4" height="14"></rect><rect x="13" y="5" width="4" height="14"></rect></svg>';

  var SOUNDS = [];
  var previewAudio = null;

  var state = {
    mode: "hour",
    hour: 6,
    minute: 30,
    ampm: "AM",
    days: [false, true, true, true, true, true, false],
    sound: "chimes",
    ignoreOccupancy: false
  };
  var editingAlarm = null; // null = creating a new alarm

  var ignoreOccupancyCheckbox = document.getElementById("ignoreOccupancyCheckbox");
  ignoreOccupancyCheckbox.addEventListener("change", function () {
    state.ignoreOccupancy = ignoreOccupancyCheckbox.checked;
  });

  /* ---------- sound picker (mechanics unchanged from mockup) ---------- */

  function updateSoundTrigger() {
    var s = SOUNDS.filter(function (x) { return x.id === state.sound; })[0] || SOUNDS[0];
    if (!s) return;
    soundTriggerIcon.innerHTML = SOUND_ICONS[s.type];
    soundTriggerName.textContent = s.name;
  }

  function closeSoundList() {
    soundList.hidden = true;
    soundTrigger.setAttribute("aria-expanded", "false");
  }

  function renderSoundList() {
    soundList.innerHTML = "";
    SOUNDS.forEach(function (s) {
      var opt = document.createElement("button");
      opt.type = "button";
      opt.className = "sound-option" + (s.id === state.sound ? " is-selected" : "");
      opt.setAttribute("role", "option");
      opt.dataset.id = s.id;
      opt.innerHTML =
        SOUND_ICONS[s.type] +
        '<span class="sound-option-name">' + s.name + "</span>" +
        '<span class="sound-preview" data-id="' + s.id + '" aria-label="Preview ' + s.name + '">' + PLAY_ICON + "</span>";
      opt.addEventListener("click", function () {
        state.sound = s.id;
        updateSoundTrigger();
        renderSoundList();
        closeSoundList();
      });
      soundList.appendChild(opt);
    });

    Array.prototype.slice.call(soundList.querySelectorAll(".sound-preview")).forEach(function (btn) {
      btn.addEventListener("click", function (evt) {
        evt.stopPropagation();
        var id = btn.dataset.id;
        var isPlaying = btn.classList.contains("is-playing");
        Array.prototype.slice.call(soundList.querySelectorAll(".sound-preview.is-playing")).forEach(function (b) {
          b.classList.remove("is-playing");
          b.innerHTML = PLAY_ICON;
        });
        if (previewAudio) { previewAudio.pause(); previewAudio = null; }
        if (!isPlaying) {
          var sound = SOUNDS.filter(function (x) { return x.id === id; })[0];
          if (sound) {
            previewAudio = new Audio("media/" + sound.file);
            previewAudio.play().catch(function () { /* file not present yet — ignore */ });
          }
          btn.classList.add("is-playing");
          btn.innerHTML = PAUSE_ICON;
          setTimeout(function () {
            btn.classList.remove("is-playing");
            btn.innerHTML = PLAY_ICON;
            if (previewAudio) { previewAudio.pause(); previewAudio = null; }
          }, 2200);
        }
      });
    });
  }

  soundTrigger.addEventListener("click", function () {
    if (soundList.hidden) {
      soundList.hidden = false;
      soundTrigger.setAttribute("aria-expanded", "true");
    } else {
      closeSoundList();
    }
  });

  fetch("js/sounds.json").then(function (r) { return r.json(); }).then(function (data) {
    SOUNDS = data;
    updateSoundTrigger();
    renderSoundList();
  });

  /* ---------- dial (unchanged from mockup) ---------- */

  function idxToPos(idx, steps, radius) {
    var angle = idx * (2 * Math.PI / steps);
    return { x: CX + radius * Math.sin(angle), y: CY - radius * Math.cos(angle) };
  }

  function angleToIdx(dx, dy, steps) {
    var angle = Math.atan2(dx, -dy);
    if (angle < 0) angle += 2 * Math.PI;
    var stepAngle = (2 * Math.PI) / steps;
    return Math.round(angle / stepAngle) % steps;
  }

  function svgEl(tag, attrs) {
    var el = document.createElementNS(SVGNS, tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  function renderDial() {
    dial.innerHTML = "";
    dial.appendChild(svgEl("circle", { cx: CX, cy: CY, r: 108, class: "dial-face" }));

    var steps = 12;
    var labels, selectedIdx;
    if (state.mode === "hour") {
      labels = ["12", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"];
      selectedIdx = state.hour % 12;
    } else {
      labels = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];
      selectedIdx = Math.round(state.minute / 5) % 12;
    }

    var handSteps = state.mode === "hour" ? 12 : 60;
    var handValueIdx = state.mode === "hour" ? selectedIdx : state.minute;
    var handPos = idxToPos(handValueIdx, handSteps, LABEL_R);

    dial.appendChild(svgEl("line", { x1: CX, y1: CY, x2: handPos.x, y2: handPos.y, class: "dial-hand" }));
    dial.appendChild(svgEl("circle", { cx: handPos.x, cy: handPos.y, r: 15, class: "dial-hand-end" }));
    dial.appendChild(svgEl("circle", { cx: CX, cy: CY, r: 3.5, class: "dial-center" }));

    for (var i = 0; i < 12; i++) {
      var pos = idxToPos(i, steps, LABEL_R);
      var isSel = i === selectedIdx;
      var bg = svgEl("circle", { cx: pos.x, cy: pos.y, r: 15, class: "dial-number-bg" + (isSel ? " is-selected" : "") });
      var text = svgEl("text", { x: pos.x, y: pos.y, class: "dial-number" + (isSel ? " is-selected" : "") });
      text.textContent = labels[i];
      dial.appendChild(bg);
      dial.appendChild(text);
    }
  }

  function updateHeader() {
    hourSegment.textContent = String(state.hour).padStart(2, "0");
    minuteSegment.textContent = String(state.minute).padStart(2, "0");
    hourSegment.classList.toggle("is-active", state.mode === "hour");
    minuteSegment.classList.toggle("is-active", state.mode === "minute");
    ampmButtons.forEach(function (b) { b.classList.toggle("is-active", b.dataset.ampm === state.ampm); });
  }

  function setMode(mode) {
    state.mode = mode;
    updateHeader();
    renderDial();
  }

  function handlePointer(evt) {
    var rect = dial.getBoundingClientRect();
    var scaleX = 240 / rect.width, scaleY = 240 / rect.height;
    var x = (evt.clientX - rect.left) * scaleX;
    var y = (evt.clientY - rect.top) * scaleY;
    var dx = x - CX, dy = y - CY;

    if (state.mode === "hour") {
      var idx = angleToIdx(dx, dy, 12);
      state.hour = idx === 0 ? 12 : idx;
    } else {
      var idx60 = angleToIdx(dx, dy, 60);
      state.minute = idx60;
    }
    updateHeader();
    renderDial();
  }

  var dragging = false;
  dial.addEventListener("pointerdown", function (evt) { dragging = true; dial.setPointerCapture(evt.pointerId); handlePointer(evt); });
  dial.addEventListener("pointermove", function (evt) { if (dragging) handlePointer(evt); });
  dial.addEventListener("pointerup", function () { if (dragging && state.mode === "hour") setMode("minute"); dragging = false; });

  hourSegment.addEventListener("click", function () { setMode("hour"); });
  minuteSegment.addEventListener("click", function () { setMode("minute"); });
  ampmButtons.forEach(function (b) { b.addEventListener("click", function () { state.ampm = b.dataset.ampm; updateHeader(); }); });
  dayChipButtons.forEach(function (b) {
    b.addEventListener("click", function () {
      var d = parseInt(b.dataset.day, 10);
      state.days[d] = !state.days[d];
      b.classList.toggle("is-active", state.days[d]);
    });
  });

  /* ---------- HA time <-> dial state conversion ---------- */

  function to24h(hour12, minute, ampm) {
    var h = hour12 % 12;
    if (ampm === "PM") h += 12;
    return String(h).padStart(2, "0") + ":" + String(minute).padStart(2, "0") + ":00";
  }

  function from24h(hhmmss) {
    var parts = hhmmss.split(":");
    var h = parseInt(parts[0], 10), m = parseInt(parts[1], 10);
    var ampm = h >= 12 ? "PM" : "AM";
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    return { hour: h12, minute: m, ampm: ampm };
  }

  function addOneMinuteCapped(hhmmss) {
    var parts = hhmmss.split(":");
    var h = parseInt(parts[0], 10), m = parseInt(parts[1], 10);
    if (h === 23 && m === 59) return "23:59:59";
    m += 1;
    if (m >= 60) { m = 0; h += 1; }
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":00";
  }

  function buildSchedulePayload(label) {
    var from = to24h(state.hour, state.minute, state.ampm);
    var to = addOneMinuteCapped(from);
    var payload = { name: label, icon: "mdi:alarm" };
    DAY_KEYS.forEach(function (key, i) { payload[key] = state.days[i] ? [{ from: from, to: to }] : []; });
    return payload;
  }

  // Reconstructs dial/day state from a saved schedule config. All days on
  // one alarm share a single time in this UI, so we take the first
  // non-empty day's block as the time and mark any day matching that same
  // block as active — a schedule hand-edited outside the app with
  // per-day times would only show its first day's time here.
  function parseSchedulePayload(cfg) {
    var days = [false, false, false, false, false, false, false];
    var fromTime = null;
    DAY_KEYS.forEach(function (key, i) {
      var blocks = cfg[key];
      if (blocks && blocks.length) {
        if (!fromTime) fromTime = blocks[0].from;
        if (blocks[0].from === fromTime) days[i] = true;
      }
    });
    var t = from24h(fromTime || "07:00:00");
    return { hour: t.hour, minute: t.minute, ampm: t.ampm, days: days };
  }

  /* ---------- alarm list: fetch, render ---------- */

  function alarmRowMarkup(alarm) {
    var letters = ["S", "M", "T", "W", "T", "F", "S"];
    var chips = alarm.days.map(function (active, i) {
      return '<span class="day-chip' + (active ? " is-active" : "") + '">' + letters[i] + "</span>";
    }).join("");
    var timeText = alarm.hour + ":" + String(alarm.minute).padStart(2, "0") + " " + alarm.ampm;
    return (
      '<span class="switch" role="switch" aria-checked="' + alarm.enabled + '" aria-label="Enable ' + alarm.label + ' alarm"></span>' +
      '<span class="time-label"><span class="time">' + timeText + '</span><span class="label">' + alarm.label + '</span></span>' +
      '<span class="day-chips" aria-hidden="true">' + chips + '</span>' +
      '<span class="chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"></path></svg></span>'
    );
  }

  function renderAlarms(alarms) {
    Array.prototype.slice.call(alarmList.querySelectorAll(".alarm-row")).forEach(function (r) { r.remove(); });
    alarms.forEach(function (alarm) {
      var row = document.createElement("button");
      row.className = "alarm-row";
      row.type = "button";
      row.dataset.enabled = String(alarm.enabled);
      row.innerHTML = alarmRowMarkup(alarm);
      row.addEventListener("click", function (evt) {
        if (evt.target.closest(".switch")) return;
        openEditor(alarm);
      });
      row.querySelector(".switch").addEventListener("click", function (evt) {
        evt.stopPropagation();
        var sw = evt.currentTarget;
        var next = sw.getAttribute("aria-checked") !== "true";
        sw.setAttribute("aria-checked", String(next));
        row.dataset.enabled = String(next);
        HAClient.callService("input_boolean", "toggle", { entity_id: alarm.boolId });
      });
      alarmList.insertBefore(row, addAlarmRow);
    });
  }

  // Which schedule/input_boolean pairs are "ours" is tracked explicitly in
  // ConfigStore (see its comment) rather than inferred from a naming
  // prefix, since WS-created helpers get an HA-generated id we don't
  // control. schedule/list is the WebSocket equivalent of the REST config
  // GET this used to use — it's the only source for a schedule's actual
  // weekday/time blocks (entity *state* doesn't carry them).
  function fetchAlarms() {
    var managed = ConfigStore.listManagedAlarms();
    if (!managed.length) return Promise.resolve([]);

    var wsCfg = ConfigStore.load();
    return Promise.all([
      HAWebSocket.call(wsCfg, "schedule/list"),
      HAClient.getStates()
    ]).then(function (results) {
      var scheduleList = results[0] || [];
      var statesRes = results[1];
      var boolStates = {};
      if (statesRes.ok && Array.isArray(statesRes.data)) {
        statesRes.data.forEach(function (e) { boolStates[e.entity_id] = e.state; });
      }

      var byId = {};
      scheduleList.forEach(function (item) { byId[item.id] = item; });

      var alarms = [];
      managed.forEach(function (m) {
        var objectId = m.scheduleId.slice("schedule.".length);
        var item = byId[objectId];
        if (!item) return; // deleted directly in HA outside the app — drop it
        var parsed = parseSchedulePayload(item);
        alarms.push({
          objectId: objectId,
          scheduleId: m.scheduleId,
          boolId: m.boolId,
          occId: m.occId,
          label: item.name || objectId,
          hour: parsed.hour,
          minute: parsed.minute,
          ampm: parsed.ampm,
          days: parsed.days,
          enabled: boolStates[m.boolId] === "on",
          ignoreOccupancy: !!m.occId && boolStates[m.occId] === "on"
        });
      });
      return alarms;
    });
  }

  function refreshList() {
    var listStatus = document.getElementById("listStatus");
    fetchAlarms().then(function (alarms) {
      listStatus.textContent = "";
      renderAlarms(alarms);
    }).catch(function (err) {
      listStatus.textContent = "✗ Couldn't load alarms: " + err.message;
    });
  }

  /* ---------- editor open/close/save/delete ---------- */

  function openEditor(alarm) {
    document.getElementById("sheetStatus").textContent = "";
    editingAlarm = alarm;
    if (alarm) {
      state.hour = alarm.hour;
      state.minute = alarm.minute;
      state.ampm = alarm.ampm;
      state.days = alarm.days.slice();
      state.sound = ConfigStore.getAlarmSound(alarm.scheduleId, SOUNDS[0] && SOUNDS[0].id);
      state.ignoreOccupancy = alarm.ignoreOccupancy;
      labelInput.value = alarm.label;
      deleteBtn.hidden = false;
    } else {
      state.hour = 7;
      state.minute = 0;
      state.ampm = "AM";
      state.days = [false, true, true, true, true, true, false];
      state.sound = (SOUNDS[0] && SOUNDS[0].id) || "chimes";
      state.ignoreOccupancy = false;
      labelInput.value = "New Alarm";
      deleteBtn.hidden = true;
    }
    ignoreOccupancyCheckbox.checked = state.ignoreOccupancy;
    state.mode = "hour";
    dayChipButtons.forEach(function (b) {
      var d = parseInt(b.dataset.day, 10);
      b.classList.toggle("is-active", state.days[d]);
    });
    updateHeader();
    renderDial();
    updateSoundTrigger();
    renderSoundList();
    closeSoundList();
    backdrop.classList.add("is-open");
  }

  function closeEditor() {
    backdrop.classList.remove("is-open");
    editingAlarm = null;
  }

  // HAClient (REST) never rejects on an HTTP error status — it resolves
  // with { ok:false, status, data }. Used for the one REST call still in
  // this flow (input_boolean.turn_on, a normal service call, not a
  // Config-API write).
  function assertOk(res, what) {
    if (!res.ok) {
      var detail = (res.data && (res.data.message || JSON.stringify(res.data))) || res.error || ("HTTP " + res.status);
      throw new Error(what + " failed: " + detail);
    }
    return res;
  }

  // Mirrors the "Enabled" boolean's create-once-then-toggle pattern, but
  // this one's optional: alarms created before this feature existed have
  // no occId yet, so it's back-filled lazily on whatever edit happens to
  // touch them next rather than needing a one-time migration pass.
  function applyIgnoreOccupancy(alarm, label, wsCfg) {
    if (alarm.occId) {
      return HAClient.callService("input_boolean", state.ignoreOccupancy ? "turn_on" : "turn_off", { entity_id: alarm.occId })
        .then(function (res) { assertOk(res, "Updating ignore-occupancy switch"); });
    }
    return HAWebSocket.call(wsCfg, "input_boolean/create", { name: label + " Ignore Occupancy", icon: "mdi:motion-sensor-off" })
      .then(function (boolResult) {
        var boolObjectId = boolResult && boolResult.id;
        if (!boolObjectId) throw new Error("HA created the ignore-occupancy switch but didn't return its id");
        var occId = "input_boolean." + boolObjectId;
        ConfigStore.setManagedAlarmOccId(alarm.scheduleId, occId);
        if (!state.ignoreOccupancy) return; // new booleans already default off
        return HAClient.callService("input_boolean", "turn_on", { entity_id: occId })
          .then(function (res) { assertOk(res, "Enabling ignore-occupancy switch"); });
      });
  }

  function applySave() {
    var label = labelInput.value || "Alarm";
    var payload = buildSchedulePayload(label); // {name, icon, monday: [...], ...}
    var saveBtn = document.getElementById("saveBtn");
    var status = document.getElementById("sheetStatus");
    status.textContent = "";
    saveBtn.disabled = true;
    var wsCfg = ConfigStore.load();

    var work;
    if (editingAlarm) {
      var updatePayload = { schedule_id: editingAlarm.objectId };
      Object.keys(payload).forEach(function (k) { updatePayload[k] = payload[k]; });
      work = HAWebSocket.call(wsCfg, "schedule/update", updatePayload).then(function () {
        ConfigStore.setAlarmSound(editingAlarm.scheduleId, state.sound);
        return applyIgnoreOccupancy(editingAlarm, label, wsCfg);
      });
    } else {
      var newScheduleId, newBoolId;
      work = HAWebSocket.call(wsCfg, "schedule/create", payload).then(function (scheduleResult) {
        var scheduleObjectId = scheduleResult && scheduleResult.id;
        if (!scheduleObjectId) throw new Error("HA created the schedule but didn't return its id");
        newScheduleId = "schedule." + scheduleObjectId;
        return HAWebSocket.call(wsCfg, "input_boolean/create", { name: label + " Enabled", icon: "mdi:toggle-switch" });
      }).then(function (boolResult) {
        var boolObjectId = boolResult && boolResult.id;
        if (!boolObjectId) throw new Error("HA created the enabled switch but didn't return its id");
        newBoolId = "input_boolean." + boolObjectId;
        return HAClient.callService("input_boolean", "turn_on", { entity_id: newBoolId });
      }).then(function (res) {
        assertOk(res, "Enabling new alarm");
        return HAWebSocket.call(wsCfg, "input_boolean/create", { name: label + " Ignore Occupancy", icon: "mdi:motion-sensor-off" });
      }).then(function (occResult) {
        var occObjectId = occResult && occResult.id;
        if (!occObjectId) throw new Error("HA created the ignore-occupancy switch but didn't return its id");
        var occId = "input_boolean." + occObjectId;
        var setState = state.ignoreOccupancy
          ? HAClient.callService("input_boolean", "turn_on", { entity_id: occId }).then(function (r) { assertOk(r, "Enabling ignore-occupancy switch"); })
          : Promise.resolve();
        return setState.then(function () {
          ConfigStore.addManagedAlarm(newScheduleId, newBoolId, occId);
          ConfigStore.setAlarmSound(newScheduleId, state.sound);
        });
      });
    }

    work.then(function () {
      saveBtn.disabled = false;
      closeEditor();
      refreshList();
    }).catch(function (err) {
      saveBtn.disabled = false;
      status.textContent = "✗ " + err.message;
    });
  }

  function applyDelete() {
    if (!editingAlarm) return;
    var alarm = editingAlarm;
    var status = document.getElementById("sheetStatus");
    status.textContent = "";
    var wsCfg = ConfigStore.load();
    var boolObjectId = alarm.boolId.slice("input_boolean.".length);

    var work = HAWebSocket.call(wsCfg, "schedule/delete", { schedule_id: alarm.objectId })
      .then(function () { return HAWebSocket.call(wsCfg, "input_boolean/delete", { input_boolean_id: boolObjectId }); });

    if (alarm.occId) {
      var occObjectId = alarm.occId.slice("input_boolean.".length);
      work = work.then(function () { return HAWebSocket.call(wsCfg, "input_boolean/delete", { input_boolean_id: occObjectId }); });
    }

    work.then(function () {
        ConfigStore.removeManagedAlarm(alarm.scheduleId);
        ConfigStore.removeAlarmSound(alarm.scheduleId);
        closeEditor();
        refreshList();
      })
      .catch(function (err) {
        status.textContent = "✗ " + err.message;
      });
  }

  document.getElementById("cancelBtn").addEventListener("click", closeEditor);
  document.getElementById("saveBtn").addEventListener("click", applySave);
  deleteBtn.addEventListener("click", applyDelete);
  backdrop.addEventListener("click", function (evt) { if (evt.target === backdrop) closeEditor(); });

  document.getElementById("testTimeBtn").addEventListener("click", function () {
    var now = new Date(Date.now() + 60 * 1000);
    var h = now.getHours();
    state.ampm = h >= 12 ? "PM" : "AM";
    state.hour = h % 12 === 0 ? 12 : h % 12;
    state.minute = now.getMinutes();
    // Also select every day so the very next occurrence is guaranteed to
    // be tomorrow-through-today rather than needing a specific weekday.
    state.days = [true, true, true, true, true, true, true];
    dayChipButtons.forEach(function (b) { b.classList.add("is-active"); });
    updateHeader();
    renderDial();
  });

  addAlarmRow.addEventListener("click", function () { openEditor(null); });
  addAlarmBtn.addEventListener("click", function () { openEditor(null); });

  document.getElementById("backBtn").addEventListener("click", function () { window.location.href = "index.html"; });

  renderDial();
  refreshList();
})();
