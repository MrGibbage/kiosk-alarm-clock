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
    { key: "entityCeilingLight", group: "Main screen tiles", label: "Ceiling Light entity", placeholder: "light.master_bedroom_fan_light", default: "" },
    { key: "entityGoodNight", group: "Main screen tiles", label: "Good Night entity", placeholder: "script.bedtime", default: "script.bedtime" },
    { key: "entityBathroom", group: "Main screen tiles", label: "Bathroom entity", placeholder: "light.master_bath_vanity", default: "light.master_bath_vanity" },
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
    snoozeTimer: "timer.kiosk_alarm_snooze"
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
    removeManagedAlarm: removeManagedAlarm
  };
})();
