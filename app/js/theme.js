/* Day/night theme, shared by every screen. Loaded in <head> (right after
   css/tokens.css) rather than with the other scripts at the end of
   <body>, so the last-known theme is applied before first paint — no
   flash of the wrong palette while waiting on HA.

   Source of truth is input_boolean.kiosk_alarm_night_mode in HA, flipped
   at sunset/sunrise by kiosk_night_mode.yaml (see README "Day/night
   theme"). Polled every 30s. Anything that changes the theme (main.js's
   sun/moon button) writes that same boolean and then calls
   Theme.refresh(), so a manual tap and the next poll never fight.

   Until 2026-10-04 this lived only in main.js, so every other screen
   fell back to the browser's prefers-color-scheme instead. */

var Theme = (function () {
  "use strict";

  var CACHE_KEY = "kioskAlarmClock.theme.v1";
  var root = document.documentElement;

  function apply(isNight) {
    var theme = isNight ? "dark" : "light";
    root.setAttribute("data-theme", theme);
    try { localStorage.setItem(CACHE_KEY, theme); } catch (e) { /* storage unavailable — fine */ }
  }

  // Before first paint: reuse whatever HA said last time. If nothing is
  // cached yet, tokens.css falls back to prefers-color-scheme as before.
  try {
    var cached = localStorage.getItem(CACHE_KEY);
    if (cached === "dark" || cached === "light") root.setAttribute("data-theme", cached);
  } catch (e) { /* storage unavailable — fine */ }

  // ConfigStore/HAClient load at the end of <body>, so they don't exist
  // yet when this runs in <head>; guard every call on them.
  function ready() {
    return typeof ConfigStore !== "undefined" && typeof HAClient !== "undefined" && ConfigStore.isConfigured();
  }

  function refresh() {
    if (!ready()) return Promise.resolve();
    return HAClient.getState(ConfigStore.FIXED.nightMode).then(function (res) {
      if (res.ok && res.data) apply(res.data.state === "on");
    });
  }

  function isNight() {
    return root.getAttribute("data-theme") === "dark";
  }

  // Writes the HA boolean (the source of truth) rather than data-theme
  // directly, then re-reads it.
  function toggle() {
    if (!ready()) return Promise.resolve();
    return HAClient.callService("input_boolean", isNight() ? "turn_off" : "turn_on",
      { entity_id: ConfigStore.FIXED.nightMode }).then(refresh);
  }

  // DOMContentLoaded fires after every synchronous <script> in <body> has
  // run, so ConfigStore/HAClient are defined by then.
  document.addEventListener("DOMContentLoaded", function () {
    refresh();
    setInterval(refresh, 30000);
  });

  return { refresh: refresh, toggle: toggle, isNight: isNight };
})();
