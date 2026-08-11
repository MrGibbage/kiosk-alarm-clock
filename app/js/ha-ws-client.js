/* Home Assistant WebSocket API client — needed because HA dropped the
   legacy per-domain REST Config API ("/api/config/<domain>/config/<id>")
   that this app was originally built against (confirmed via live 404s on
   2026-08-11). Structured/complex helpers like `schedule` are created and
   edited through dedicated WebSocket commands instead
   (schedule/create, schedule/update, schedule/delete — the same commands
   HA's own frontend Helpers UI uses). WebSocket connections aren't subject
   to the browser's CORS/Same-Origin restrictions the way fetch() is, so
   this sidesteps the earlier CORS work entirely for these calls. */

var HAWebSocket = (function () {
  "use strict";

  var socket = null;
  var connectPromise = null;
  var nextId = 1;
  var pending = {};

  function wsUrl(cfg) {
    var base = (cfg.haBaseUrl || "").replace(/\/+$/, "");
    return base.replace(/^http/i, "ws") + "/api/websocket";
  }

  function reset() {
    socket = null;
    connectPromise = null;
    Object.keys(pending).forEach(function (id) {
      pending[id].reject(new Error("WebSocket closed before a response arrived"));
      delete pending[id];
    });
  }

  function connect(cfg) {
    if (connectPromise) return connectPromise;

    connectPromise = new Promise(function (resolve, reject) {
      var ws;
      try {
        ws = new WebSocket(wsUrl(cfg));
      } catch (e) {
        connectPromise = null;
        reject(e);
        return;
      }

      ws.addEventListener("message", function (evt) {
        var msg;
        try { msg = JSON.parse(evt.data); } catch (e) { return; }

        if (msg.type === "auth_required") {
          ws.send(JSON.stringify({ type: "auth", access_token: cfg.haToken }));
        } else if (msg.type === "auth_ok") {
          socket = ws;
          resolve(ws);
        } else if (msg.type === "auth_invalid") {
          connectPromise = null;
          reject(new Error("WebSocket auth failed: " + (msg.message || "invalid token")));
          ws.close();
        } else if (msg.type === "result" && pending[msg.id]) {
          var p = pending[msg.id];
          delete pending[msg.id];
          if (msg.success) {
            p.resolve(msg.result);
          } else {
            var err = msg.error || {};
            p.reject(new Error((err.code ? "[" + err.code + "] " : "") + (err.message || "WebSocket command failed")));
          }
        }
      });

      ws.addEventListener("close", reset);
      ws.addEventListener("error", function () {
        var err = new Error("WebSocket connection error");
        connectPromise = null;
        reject(err);
      });
    });

    return connectPromise;
  }

  // Sends {id, type, ...payload} and resolves with the "result" payload,
  // or rejects with an Error carrying HA's own error message/code.
  function call(cfg, type, payload) {
    return connect(cfg).then(function (ws) {
      return new Promise(function (resolve, reject) {
        var id = nextId++;
        pending[id] = { resolve: resolve, reject: reject };
        var msg = { id: id, type: type };
        if (payload) {
          Object.keys(payload).forEach(function (k) { msg[k] = payload[k]; });
        }
        ws.send(JSON.stringify(msg));
      });
    });
  }

  return { call: call };
})();
