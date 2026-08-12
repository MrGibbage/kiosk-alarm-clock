/* Persists connection + entity-ID settings in localStorage — the only
   durable, writable storage available to a static-file app with no backend
   (see README "Architecture"). One dedicated kiosk device, so localStorage
   living in that one browser is an acceptable single point of storage. */

var ConfigStore = (function () {
  "use strict";

  var STORAGE_KEY = "kioskAlarmClock.config.v1";

  // Field definitions drive both settings.html's form and each screen's
  // lookups. `default` values come from entities confirmed to exist in HA
  // during scaffolding (2026-08-10) — still user-editable/validatable since
  // some (fan/fan-light) were ambiguous duplicates at scaffold time.
  var FIELDS = [
    { key: "haBaseUrl", group: "Connection", label: "Home Assistant URL", placeholder: "http://192.168.0.87:8123", default: "" },
    { key: "haToken", group: "Connection", label: "Long-lived access token", placeholder: "eyJhbGciOi...", default: "", secret: true },
    { key: "entityFan", group: "Lighting & Control", label: "Ceiling Fan entity", placeholder: "fan.ceiling_fan", default: "" },
    { key: "entitySkipLight", group: "Lighting & Control", label: "Skip's Light entity", placeholder: "light.master_bedroom_skip_nightstand", default: "light.master_bedroom_skip_nightstand" },
    { key: "entitySuzanneLight", group: "Lighting & Control", label: "Suzanne's Light entity", placeholder: "light.master_bedroom_suzanne_nightstand", default: "light.master_bedroom_suzanne_nightstand" }
  ];

  function defaults() {
    var out = {};
    FIELDS.forEach(function (f) { out[f.key] = f.default; });
    return out;
  }

  function load() {
    var raw = localStorage.getItem(STORAGE_KEY);
    var out = defaults();
    if (!raw) return out;
    try {
      var parsed = JSON.parse(raw);
      Object.keys(parsed).forEach(function (k) { out[k] = parsed[k]; });
    } catch (e) { /* corrupt value — fall back to defaults */ }
    return out;
  }

  function save(cfg) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  }

  // Merges one or more fields into whatever's already persisted, rather
  // than replacing the whole config — so a single validated field can be
  // saved immediately without waiting on the rest of the form.
  function saveFields(partial) {
    var cfg = load();
    Object.keys(partial).forEach(function (k) { cfg[k] = partial[k]; });
    save(cfg);
    return cfg;
  }

  function isConfigured() {
    var cfg = load();
    return !!(cfg.haBaseUrl && cfg.haToken);
  }

  // Live-validates one entity ID against HA. Pass `cfg` to check against
  // unsaved form values instead of the persisted config (see settings.html).
  // Resolves to { ok: true, friendlyName } or { ok: false, error }.
  function validateEntity(entityId, cfg) {
    if (!entityId) return Promise.resolve({ ok: false, error: "empty" });
    return HAClient.getState(entityId, cfg).then(function (res) {
      if (!res.ok) {
        return { ok: false, error: res.status === 404 ? "not found" : (res.error || "HA error " + res.status) };
      }
      return { ok: true, friendlyName: (res.data.attributes && res.data.attributes.friendly_name) || entityId };
    });
  }

  // Entity IDs created by the scaffolding itself (fixed names, not
  // user-configurable — see plan's "HA-side reality check").
  var FIXED = {
    skipUntil: "input_datetime.kiosk_alarm_skip_until",
    ringing: "input_boolean.kiosk_alarm_ringing",
    ringingSource: "input_text.kiosk_alarm_ringing_source",
    snoozeTimer: "timer.kiosk_alarm_snooze",
    occupancyEntities: "input_text.kiosk_alarm_occupancy_entities"
  };

  // Per-alarm sound selection — see README's "local config file" decision.
  // The sound *manifest* (js/sounds.json) is a static file; which sound each
  // alarm uses is stored here, keyed by the alarm's schedule entity_id.
  var SOUND_MAP_KEY = "kioskAlarmClock.alarmSounds.v1";

  function loadSoundMap() {
    try { return JSON.parse(localStorage.getItem(SOUND_MAP_KEY)) || {}; } catch (e) { return {}; }
  }

  function getAlarmSound(entityId, fallback) {
    return loadSoundMap()[entityId] || fallback || "chimes";
  }

  function setAlarmSound(entityId, soundId) {
    var map = loadSoundMap();
    map[entityId] = soundId;
    localStorage.setItem(SOUND_MAP_KEY, JSON.stringify(map));
  }

  function removeAlarmSound(entityId) {
    var map = loadSoundMap();
    delete map[entityId];
    localStorage.setItem(SOUND_MAP_KEY, JSON.stringify(map));
  }

  // Which schedule/input_boolean pairs are "our" alarms. The old REST
  // Config API let us pick the object_id ourselves (e.g. kiosk_alarm_3),
  // so prefix-matching entity_ids was enough to find them. HA's WebSocket
  // create commands generate their own id instead, so identity has to be
  // tracked explicitly here rather than inferred from naming.
  var MANAGED_ALARMS_KEY = "kioskAlarmClock.managedAlarms.v1";

  function listManagedAlarms() {
    try { return JSON.parse(localStorage.getItem(MANAGED_ALARMS_KEY)) || []; } catch (e) { return []; }
  }

  function addManagedAlarm(scheduleId, boolId) {
    var list = listManagedAlarms();
    list.push({ scheduleId: scheduleId, boolId: boolId });
    localStorage.setItem(MANAGED_ALARMS_KEY, JSON.stringify(list));
  }

  function removeManagedAlarm(scheduleId) {
    var list = listManagedAlarms().filter(function (a) { return a.scheduleId !== scheduleId; });
    localStorage.setItem(MANAGED_ALARMS_KEY, JSON.stringify(list));
  }

  // Main-screen button bar — order + icon + label + action per slot. See
  // the button-config-screen mockup (2026-08-12) this implements. Fixed
  // at 6 slots (README's confirmed ceiling for a 10" screen) — reordering
  // and reconfiguring existing slots, not adding/removing them.
  var BUTTON_CONFIG_KEY = "kioskAlarmClock.buttonConfig.v1";

  // One-time migration seed: carries forward whatever was already set in
  // the old fixed entityCeilingLight/entityGoodNight/entityBathroom
  // fields (still readable via load() even though FIELDS no longer lists
  // them — load() merges raw storage over defaults, so legacy keys still
  // already in storage pass through), so upgrading doesn't blank out a
  // working setup.
  function defaultButtons() {
    var cfg = load();
    return [
      { id: 1, icon: "lighting", label: "Lighting", type: "app", action: "open_lighting" },
      { id: 2, icon: "bulb", label: "Ceiling Light", type: "ha", action: cfg.entityCeilingLight || "" },
      { id: 3, icon: "moon", label: "Good Night", type: "ha", action: cfg.entityGoodNight || "script.bedtime" },
      { id: 4, icon: "bathroom", label: "Bathroom", type: "ha", action: cfg.entityBathroom || "light.master_bath_vanity" },
      { id: 5, icon: "skip", label: "Skip Tonight", type: "app", action: "skip_tonight" },
      { id: 6, icon: "alarm", label: "Snooze", type: "app", action: "snooze" }
    ];
  }

  function loadButtons() {
    var raw = localStorage.getItem(BUTTON_CONFIG_KEY);
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      } catch (e) { /* corrupt — fall through to reseed */ }
    }
    var seeded = defaultButtons();
    saveButtons(seeded);
    return seeded;
  }

  function saveButtons(list) {
    localStorage.setItem(BUTTON_CONFIG_KEY, JSON.stringify(list));
  }

  // Occupancy detection — up to 2 entities, OR'd ("occupied if either is
  // on"). Each slot is either null (unset) or {id, name}. The automation
  // that actually makes the skip decision can't read the browser's
  // localStorage, so every change here also gets pushed to
  // FIXED.occupancyEntities (a comma-separated input_text) — see
  // settings.html's picker for where that push happens.
  var OCCUPANCY_KEY = "kioskAlarmClock.occupancyEntities.v1";

  // Seeded from the one entity that was hardcoded in the automation
  // before this was configurable, so upgrading doesn't silently disable
  // the occupancy check that was already working.
  function defaultOccupancyEntities() {
    return [
      { id: "binary_sensor.bedroom_occupancy", name: "Master Bedroom Occupancy" },
      null
    ];
  }

  function loadOccupancyEntities() {
    var raw = localStorage.getItem(OCCUPANCY_KEY);
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length === 2) return parsed;
      } catch (e) { /* corrupt — fall through to reseed */ }
    }
    var seeded = defaultOccupancyEntities();
    saveOccupancyEntities(seeded);
    return seeded;
  }

  function saveOccupancyEntities(list) {
    localStorage.setItem(OCCUPANCY_KEY, JSON.stringify(list));
  }

  return {
    FIELDS: FIELDS,
    FIXED: FIXED,
    load: load,
    save: save,
    saveFields: saveFields,
    isConfigured: isConfigured,
    validateEntity: validateEntity,
    getAlarmSound: getAlarmSound,
    setAlarmSound: setAlarmSound,
    removeAlarmSound: removeAlarmSound,
    listManagedAlarms: listManagedAlarms,
    addManagedAlarm: addManagedAlarm,
    removeManagedAlarm: removeManagedAlarm,
    loadButtons: loadButtons,
    saveButtons: saveButtons,
    loadOccupancyEntities: loadOccupancyEntities,
    saveOccupancyEntities: saveOccupancyEntities
  };
})();
