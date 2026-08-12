(function () {
  "use strict";

  if (!ConfigStore.isConfigured()) {
    window.location.href = "settings.html";
    return;
  }

  var buttonBar = document.getElementById("buttonBar");
  var saveStatus = document.getElementById("saveStatus");
  var slots = ConfigStore.loadButtons();
  var haEntities = []; // populated from HA once on load; [{id, name, sub, icon}]
  var haLoadError = null;

  function persist() {
    ConfigStore.saveButtons(slots);
    saveStatus.textContent = "Saved";
    clearTimeout(persist._t);
    persist._t = setTimeout(function () { saveStatus.textContent = ""; }, 1500);
  }

  function tileMarkup(slot) {
    return (
      '<button class="grip" type="button" aria-label="Drag to reorder">' +
        '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="6" r="1.4"></circle><circle cx="16" cy="6" r="1.4"></circle><circle cx="8" cy="12" r="1.4"></circle><circle cx="16" cy="12" r="1.4"></circle><circle cx="8" cy="18" r="1.4"></circle><circle cx="16" cy="18" r="1.4"></circle></svg>' +
      "</button>" +
      '<button class="tile" type="button">' +
        Icons.svg(slot.icon) +
        "<span>" + slot.label + "</span>" +
      "</button>" +
      '<span class="badge-ha">' + (slot.type === "app" ? "Alarm Clock" : "Home Assistant") + "</span>"
    );
  }

  function renderTile(slot) {
    var el = document.createElement("div");
    el.className = "config-tile";
    el.dataset.id = slot.id;
    el.innerHTML = tileMarkup(slot);
    el.querySelector(".tile").addEventListener("click", function () { openConfig(slot.id); });
    wireDrag(el);
    return el;
  }

  function renderAll() {
    buttonBar.innerHTML = "";
    slots.forEach(function (slot) { buttonBar.appendChild(renderTile(slot)); });
  }

  function updateTileContent(id) {
    var slot = slots.filter(function (s) { return s.id === id; })[0];
    var el = buttonBar.querySelector('.config-tile[data-id="' + id + '"]');
    if (!slot || !el) return;
    el.innerHTML = tileMarkup(slot);
    el.querySelector(".tile").addEventListener("click", function () { openConfig(slot.id); });
    wireDrag(el);
  }

  /* ---------- drag to reorder ---------- */
  /* Moves the actual DOM node (rather than re-rendering) so a pointer
     capture started on the grip survives the reorder; slots is resynced
     from final DOM order on release, then persisted. */

  function wireDrag(tileEl) {
    var grip = tileEl.querySelector(".grip");
    var dragging = false;

    grip.addEventListener("pointerdown", function (evt) {
      dragging = true;
      tileEl.classList.add("is-dragging");
      grip.setPointerCapture(evt.pointerId);
    });

    grip.addEventListener("pointermove", function (evt) {
      if (!dragging) return;
      var siblings = Array.prototype.slice.call(buttonBar.children).filter(function (c) { return c !== tileEl; });
      var x = evt.clientX;
      for (var i = 0; i < siblings.length; i++) {
        var rect = siblings[i].getBoundingClientRect();
        var mid = rect.left + rect.width / 2;
        if (x < mid) {
          buttonBar.insertBefore(tileEl, siblings[i]);
          return;
        }
      }
      buttonBar.appendChild(tileEl);
    });

    function endDrag() {
      if (!dragging) return;
      dragging = false;
      tileEl.classList.remove("is-dragging");
      var order = Array.prototype.slice.call(buttonBar.children).map(function (c) { return parseInt(c.dataset.id, 10); });
      slots.sort(function (a, b) { return order.indexOf(a.id) - order.indexOf(b.id); });
      persist();
    }

    grip.addEventListener("pointerup", endDrag);
    grip.addEventListener("pointercancel", endDrag);
  }

  /* ---------- config dialog ---------- */

  var backdrop = document.getElementById("configBackdrop");
  var iconGrid = document.getElementById("iconGrid");
  var labelInput = document.getElementById("labelInput");
  var actionTypeToggle = document.getElementById("actionTypeToggle");
  var appActionField = document.getElementById("appActionField");
  var haActionField = document.getElementById("haActionField");
  var appActionList = document.getElementById("appActionList");
  var haActionList = document.getElementById("haActionList");
  var haSearch = document.getElementById("haSearch");
  var selectedSummary = document.getElementById("selectedSummary");

  var editing = null; // draft copy: { id, icon, label, type, action }

  Object.keys(Icons.ICONS).forEach(function (id) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "icon-swatch";
    btn.dataset.icon = id;
    btn.innerHTML = Icons.svg(id);
    btn.addEventListener("click", function () {
      editing.icon = id;
      renderIconGrid();
      updateSummary();
    });
    iconGrid.appendChild(btn);
  });

  function renderIconGrid() {
    Array.prototype.slice.call(iconGrid.children).forEach(function (btn) {
      btn.classList.toggle("is-selected", btn.dataset.icon === editing.icon);
    });
  }

  function renderAppActionList() {
    appActionList.innerHTML = "";
    Icons.APP_ACTIONS.forEach(function (a) {
      var row = document.createElement("button");
      row.type = "button";
      row.className = "option-row" + (editing.type === "app" && editing.action === a.id ? " is-selected" : "");
      row.innerHTML =
        Icons.svg(a.icon) +
        '<span class="option-text"><span class="option-name">' + a.name + "</span></span>" +
        '<svg class="option-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"></path></svg>';
      row.addEventListener("click", function () {
        editing.type = "app";
        editing.action = a.id;
        renderAppActionList();
        updateSummary();
      });
      appActionList.appendChild(row);
    });
  }

  function renderHaActionList() {
    haActionList.innerHTML = "";
    if (haLoadError) {
      haActionList.innerHTML = '<p class="option-empty">Couldn’t load entities: ' + haLoadError + "</p>";
      return;
    }
    var q = haSearch.value.trim().toLowerCase();
    var matches = HAEntities().filter(function (a) {
      return !q || a.name.toLowerCase().indexOf(q) !== -1 || a.sub.toLowerCase().indexOf(q) !== -1;
    });
    if (!matches.length) {
      haActionList.innerHTML = '<p class="option-empty">' + (haEntities.length ? "No matches" : "Loading…") + "</p>";
      return;
    }
    matches.slice(0, 80).forEach(function (a) {
      var row = document.createElement("button");
      row.type = "button";
      row.className = "option-row" + (editing.type === "ha" && editing.action === a.id ? " is-selected" : "");
      row.innerHTML =
        Icons.svg(a.icon) +
        '<span class="option-text"><span class="option-name">' + a.name + '</span><span class="option-sub">' + a.sub + "</span></span>" +
        '<svg class="option-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"></path></svg>';
      row.addEventListener("click", function () {
        editing.type = "ha";
        editing.action = a.id;
        renderHaActionList();
        updateSummary();
      });
      haActionList.appendChild(row);
    });
  }

  function HAEntities() { return haEntities; }

  haSearch.addEventListener("input", renderHaActionList);

  Array.prototype.slice.call(actionTypeToggle.querySelectorAll("button")).forEach(function (btn) {
    btn.addEventListener("click", function () { setActionType(btn.dataset.type); });
  });

  function setActionType(type) {
    appActionField.hidden = type !== "app";
    haActionField.hidden = type !== "ha";
    Array.prototype.slice.call(actionTypeToggle.querySelectorAll("button")).forEach(function (btn) {
      btn.classList.toggle("is-active", btn.dataset.type === type);
    });
  }

  function updateSummary() {
    var name;
    if (editing.type === "app") {
      var appA = Icons.findAppAction(editing.action);
      name = appA && appA.name;
    } else {
      var haA = haEntities.filter(function (a) { return a.id === editing.action; })[0];
      name = (haA && haA.name) || (editing.action || "");
    }
    selectedSummary.innerHTML = "Selected action: <strong>" + (name || "none") + "</strong>";
  }

  function openConfig(id) {
    var slot = slots.filter(function (s) { return s.id === id; })[0];
    if (!slot) return;
    editing = { id: slot.id, icon: slot.icon, label: slot.label, type: slot.type, action: slot.action };

    labelInput.value = editing.label;
    renderIconGrid();
    setActionType(editing.type);
    haSearch.value = "";
    renderAppActionList();
    renderHaActionList();
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
    var slot = slots.filter(function (s) { return s.id === editing.id; })[0];
    if (!slot) return;
    slot.icon = editing.icon;
    slot.label = labelInput.value.trim() || "Button";
    slot.type = editing.type;
    slot.action = editing.action;
    updateTileContent(slot.id);
    persist();
    closeConfig();
  });

  document.getElementById("backBtn").addEventListener("click", function () {
    window.location.href = "index.html";
  });

  /* ---------- load real HA entities for the search picker ---------- */

  HAClient.getStates().then(function (res) {
    if (!res.ok || !Array.isArray(res.data)) {
      haLoadError = res.error || ("HTTP " + res.status);
      if (editing) renderHaActionList();
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
    if (editing) renderHaActionList();
  });

  renderAll();
})();
