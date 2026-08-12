(function () {
  "use strict";

  if (!ConfigStore.isConfigured()) {
    window.location.href = "settings.html";
    return;
  }

  var cardBar = document.getElementById("cardBar");
  var saveStatus = document.getElementById("saveStatus");
  var allSlots = ConfigStore.loadLightingCards(); // always 6, only some shown
  var layout = ConfigStore.loadLightingLayout();
  var haEntities = []; // populated from HA once on load; [{id, name, sub, icon}]
  var haLoadError = null;

  function layoutDef() { return ConfigStore.LIGHTING_LAYOUTS[layout]; }
  function visibleSlots() { return allSlots.slice(0, layoutDef().count); }
  function hiddenSlots() { return allSlots.slice(layoutDef().count); }

  function persist() {
    ConfigStore.saveLightingCards(allSlots);
    saveStatus.textContent = "Saved";
    clearTimeout(persist._t);
    persist._t = setTimeout(function () { saveStatus.textContent = ""; }, 1500);
  }

  /* ---------- layout picker ---------- */

  var layoutToggle = document.getElementById("layoutToggle");

  function renderLayoutToggle() {
    Array.prototype.slice.call(layoutToggle.querySelectorAll("button")).forEach(function (btn) {
      btn.classList.toggle("is-active", btn.dataset.layout === layout);
    });
  }

  Array.prototype.slice.call(layoutToggle.querySelectorAll("button")).forEach(function (btn) {
    btn.addEventListener("click", function () {
      layout = btn.dataset.layout;
      ConfigStore.saveLightingLayout(layout);
      renderLayoutToggle();
      renderAll();
    });
  });

  /* ---------- card grid ---------- */

  function tileMarkup(slot) {
    return (
      '<button class="grip" type="button" aria-label="Drag to reorder">' +
        '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="6" r="1.4"></circle><circle cx="16" cy="6" r="1.4"></circle><circle cx="8" cy="12" r="1.4"></circle><circle cx="16" cy="12" r="1.4"></circle><circle cx="8" cy="18" r="1.4"></circle><circle cx="16" cy="18" r="1.4"></circle></svg>' +
      "</button>" +
      '<button class="card-tile" type="button">' +
        Icons.svg(slot.icon) +
        "<span>" + slot.label + "</span>" +
      "</button>" +
      '<span class="badge-entity">' + (slot.entity || "Not set") + "</span>"
    );
  }

  function renderCard(slot) {
    var el = document.createElement("div");
    el.className = "config-card";
    el.dataset.id = slot.id;
    el.innerHTML = tileMarkup(slot);
    el.querySelector(".card-tile").addEventListener("click", function () { openConfig(slot.id); });
    wireDrag(el);
    return el;
  }

  function renderAll() {
    var def = layoutDef();
    cardBar.style.setProperty("--cols", def.cols);
    cardBar.style.setProperty("--rows", def.rows);
    cardBar.innerHTML = "";
    visibleSlots().forEach(function (slot) { cardBar.appendChild(renderCard(slot)); });
  }

  function updateCardContent(id) {
    var slot = allSlots.filter(function (s) { return s.id === id; })[0];
    var el = cardBar.querySelector('.config-card[data-id="' + id + '"]');
    if (!slot || !el) return;
    el.innerHTML = tileMarkup(slot);
    el.querySelector(".card-tile").addEventListener("click", function () { openConfig(slot.id); });
    wireDrag(el);
  }

  /* ---------- drag to reorder ---------- */
  /* Reorders only the visible subset — hidden slots (beyond the current
     layout's count) stay parked at the end untouched, same document-level
     pointer-listener pattern as Customize Buttons (see buttons.js). */

  function wireDrag(cardEl) {
    var grip = cardEl.querySelector(".grip");

    grip.addEventListener("pointerdown", function (evt) {
      evt.preventDefault();
      cardEl.classList.add("is-dragging");

      function onMove(e) {
        var siblings = Array.prototype.slice.call(cardBar.children).filter(function (c) { return c !== cardEl; });
        var x = e.clientX, y = e.clientY;
        for (var i = 0; i < siblings.length; i++) {
          var rect = siblings[i].getBoundingClientRect();
          var midX = rect.left + rect.width / 2;
          var midY = rect.top + rect.height / 2;
          if (y < midY || (y < rect.bottom && x < midX)) {
            cardBar.insertBefore(cardEl, siblings[i]);
            return;
          }
        }
        cardBar.appendChild(cardEl);
      }

      function onUp() {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
        cardEl.classList.remove("is-dragging");
        var order = Array.prototype.slice.call(cardBar.children).map(function (c) { return parseInt(c.dataset.id, 10); });
        var reordered = order.map(function (id) { return allSlots.filter(function (s) { return s.id === id; })[0]; });
        allSlots = reordered.concat(hiddenSlots());
        persist();
      }

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    });
  }

  /* ---------- config dialog ---------- */

  var backdrop = document.getElementById("configBackdrop");
  var iconGrid = document.getElementById("iconGrid");
  var labelInput = document.getElementById("labelInput");
  var entitySearch = document.getElementById("entitySearch");
  var entityList = document.getElementById("entityList");
  var selectedSummary = document.getElementById("selectedSummary");

  var editing = null; // draft copy: { id, icon, label, entity }

  Object.keys(Icons.ICONS).forEach(function (id) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "icon-swatch";
    btn.dataset.icon = id;
    btn.innerHTML = Icons.svg(id);
    btn.addEventListener("click", function () {
      editing.icon = id;
      renderIconGrid();
    });
    iconGrid.appendChild(btn);
  });

  function renderIconGrid() {
    Array.prototype.slice.call(iconGrid.children).forEach(function (btn) {
      btn.classList.toggle("is-selected", btn.dataset.icon === editing.icon);
    });
  }

  function renderEntityList() {
    entityList.innerHTML = "";
    if (haLoadError) {
      entityList.innerHTML = '<p class="option-empty">Couldn’t load entities: ' + haLoadError + "</p>";
      return;
    }
    var q = entitySearch.value.trim().toLowerCase();
    var matches = haEntities.filter(function (a) {
      return !q || a.name.toLowerCase().indexOf(q) !== -1 || a.sub.toLowerCase().indexOf(q) !== -1;
    });
    if (!matches.length) {
      entityList.innerHTML = '<p class="option-empty">' + (haEntities.length ? "No matches" : "Loading…") + "</p>";
      return;
    }
    matches.slice(0, 80).forEach(function (a) {
      var row = document.createElement("button");
      row.type = "button";
      row.className = "option-row" + (editing.entity === a.id ? " is-selected" : "");
      row.innerHTML =
        Icons.svg(a.icon) +
        '<span class="option-text"><span class="option-name">' + a.name + '</span><span class="option-sub">' + a.sub + "</span></span>" +
        '<svg class="option-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"></path></svg>';
      row.addEventListener("click", function () {
        editing.entity = a.id;
        renderEntityList();
        updateSummary();
      });
      entityList.appendChild(row);
    });
  }

  entitySearch.addEventListener("input", renderEntityList);

  document.getElementById("clearEntityBtn").addEventListener("click", function () {
    editing.entity = "";
    renderEntityList();
    updateSummary();
  });

  function updateSummary() {
    var haA = haEntities.filter(function (a) { return a.id === editing.entity; })[0];
    var name = (haA && haA.name) || editing.entity || "";
    selectedSummary.innerHTML = "Selected entity: <strong>" + (name || "none") + "</strong>";
  }

  function openConfig(id) {
    var slot = allSlots.filter(function (s) { return s.id === id; })[0];
    if (!slot) return;
    editing = { id: slot.id, icon: slot.icon, label: slot.label, entity: slot.entity };

    labelInput.value = editing.label;
    renderIconGrid();
    entitySearch.value = "";
    renderEntityList();
    updateSummary();

    backdrop.classList.add("is-open");
  }

  function closeConfig() {
    backdrop.classList.remove("is-open");
    editing = null;
  }

  document.getElementById("cancelConfigBtn").addEventListener("click", closeConfig);
  backdrop.addEventListener("click", function (evt) { if (evt.target === backdrop) closeConfig(); });

  document.getElementById("saveConfigBtn").addEventListener("click", function () {
    if (!editing) return;
    var slot = allSlots.filter(function (s) { return s.id === editing.id; })[0];
    if (!slot) return;
    slot.icon = editing.icon;
    slot.label = labelInput.value.trim() || "Light";
    slot.entity = editing.entity;
    updateCardContent(slot.id);
    persist();
    closeConfig();
  });

  document.getElementById("backBtn").addEventListener("click", function () {
    window.location.href = "settings.html";
  });

  /* ---------- load real HA entities for the search picker ---------- */

  HAClient.getStates().then(function (res) {
    if (!res.ok || !Array.isArray(res.data)) {
      haLoadError = res.error || ("HTTP " + res.status);
      if (editing) renderEntityList();
      return;
    }
    haEntities = res.data
      .filter(function (e) { return e.attributes && e.attributes.friendly_name; })
      .map(function (e) {
        return {
          id: e.entity_id,
          name: e.attributes.friendly_name,
          sub: e.entity_id,
          icon: Icons.iconForEntity(e.entity_id)
        };
      })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
    if (editing) renderEntityList();
  });

  renderLayoutToggle();
  renderAll();
})();
