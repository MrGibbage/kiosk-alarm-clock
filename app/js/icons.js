/* Shared icon library + fixed "alarm clock" action list — used by the
   main screen (rendering tiles) and the button-config screen (icon
   picker + preview). Same hand-drawn line-icon style as the rest of the
   app (viewBox 0 0 24, stroke currentColor). A few are the exact icons
   already used elsewhere in the app; the rest were added for the
   button-config icon picker. */

var Icons = (function () {
  "use strict";

  var ICONS = {
    lighting: '<circle cx="12" cy="12" r="1.6"></circle><path d="M12 12c0-4 2-7 5-7 1 2 0 5-5 7Z"></path><path d="M12 12c-4 1-7-1-7-4 2-2 5-1 7 4Z"></path><path d="M12 12c1 4-1 7-4 7-2-1-1-5 4-7Z"></path>',
    bulb: '<path d="M8 5h8"></path><path d="M9 5c0 3 1.5 4.5 3 4.5S15 8 15 5"></path><path d="M9.5 12.5 8 16M12 12.5v4M14.5 12.5 16 16"></path>',
    lamp: '<path d="M7 4h10l-3 6h3l-7 9 1.5-6.5H8L7 4Z"></path>',
    fan: '<circle cx="12" cy="12" r="1.5"></circle><path d="M12 12 12 4Q17 4 16.5 9Q16 12.5 12 12"></path><path d="M12 12 4.8 8.7Q3 12.7 7.3 14.8Q11 16.3 12 12"></path><path d="M12 12 17.8 18Q21 14.5 17.8 11.2Q14.5 9.3 12 12"></path>',
    moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z"></path>',
    bathroom: '<path d="M4 12h15a1 1 0 0 1 1 1 5 5 0 0 1-5 5H8a5 5 0 0 1-5-5v-1Z"></path><path d="M6 12V7a2 2 0 0 1 3-1.7"></path><path d="M4 20v-1M18 20v-1"></path>',
    skip: '<path d="M12 5a6 6 0 0 0-6 6c0 3.2-1 4.5-2 5.5h11"></path><path d="M17 8a6 6 0 0 1 1 3c0 3.2 1 4.5 2 5.5h-3M4 4l16 16"></path>',
    alarm: '<path d="M12 5a6 6 0 0 0-6 6c0 3.2-1 4.5-2 5.5h16c-1-1-2-2.3-2-5.5a6 6 0 0 0-6-6Z"></path><path d="M10.3 19.5a2 2 0 0 0 3.4 0"></path>',
    thermostat: '<circle cx="12" cy="14" r="4"></circle><path d="M12 14V5"></path><circle cx="12" cy="14" r="1.3" fill="currentColor"></circle>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="1.5"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path>',
    door: '<rect x="6" y="3" width="12" height="18" rx="1"></rect><circle cx="14.5" cy="12" r="0.8" fill="currentColor"></circle>',
    garage: '<path d="M4 20V9l8-5 8 5v11"></path><path d="M4 12h16M7 12v8M11 12v8M13 12v8M17 12v8"></path>',
    tv: '<rect x="3" y="5" width="18" height="12" rx="1.5"></rect><path d="M9 20h6M12 17v3"></path>',
    speaker: '<path d="M9 18V6l10-2v12"></path><circle cx="7" cy="18" r="2.2"></circle><circle cx="17" cy="16" r="2.2"></circle>',
    coffee: '<path d="M5 9h12v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V9Z"></path><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17"></path><path d="M8 4c0 1-1 1-1 2M12 4c0 1-1 1-1 2"></path>',
    blinds: '<rect x="4" y="4" width="16" height="16" rx="1"></rect><path d="M4 8h16M4 12h16M4 16h16"></path>',
    camera: '<rect x="3" y="7" width="18" height="13" rx="2"></rect><circle cx="12" cy="13.5" r="3.5"></circle><path d="M8 7l1.5-3h5L16 7"></path>',
    plug: '<path d="M9 3v6M15 3v6"></path><path d="M6 9h12v3a6 6 0 0 1-12 0V9Z"></path><path d="M12 18v3"></path>',
    droplet: '<path d="M12 3c4 5 7 8.5 7 12a7 7 0 0 1-14 0c0-3.5 3-7 7-12Z"></path>',
    sun: '<circle cx="12" cy="12" r="4.2"></circle><path d="M12 2.5v2.4M12 19.1v2.4M4.6 4.6l1.7 1.7M17.7 17.7l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.6 19.4l1.7-1.7M17.7 6.3l1.7-1.7"></path>',
    cloud: '<path d="M7 18a4 4 0 0 1-.5-8 5.5 5.5 0 0 1 10.7-1.6A4.5 4.5 0 0 1 17 18H7Z"></path>',
    star: '<path d="M12 3l2.6 5.6 6.1.6-4.6 4.1 1.3 6-5.4-3.2-5.4 3.2 1.3-6-4.6-4.1 6.1-.6L12 3Z"></path>',
    heart: '<path d="M12 20s-7-4.4-9.5-8.8C.8 8 2 4.5 5.5 4c2-.3 3.7.7 4.5 2.2C10.8 4.7 12.5 3.7 14.5 4c3.5.5 4.7 4 3 7.2C19 15.6 12 20 12 20Z"></path>',
    home: '<path d="M4 11 12 4l8 7"></path><path d="M6 10v8a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-8"></path>',
    gear: '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"></path>'
  };

  function svg(id, cls) {
    var inner = ICONS[id] || ICONS.star;
    return '<svg class="' + (cls || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + inner + "</svg>";
  }

  // Actions that only make sense inside this app (navigate a screen, or
  // touch the app's own HA helpers) as opposed to a general HA entity.
  var APP_ACTIONS = [
    { id: "open_lighting", name: "Open Lighting Screen", icon: "lighting" },
    { id: "open_alarms", name: "Open Alarms Screen", icon: "alarm" },
    { id: "skip_tonight", name: "Skip Tonight", icon: "skip" },
    { id: "snooze", name: "Snooze Active Alarm", icon: "alarm" }
  ];

  function findAppAction(id) {
    return APP_ACTIONS.filter(function (a) { return a.id === id; })[0];
  }

  // Best-guess icon for an HA entity based on its domain, used only for
  // the picker's search-result rows — the tile itself always uses
  // whichever icon the user explicitly chose, independent of this.
  var DOMAIN_ICON = {
    light: "bulb", fan: "fan", switch: "plug", lock: "lock", cover: "blinds",
    climate: "thermostat", media_player: "speaker", camera: "camera",
    script: "moon", scene: "star", automation: "gear", input_boolean: "gear",
    binary_sensor: "home", sensor: "home"
  };

  function iconForEntity(entityId) {
    var domain = (entityId || "").split(".")[0];
    return DOMAIN_ICON[domain] || "home";
  }

  return {
    ICONS: ICONS,
    svg: svg,
    APP_ACTIONS: APP_ACTIONS,
    findAppAction: findAppAction,
    iconForEntity: iconForEntity
  };
})();
