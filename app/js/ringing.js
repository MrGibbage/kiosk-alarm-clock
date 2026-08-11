(function () {
  "use strict";

  if (!ConfigStore.isConfigured()) {
    window.location.href = "settings.html";
    return;
  }

  var FIXED = ConfigStore.FIXED;
  var labelEl = document.getElementById("ringingLabel");
  var timeEl = document.getElementById("ringingTime");
  var videoEl = document.getElementById("ringingVideo");
  var audioEl = document.getElementById("ringingAudio");
  var SOUNDS = [];

  function tick() {
    var now = new Date();
    var h = now.getHours();
    var meridiem = h >= 12 ? "PM" : "AM";
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    timeEl.textContent = h12 + ":" + String(now.getMinutes()).padStart(2, "0") + " " + meridiem;
  }
  tick();
  setInterval(tick, 1000);

  function stopMedia() {
    videoEl.pause(); videoEl.hidden = true; videoEl.removeAttribute("src"); videoEl.load();
    audioEl.pause(); audioEl.removeAttribute("src"); audioEl.load();
  }

  function playSound(soundId) {
    var sound = SOUNDS.filter(function (s) { return s.id === soundId; })[0];
    if (!sound) return;
    if (sound.type === "video") {
      videoEl.src = "media/" + sound.file;
      videoEl.hidden = false;
      videoEl.muted = false;
      // Relies on Fully Kiosk's setMediaPlaybackRequiresUserGesture(false)
      // (see README "Sound/video") — a plain desktop/mobile browser preview
      // may block this without a prior user tap.
      videoEl.play().catch(function () { /* blocked outside Fully Kiosk — ignore */ });
    } else {
      audioEl.src = "media/" + sound.file;
      audioEl.play().catch(function () { /* blocked outside Fully Kiosk — ignore */ });
    }
  }

  function returnToClock() {
    stopMedia();
    window.location.href = "index.html";
  }

  function loadRingingContext() {
    return HAClient.getState(FIXED.ringingSource).then(function (res) {
      var sourceEntity = res.ok && res.data ? res.data.state : null;
      if (!sourceEntity || sourceEntity === "unknown" || sourceEntity === "unavailable") {
        labelEl.textContent = "Alarm";
        return;
      }
      var objectId = sourceEntity.replace(/^schedule\./, "");
      HAClient.getHelperConfig("schedule", objectId).then(function (cfgRes) {
        labelEl.textContent = (cfgRes.ok && cfgRes.data.name) || "Alarm";
      });
      var soundId = ConfigStore.getAlarmSound(sourceEntity, SOUNDS[0] && SOUNDS[0].id);
      playSound(soundId);
    });
  }

  fetch("js/sounds.json").then(function (r) { return r.json(); }).then(function (data) {
    SOUNDS = data;
    // Confirm we're actually still meant to be ringing before loading
    // sound/label — a direct navigation here with nothing ringing (or a
    // dismiss that raced this page load) shouldn't start playing anything.
    HAClient.getState(FIXED.ringing).then(function (res) {
      if (res.ok && res.data && res.data.state === "on") {
        loadRingingContext();
      } else {
        returnToClock();
      }
    });
  });

  document.getElementById("snoozeBtn").addEventListener("click", function () {
    HAClient.callService("timer", "start", { entity_id: FIXED.snoozeTimer });
    HAClient.callService("input_boolean", "turn_off", { entity_id: FIXED.ringing });
    returnToClock();
  });

  document.getElementById("dismissBtn").addEventListener("click", function () {
    HAClient.callService("input_boolean", "turn_off", { entity_id: FIXED.ringing });
    HAClient.callService("timer", "cancel", { entity_id: FIXED.snoozeTimer });
    returnToClock();
  });

  // Safety net: if kiosk_alarm_ringing gets cleared from elsewhere (e.g. the
  // main-screen Snooze tile) while this screen is open, leave automatically.
  setInterval(function () {
    HAClient.getState(FIXED.ringing).then(function (res) {
      if (res.ok && res.data && res.data.state !== "on") returnToClock();
    });
  }, 5000);
})();
