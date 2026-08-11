(function () {
  "use strict";

  if (!ConfigStore.isConfigured()) {
    window.location.href = "settings.html";
    return;
  }

  var cfg = ConfigStore.load();
  var ENTITIES = { skip: cfg.entitySkipLight, suzanne: cfg.entitySuzanneLight };
  var FAN_ENTITY = cfg.entityFan;
  var FAN_PERCENT = { max: 100, med: 67, low: 33, off: 0 };
  var FAN_LABEL = { max: "Max", med: "Med", low: "Low", off: "Off" };

  document.getElementById("backBtn").addEventListener("click", function () {
    window.location.href = "index.html";
  });

  /* ---------- lights ---------- */

  var lightState = { skip: 0, suzanne: 0 };

  var lightBackdrop = document.getElementById("lightBackdrop");
  var lightDialogTitle = document.getElementById("lightDialogTitle");
  var brightnessTrack = document.getElementById("brightnessTrack");
  var brightnessFill = document.getElementById("brightnessFill");
  var brightnessThumb = document.getElementById("brightnessThumb");
  var brightnessValue = document.getElementById("brightnessValue");
  var currentLightId = null;

  function cardStateText(pct) {
    return pct > 0 ? pct + "%" : "Off";
  }

  function renderBrightness(pct) {
    brightnessFill.style.height = pct + "%";
    brightnessThumb.style.bottom = pct + "%";
    brightnessValue.textContent = pct + "%";
  }

  function sendBrightness(id, pct) {
    var entityId = ENTITIES[id];
    if (!entityId) return;
    if (pct <= 0) {
      HAClient.callService("light", "turn_off", { entity_id: entityId });
    } else {
      HAClient.callService("light", "turn_on", { entity_id: entityId, brightness_pct: pct });
    }
  }

  function setBrightnessFromEvent(evt) {
    var rect = brightnessTrack.getBoundingClientRect();
    var y = evt.clientY - rect.top;
    var pct = Math.round(100 - (y / rect.height) * 100);
    pct = Math.max(0, Math.min(100, pct));
    lightState[currentLightId] = pct;
    renderBrightness(pct);
  }

  var draggingSlider = false;
  brightnessTrack.addEventListener("pointerdown", function (evt) {
    draggingSlider = true;
    brightnessTrack.setPointerCapture(evt.pointerId);
    setBrightnessFromEvent(evt);
  });
  brightnessTrack.addEventListener("pointermove", function (evt) {
    if (draggingSlider) setBrightnessFromEvent(evt);
  });
  brightnessTrack.addEventListener("pointerup", function () {
    if (draggingSlider) sendBrightness(currentLightId, lightState[currentLightId]);
    draggingSlider = false;
  });

  document.getElementById("lightOnBtn").addEventListener("click", function () {
    lightState[currentLightId] = lightState[currentLightId] > 0 ? lightState[currentLightId] : 100;
    renderBrightness(lightState[currentLightId]);
    sendBrightness(currentLightId, lightState[currentLightId]);
  });
  document.getElementById("lightOffBtn").addEventListener("click", function () {
    lightState[currentLightId] = 0;
    renderBrightness(0);
    sendBrightness(currentLightId, 0);
  });

  function openLight(id, name) {
    if (!ENTITIES[id]) { window.location.href = "settings.html"; return; }
    currentLightId = id;
    lightDialogTitle.textContent = name;
    renderBrightness(lightState[id]);
    lightBackdrop.classList.add("is-open");
  }

  function closeLight() {
    lightBackdrop.classList.remove("is-open");
    var el = document.querySelector('[data-state-for="' + currentLightId + '"]');
    if (el) el.textContent = cardStateText(lightState[currentLightId]);
  }

  Array.prototype.slice.call(document.querySelectorAll("[data-light]")).forEach(function (card) {
    card.addEventListener("click", function () {
      openLight(card.dataset.light, card.dataset.name);
    });
  });

  document.getElementById("lightDoneBtn").addEventListener("click", closeLight);
  lightBackdrop.addEventListener("click", function (evt) {
    if (evt.target === lightBackdrop) closeLight();
  });

  /* ---------- fan ---------- */

  var fanState = "off";
  var fanBackdrop = document.getElementById("fanBackdrop");
  var fanCard = document.getElementById("fanCard");
  var fanCardState = document.getElementById("fanCardState");

  fanCard.addEventListener("click", function () {
    if (!FAN_ENTITY) { window.location.href = "settings.html"; return; }
    Array.prototype.slice.call(document.querySelectorAll(".fan-btn")).forEach(function (b) {
      b.classList.toggle("is-selected", b.dataset.speed === fanState);
    });
    fanBackdrop.classList.add("is-open");
  });

  Array.prototype.slice.call(document.querySelectorAll(".fan-btn")).forEach(function (btn) {
    btn.addEventListener("click", function () {
      fanState = btn.dataset.speed;
      fanCardState.textContent = FAN_LABEL[fanState];
      fanBackdrop.classList.remove("is-open");
      if (fanState === "off") {
        HAClient.callService("fan", "turn_off", { entity_id: FAN_ENTITY });
      } else {
        HAClient.callService("fan", "set_percentage", { entity_id: FAN_ENTITY, percentage: FAN_PERCENT[fanState] });
      }
    });
  });

  fanBackdrop.addEventListener("click", function (evt) {
    if (evt.target === fanBackdrop) fanBackdrop.classList.remove("is-open");
  });

  /* ---------- initial state fetch ---------- */

  function brightnessPctFromState(data) {
    if (!data || data.state !== "on") return 0;
    var b = data.attributes && data.attributes.brightness;
    return b ? Math.round((b / 255) * 100) : 100;
  }

  function fanSpeedFromState(data) {
    if (!data || data.state !== "on") return "off";
    var pct = (data.attributes && data.attributes.percentage) || 0;
    if (pct >= 84) return "max";
    if (pct >= 50) return "med";
    if (pct > 0) return "low";
    return "off";
  }

  Object.keys(ENTITIES).forEach(function (id) {
    var entityId = ENTITIES[id];
    var stateEl = document.querySelector('[data-state-for="' + id + '"]');
    if (!entityId) { if (stateEl) stateEl.textContent = "Not set"; return; }
    HAClient.getState(entityId).then(function (res) {
      var pct = res.ok ? brightnessPctFromState(res.data) : 0;
      lightState[id] = pct;
      if (stateEl) stateEl.textContent = res.ok ? cardStateText(pct) : "Unavailable";
    });
  });

  if (!FAN_ENTITY) {
    fanCardState.textContent = "Not set";
  } else {
    HAClient.getState(FAN_ENTITY).then(function (res) {
      fanState = res.ok ? fanSpeedFromState(res.data) : "off";
      fanCardState.textContent = res.ok ? FAN_LABEL[fanState] : "Unavailable";
    });
  }
})();
