/* Thin wrapper around Home Assistant's REST API. No dependencies, no build
   step — loaded as a plain <script> before each screen's own script.
   Reads connection config (base URL + long-lived token) from config-store.js. */

var HAClient = (function () {
  "use strict";

  // Every method below takes an optional trailing `cfg` argument — pass an
  // explicit {haBaseUrl, haToken} to check *unsaved* form values (as
  // settings.html does) instead of whatever's currently persisted. Omit it
  // for the normal case of using the saved config.
  function base(cfg) {
    cfg = cfg || ConfigStore.load();
    return (cfg.haBaseUrl || "").replace(/\/+$/, "");
  }

  function headers(cfg) {
    cfg = cfg || ConfigStore.load();
    return {
      "Authorization": "Bearer " + (cfg.haToken || ""),
      "Content-Type": "application/json"
    };
  }

  function request(method, path, body, cfg) {
    var url = base(cfg) + path;
    return fetch(url, {
      method: method,
      headers: headers(cfg),
      body: body !== undefined ? JSON.stringify(body) : undefined
    }).then(function (resp) {
      if (resp.status === 204) return { ok: true, status: 204, data: null };
      return resp.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
        if (!resp.ok) return { ok: false, status: resp.status, data: data };
        return { ok: true, status: resp.status, data: data };
      });
    }).catch(function (err) {
      return { ok: false, status: 0, data: null, error: err.message || String(err) };
    });
  }

  return {
    // Connection health — cheapest possible authenticated call.
    ping: function (cfg) {
      return request("GET", "/api/", undefined, cfg);
    },

    getState: function (entityId, cfg) {
      return request("GET", "/api/states/" + encodeURIComponent(entityId), undefined, cfg);
    },

    getStates: function () {
      return request("GET", "/api/states");
    },

    callService: function (domain, service, data) {
      return request("POST", "/api/services/" + domain + "/" + service, data || {});
    },

    // Helper (schedule / input_boolean / input_datetime / timer / ...) CRUD.
    // Requires an admin-scoped token — see README "Secrets" section.
    getHelperConfig: function (domain, objectId) {
      return request("GET", "/api/config/" + domain + "/config/" + encodeURIComponent(objectId));
    },

    upsertHelperConfig: function (domain, objectId, payload) {
      return request("POST", "/api/config/" + domain + "/config/" + encodeURIComponent(objectId), payload);
    },

    deleteHelperConfig: function (domain, objectId) {
      return request("DELETE", "/api/config/" + domain + "/config/" + encodeURIComponent(objectId));
    },

    // Calls entity's most natural "activate" service based on its domain
    // prefix, so main-screen tiles can stay generic instead of hardcoding
    // per-tile logic. `mode` is "toggle" (default) or "on"/"off".
    activateEntity: function (entityId, mode) {
      var domain = entityId.split(".")[0];
      var data = { entity_id: entityId };
      if (domain === "script") return this.callService("script", "turn_on", data);
      if (domain === "scene") return this.callService("scene", "turn_on", data);
      if (mode === "on") return this.callService(domain, "turn_on", data);
      if (mode === "off") return this.callService(domain, "turn_off", data);
      return this.callService(domain, "toggle", data);
    }
  };
})();
