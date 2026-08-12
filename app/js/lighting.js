(function () {
  "use strict";

  if (!ConfigStore.isConfigured()) {
    window.location.href = "settings.html";
    return;
  }

  var allSlots = ConfigStore.loadLightingCards();
  var layout = ConfigStore.loadLightingLayout();
  var layoutDef = ConfigStore.LIGHTING_LAYOUTS[layout];

  document.getElementById("backBtn").addEventListener("click", function () {
    window.location.href = "index.html";
  });

  function visibleSlots() {
    return allSlots.slice(0, layoutDef.count);
  }

  /* ---------- per-entity control-type detection ---------- */
  /* Unlike main-screen buttons (which just fire one action), a lighting
     card's popup shape depends on what the assigned entity can actually
     do — a dimmable light gets a slider, a percentage-capable fan gets
     speed buttons, anything else (a switch, a plain on/off light) just
     toggles directly on tap, same as a main-screen HA tile. Detected from
     the entity's own reported attributes rather than a manual per-card
     setting, so reassigning a card's entity never needs a second "what
     kind of control is this" step. */

  function controlTypeForState(entityId, data) {
    var domain = entityId.split(".")[0];
    var attrs = (data && data.attributes) || {};
    if (domain === "fan") {
      if (typeof attrs.percentage_step === "number" && attrs.percentage_step > 0) {
        return { type: "fan-speed", step: attrs.percentage_step };
      }
      return { type: "toggle" };
    }
    if (domain === "light") {
      var modes = attrs.supported_color_modes;
      // No supported_color_modes reported (e.g. state temporarily
      // unavailable) — assume dimmable rather than downgrading a light
      // that's simply offline right now to a plain toggle.
      if (!modes || modes.some(function (m) { return m !== "onoff"; })) return { type: "dimmer" };
      return { type: "toggle" };
    }
    return { type: "toggle" };
  }

  // Caps at 4 discrete levels + Off regardless of the entity's actual
  // step count — plenty of on-screen choice without an unwieldy button
  // list for a fine-grained fan. The common 3-speed case keeps its
  // familiar Max/Med/Low naming; anything else gets percentage labels.
  function speedButtons(step) {
    var levels = Math.round(100 / (step || 100));
    if (!isFinite(levels) || levels < 1) levels = 1;
    if (levels > 4) levels = 4;
    var names = levels === 3 ? ["Max", "Med", "Low"] : null;
    var buttons = [];
    for (var i = 0; i < levels; i++) {
      var pct = Math.round(((levels - i) / levels) * 100);
      buttons.push({ pct: pct, label: names ? names[i] : pct + "%" });
    }
    buttons.push({ pct: 0, label: "Off" });
    return buttons;
  }

  function pctFromState(entityId, data) {
    var domain = entityId.split(".")[0];
    if (domain === "light") {
      if (data.state !== "on") return 0;
      var b = data.attributes && data.attributes.brightness;
      return b ? Math.round((b / 255) * 100) : 100;
    }
    if (domain === "fan") {
      if (data.state !== "on") return 0;
      return Math.round((data.attributes && data.attributes.percentage) || 0);
    }
    return null;
  }

  /* ---------- card grid ---------- */

  var cardGrid = document.getElementById("cardGrid");

  function cardMarkup(slot) {
    return (
      Icons.svg(slot.icon) +
      '<span class="card-name">' + slot.label + "</span>" +
      '<span class="card-state" id="state-' + slot.id + '">…</span>'
    );
  }

  function renderGrid() {
    cardGrid.style.setProperty("--cols", layoutDef.cols);
    cardGrid.style.setProperty("--rows", layoutDef.rows);
    cardGrid.innerHTML = "";
    visibleSlots().forEach(function (slot) {
      var card = document.createElement("button");
      card.className = "control-card";
      card.type = "button";
      card.innerHTML = cardMarkup(slot);
      card.addEventListener("click", function () { onCardTap(slot); });
      cardGrid.appendChild(card);
    });
  }

  function refreshCard(slot) {
    var stateEl = document.getElementById("state-" + slot.id);
    if (!slot.entity) {
      slot._controlType = "unset";
      if (stateEl) stateEl.textContent = "Not set";
      return Promise.resolve();
    }
    return HAClient.getState(slot.entity).then(function (res) {
      if (!res.ok) {
        slot._controlType = "toggle";
        if (stateEl) stateEl.textContent = "Unavailable";
        return;
      }
      var info = controlTypeForState(slot.entity, res.data);
      slot._controlType = info.type;
      slot._step = info.step;
      var pct = pctFromState(slot.entity, res.data);
      slot._pct = pct || 0;
      var label;
      if (pct !== null) label = pct > 0 ? pct + "%" : "Off";
      else label = res.data.state === "on" ? "On" : "Off";
      if (stateEl) stateEl.textContent = label;
    });
  }

  function refreshAllCards() {
    visibleSlots().forEach(refreshCard);
  }

  function onCardTap(slot) {
    if (!slot.entity) { window.location.href = "customize-lighting.html"; return; }
    if (slot._controlType === "dimmer") openDimmer(slot);
    else if (slot._controlType === "fan-speed") openSpeed(slot);
    else toggleDirect(slot);
  }

  function toggleDirect(slot) {
    HAClient.activateEntity(slot.entity, "toggle").then(function () { refreshCard(slot); });
  }

  /* ---------- dimmer popup (generalized off any slot, not fixed IDs) ---------- */

  var lightBackdrop = document.getElementById("lightBackdrop");
  var lightDialogTitle = document.getElementById("lightDialogTitle");
  var brightnessTrack = document.getElementById("brightnessTrack");
  var brightnessFill = document.getElementById("brightnessFill");
  var brightnessThumb = document.getElementById("brightnessThumb");
  var brightnessValue = document.getElementById("brightnessValue");
  var currentSlot = null;

  function renderBrightness(pct) {
    brightnessFill.style.height = pct + "%";
    brightnessThumb.style.bottom = pct + "%";
    brightnessValue.textContent = pct + "%";
  }

  function sendBrightness(slot, pct) {
    if (pct <= 0) {
      HAClient.callService("light", "turn_off", { entity_id: slot.entity });
    } else {
      HAClient.callService("light", "turn_on", { entity_id: slot.entity, brightness_pct: pct });
    }
  }

  function setBrightnessFromEvent(evt) {
    var rect = brightnessTrack.getBoundingClientRect();
    var y = evt.clientY - rect.top;
    var pct = Math.round(100 - (y / rect.height) * 100);
    pct = Math.max(0, Math.min(100, pct));
    currentSlot._pct = pct;
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
    if (draggingSlider) sendBrightness(currentSlot, currentSlot._pct);
    draggingSlider = false;
  });

  document.getElementById("lightOnBtn").addEventListener("click", function () {
    currentSlot._pct = currentSlot._pct > 0 ? currentSlot._pct : 100;
    renderBrightness(currentSlot._pct);
    sendBrightness(currentSlot, currentSlot._pct);
  });
  document.getElementById("lightOffBtn").addEventListener("click", function () {
    currentSlot._pct = 0;
    renderBrightness(0);
    sendBrightness(currentSlot, 0);
  });

  function openDimmer(slot) {
    currentSlot = slot;
    lightDialogTitle.textContent = slot.label;
    renderBrightness(slot._pct || 0);
    lightBackdrop.classList.add("is-open");
  }

  function closeDimmer() {
    lightBackdrop.classList.remove("is-open");
    if (currentSlot) refreshCard(currentSlot);
  }

  document.getElementById("lightDoneBtn").addEventListener("click", closeDimmer);
  lightBackdrop.addEventListener("click", function (evt) {
    if (evt.target === lightBackdrop) closeDimmer();
  });

  /* ---------- fan-speed popup (button list generated per entity) ---------- */

  var speedBackdrop = document.getElementById("speedBackdrop");
  var speedDialogTitle = document.getElementById("speedDialogTitle");
  var speedButtonList = document.getElementById("speedButtonList");

  function openSpeed(slot) {
    currentSlot = slot;
    speedDialogTitle.textContent = slot.label;
    speedButtonList.innerHTML = "";
    speedButtons(slot._step).forEach(function (b) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "fan-btn" + (Math.round(slot._pct || 0) === b.pct ? " is-selected" : "");
      btn.textContent = b.label;
      btn.addEventListener("click", function () {
        speedBackdrop.classList.remove("is-open");
        if (b.pct <= 0) {
          HAClient.callService("fan", "turn_off", { entity_id: slot.entity }).then(function () { refreshCard(slot); });
        } else {
          HAClient.callService("fan", "set_percentage", { entity_id: slot.entity, percentage: b.pct }).then(function () { refreshCard(slot); });
        }
      });
      speedButtonList.appendChild(btn);
    });
    speedBackdrop.classList.add("is-open");
  }

  speedBackdrop.addEventListener("click", function (evt) {
    if (evt.target === speedBackdrop) speedBackdrop.classList.remove("is-open");
  });

  renderGrid();
  refreshAllCards();
})();
