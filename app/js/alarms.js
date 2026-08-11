(function () {
  "use strict";

  if (!ConfigStore.isConfigured()) {
    window.location.href = "settings.html";
    return;
  }

  var SVGNS = "http://www.w3.org/2000/svg";
  var CX = 120, CY = 120, LABEL_R = 92;
  var ALARM_PREFIX = ConfigStore.FIXED.alarmPrefix; // "kiosk_alarm_"
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
    sound: "chimes"
  };
  var editingAlarm = null; // null = creating a new alarm

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

  function fetchAlarms() {
    return HAClient.getStates().then(function (res) {
      if (!res.ok || !Array.isArray(res.data)) return [];

      var schedules = res.data.filter(function (e) {
        return e.entity_id.indexOf("schedule." + ALARM_PREFIX) === 0;
      });
      var boolStates = {};
      res.data.forEach(function (e) {
        if (e.entity_id.indexOf("input_boolean." + ALARM_PREFIX) === 0) boolStates[e.entity_id] = e.state;
      });

      var configFetches = schedules.map(function (e) {
        var objectId = e.entity_id.slice("schedule.".length);
        return HAClient.getHelperConfig("schedule", objectId).then(function (cfgRes) {
          var boolId = "input_boolean." + objectId + "_enabled";
          var parsed = cfgRes.ok ? parseSchedulePayload(cfgRes.data) : { hour: 7, minute: 0, ampm: "AM", days: [false, false, false, false, false, false, false] };
          return {
            objectId: objectId,
            scheduleId: e.entity_id,
            boolId: boolId,
            label: (cfgRes.ok && cfgRes.data.name) || e.attributes.friendly_name || objectId,
            hour: parsed.hour,
            minute: parsed.minute,
            ampm: parsed.ampm,
            days: parsed.days,
            enabled: boolStates[boolId] === "on"
          };
        });
      });

      return Promise.all(configFetches);
    });
  }

  function refreshList() {
    fetchAlarms().then(renderAlarms);
  }

  /* ---------- editor open/close/save/delete ---------- */

  function openEditor(alarm) {
    editingAlarm = alarm;
    if (alarm) {
      state.hour = alarm.hour;
      state.minute = alarm.minute;
      state.ampm = alarm.ampm;
      state.days = alarm.days.slice();
      state.sound = ConfigStore.getAlarmSound(alarm.scheduleId, SOUNDS[0] && SOUNDS[0].id);
      labelInput.value = alarm.label;
      deleteBtn.hidden = false;
    } else {
      state.hour = 7;
      state.minute = 0;
      state.ampm = "AM";
      state.days = [false, true, true, true, true, true, false];
      state.sound = (SOUNDS[0] && SOUNDS[0].id) || "chimes";
      labelInput.value = "New Alarm";
      deleteBtn.hidden = true;
    }
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

  function nextFreeAlarmId(alarms) {
    var maxN = 0;
    alarms.forEach(function (a) {
      var m = /^kiosk_alarm_(\d+)$/.exec(a.objectId);
      if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
    });
    return ALARM_PREFIX + (maxN + 1);
  }

  function applySave() {
    var label = labelInput.value || "Alarm";
    var payload = buildSchedulePayload(label);
    var saveBtn = document.getElementById("saveBtn");
    saveBtn.disabled = true;

    var work;
    if (editingAlarm) {
      work = HAClient.upsertHelperConfig("schedule", editingAlarm.objectId, payload).then(function () {
        ConfigStore.setAlarmSound(editingAlarm.scheduleId, state.sound);
      });
    } else {
      work = fetchAlarms().then(function (alarms) {
        var objectId = nextFreeAlarmId(alarms);
        var boolObjectId = objectId + "_enabled";
        return HAClient.upsertHelperConfig("schedule", objectId, payload)
          .then(function () { return HAClient.upsertHelperConfig("input_boolean", boolObjectId, { name: label + " Enabled", icon: "mdi:toggle-switch" }); })
          .then(function () { return HAClient.callService("input_boolean", "turn_on", { entity_id: "input_boolean." + boolObjectId }); })
          .then(function () { ConfigStore.setAlarmSound("schedule." + objectId, state.sound); });
      });
    }

    work.then(function () {
      saveBtn.disabled = false;
      closeEditor();
      refreshList();
    }).catch(function () {
      saveBtn.disabled = false;
    });
  }

  function applyDelete() {
    if (!editingAlarm) return;
    var alarm = editingAlarm;
    HAClient.deleteHelperConfig("schedule", alarm.objectId)
      .then(function () { return HAClient.deleteHelperConfig("input_boolean", alarm.objectId + "_enabled"); })
      .then(function () {
        ConfigStore.removeAlarmSound(alarm.scheduleId);
        closeEditor();
        refreshList();
      });
  }

  document.getElementById("cancelBtn").addEventListener("click", closeEditor);
  document.getElementById("saveBtn").addEventListener("click", applySave);
  deleteBtn.addEventListener("click", applyDelete);
  backdrop.addEventListener("click", function (evt) { if (evt.target === backdrop) closeEditor(); });

  addAlarmRow.addEventListener("click", function () { openEditor(null); });
  addAlarmBtn.addEventListener("click", function () { openEditor(null); });

  document.getElementById("backBtn").addEventListener("click", function () { window.location.href = "index.html"; });

  renderDial();
  refreshList();
})();
