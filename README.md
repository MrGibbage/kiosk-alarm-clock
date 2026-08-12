# Kiosk Alarm Clock

A bedside "smart" alarm clock built from an old ~10" Android tablet running
Fully Kiosk Browser, replacing/complementing a failing Google Home Mini in
the master bedroom.

Repo: https://github.com/MrGibbage/kiosk-alarm-clock.git
Deploy target: `/srv/kiosk-alarm-clock` on docker-server

## Requirements

- Huge digital clock filling almost the whole screen
- Day/night font-color theming
- Quick-action buttons (6 permanent slots on the main screen — confirmed
  as the ceiling; 7th would crowd a 10" screen at a comfortable
  touch-target size)
- Multiple independent alarms (weekday/weekend/etc.), each with its own
  day-of-week schedule and sound
- "Smart" alarm: don't sound if signs indicate Skip is already up (e.g.
  lights already on)
- Skip alarms for N days (vacation mode) or just the next occurrence
  ("Skip Tonight"), controllable remotely
- Dimmable light support (vertical-slider popup), fan speed control
  (4-button popup: Max/Med/Low/Off)
- Easy to customize (colors, sounds, buttons)

## Screens

1. **Main clock** — huge live clock, day/night toggle, HA connection
   status icon, alarm/vacation status, 6 permanent action tiles. Tile
   order/icon/label/action are now fully configurable (see screen 6,
   **Customize Buttons**, built 2026-08-12) — the tile *count* stays
   fixed at 6 (confirmed ceiling for a 10" screen), not the content.
2. **Alarms** — list of independent alarms, each editable via an
   analog-dial time picker (tap/drag, Material-clock style), day-of-week
   repeat chips, and a sound picker (choose from uploaded audio/video
   files).
3. **Lighting & Control** — simple card gallery (Ceiling Fan, Skip's
   Light, Suzanne's Light), reached via the main screen's Lighting tile.
   Tapping a card opens a popup scoped to that control:
   - **Dimmable lights** (Skip's/Suzanne's): vertical slider + ON/OFF
     shortcut buttons + a **Done** button to close. Needs Done because
     dragging a slider has no natural "I'm finished" moment the way a
     discrete button tap does.
   - **Ceiling Fan**: 4 stacked buttons (Max/Med/Low/Off) — tapping one
     both sets the speed and closes the popup immediately, since
     selecting a speed *is* the complete, discrete action.
4. **Ringing** (built 2026-08-10, not in the original mockups — designed
   during scaffolding once the gap was noticed) — full-screen takeover
   shown whenever `input_boolean.kiosk_alarm_ringing` is on: alarm label,
   current time, big Snooze/Dismiss buttons, plays the firing alarm's
   mapped sound/video. Snooze arms `timer.kiosk_alarm_snooze` (9 min) and
   clears the ringing flag; Dismiss just clears it (and cancels any
   pending snooze timer).
5. **Settings** (built 2026-08-10, not in the original mockups) — where
   the HA base URL/token and Lighting & Control's 3 entity IDs are entered
   and validated live against HA (`GET /api/states/<id>` → shows the
   resolved friendly name or an error) rather than picked from a live
   dropdown. Persisted in the browser's `localStorage` — see Architecture.
   Also links to screen 6.
6. **Customize Buttons** (built 2026-08-12, mocked up the same day) —
   drag-to-reorder the 6 main-screen tiles (grip handle per tile), tap one
   to change its icon (25-icon picker), label, and action. Two action
   types: **Alarm Clock** (navigate to Lighting/Alarms, Skip Tonight,
   Snooze — the same fixed list as before, now reassignable to any slot)
   or **Home Assistant** (a live, filterable search over every HA entity
   — same idea as the Android HA widget's picker — instead of typing a
   raw entity_id in Settings). Superseded Settings' old fixed
   Ceiling-Light/Good-Night/Bathroom fields entirely; existing values
   from those fields are carried forward as the first-run seed so
   upgrading doesn't blank out a working setup.

## Mockups

Interactive HTML prototypes (no backend, all client-side) — saved in
`mockups/` alongside this README so they survive independent of any
Claude artifact hosting:

- `mockups/main-screen.html` — the main clock screen
- `mockups/alarms-screen.html` — the alarms list + editor (dial picker,
  day chips, sound picker)
- `mockups/lighting-screen.html` — the Lighting & Control card gallery
  + dimmer/fan popups
- `mockups/button-config-screen.html` — the Customize Buttons drag/icon/
  action-picker screen (published as an Artifact for review before
  building; mock HA entity list, real data model once implemented)

All three share one CSS custom-property token system (split-flap/warm-amber
palette, serif numerals) so new screens should reuse the same tokens
rather than inventing a new look per screen. **Built 2026-08-10**: the
real app lives in `app/` (`css/tokens.css` factors that shared token
system out of the mockups into one file); `mockups/` is kept as-is for
reference, not wired to anything live.

## Architecture

- **Hosting**: Docker container `kiosk-alarm-clock` on docker-server
  (`/srv/kiosk-alarm-clock`, port 8850), deliberately minimal — the
  official `caddy:2-alpine` image bind-mounting `app/` and `media/`
  straight from the repo, no Dockerfile/build step, no custom backend
  service. No Caddy-on-OPNsense route added yet (LAN-only device, not
  urgent — see Holocron page for the live IP:port).
- **State**: lives in Home Assistant, called directly from the browser —
  not a custom DB, not proxied through the container above. Per-alarm
  `schedule`/`input_boolean` helper pairs are created live by the app
  itself (see Multi-alarm data model); the shared
  `input_boolean`/`input_datetime`/`input_text`/`timer` helpers below are
  provisioned once via YAML on the `homeassistant` host, not by the app.
- **Alarm decision logic**: an HA automation (`automation/kiosk_alarm.yaml`
  on the `homeassistant` host), not client-side JS. It checks
  `binary_sensor.bedroom_occupancy` and `input_datetime.kiosk_alarm_skip_until`,
  and sets `input_boolean.kiosk_alarm_ringing` +
  `input_text.kiosk_alarm_ringing_source` (which alarm fired), which the
  page polls every 5s and reacts to by jumping to the Ringing screen.
  Keeps the time-critical decision off a browser tab that could
  crash/reload overnight.
- **Settings, not hardcoded config**: every entity ID and the HA
  URL/token live in the browser's `localStorage`, entered via the
  Settings screen — nothing is baked into the container image, so a
  freshly deployed container is blank until Settings is filled in.
- **Sound/video**: browser-served static assets bundled in the container
  (not Android system sounds) — swap files in, no rebuild needed. Autoplay
  is handled by running inside **Fully Kiosk Browser**, which can disable
  the WebView autoplay-gesture requirement entirely (`setMediaPlaybackRequiresUserGesture(false)`,
  exposed as a Fully Kiosk setting) — this works even for browsers that
  would normally block `Audio.play()`/`Video.play()` without a user tap.
- **PWA/HTTPS**: not needed. Fully Kiosk goes fullscreen chrome-free by URL
  regardless of manifest/service-worker status. If PWA features are wanted
  later, HTTPS is required for service workers — internal Caddy-on-OPNsense
  + `*.pelorus.org` DNS covers it, no public Cloudflare Tunnel route needed
  (LAN-only bedside device).
- **Taking the tablet on the road**: works, but only via **Tailscale**, not
  Nabu Casa. Nabu Casa only proxies remote access to HA itself — it doesn't
  expose this app's own page, which is hosted on docker-server behind
  internal-only DNS per the point above. Tailscale on the tablet gives it a
  private route back to the LAN for *both* the page's own assets and its
  HA API calls, so nothing about the architecture needs to change for
  travel as long as Tailscale is active on the device. Skip already has
  both services; this was clarified 2026-08-07, not yet tested in practice.

### Multi-alarm data model (decided 2026-08-07)

- **Per alarm**: an HA `schedule` helper (native to HA — day/time blocks
  configured directly in its own UI, so "weekdays only" needs no custom
  code) plus a companion `input_boolean` for a manual per-alarm on/off
  switch. One shared HA automation triggers off *any* schedule turning
  on, so skip/condition logic lives in one place, not duplicated per
  alarm.
- **Skipping is unified, not per-alarm**: a single `input_datetime.skip_until`
  date field, checked by every alarm's automation. "Skip Tonight" is a
  one-tap shortcut that just sets this to tomorrow's date; vacation mode
  sets it further out via the HA app. Since every alarm checks the same
  field, a skip is global by default — matches the "I have PTO tomorrow,
  turn the alarm off" mental model (not per-alarm bookkeeping). A
  separate per-alarm `enabled` toggle (in the Alarms screen) exists for
  longer-lived decisions like "permanently disable my weekend alarm."
- **Sound**: each alarm stores which uploaded audio/video file to play
  (see Alarms screen mockup's sound picker). Decided 2026-08-10: a local
  config file — a static `js/sounds.json` manifest (id/name/type/filename)
  ships with the app, and each alarm's chosen sound id is stored in the
  browser's `localStorage`, keyed by that alarm's `schedule.*` entity_id.
  Not an HA helper — avoids having to keep an `input_select`'s options in
  sync with whatever files actually exist in `media/`.
- **Built 2026-08-10, with two changes from the original plan.** First:
  "Add alarm" creates a new `schedule` + `input_boolean` pair live rather
  than claiming a slot from a pre-provisioned fixed pool — see **Secrets**
  below for why that requires an admin-scoped token, and the tradeoff
  Skip accepted to get true unlimited alarms instead of a fixed ceiling.
  Second, discovered 2026-08-11 while actually testing this end to end:
  the REST **Config API** (`/api/config/<domain>/config/<id>`) this was
  originally built against **doesn't exist in this HA version at all** —
  confirmed via live 404s on both `schedule` and `input_boolean`. HA has
  moved structured helpers like `schedule` to dedicated **WebSocket**
  commands instead (`schedule/create`, `schedule/update`,
  `schedule/delete`, `schedule/list`; `input_boolean/create`,
  `input_boolean/delete`) — the same commands HA's own frontend Helpers UI
  uses, implemented in `app/js/ha-ws-client.js`. WebSocket connections
  aren't subject to the browser's CORS/Same-Origin restrictions the way
  `fetch()` is, so this also sidesteps needing any further CORS
  configuration for these calls.
  - **Consequence**: HA generates each new helper's `object_id` itself
    (slugified from the name given at creation — e.g. `schedule.new_alarm`
    for the label "New Alarm"), not a `kiosk_alarm_<n>` id the app picks.
    Which schedule/input_boolean pairs are "this app's alarms" is
    therefore tracked explicitly in the browser's `localStorage`
    (`ConfigStore.listManagedAlarms()`), not inferred from a naming
    prefix.
  - **Consequence for the HA automation** (`automation/kiosk_alarm.yaml`
    on the `homeassistant` host): it can no longer match alarms by
    `entity_id` prefix either. It instead matches the firing schedule by
    its `icon` attribute (`mdi:alarm`, set by the app on every
    create/update) and finds the paired enabled/disabled `input_boolean`
    by `friendly_name` (`"<alarm label> Enabled"`) rather than by a
    derived `entity_id` — both values the app fully controls, so this
    stays robust regardless of what object_id HA assigns.
  - Verified working end-to-end 2026-08-11: create, edit (`schedule/update`),
    delete, and a real scheduled fire all confirmed live against the
    `homeassistant` host.

### HA reliability / connection status (decided 2026-08-07)

Considered and **rejected**: caching schedule data locally (localStorage
or container-side) so the tablet could independently decide to fire an
alarm if HA is unreachable. Storing a copy of the schedule doesn't
actually fix the real risk — the *decision logic* lives in an HA
automation, so if HA is down, that automation can't run regardless of
where the schedule data is cached. Duplicating the scheduling logic
itself (client-side or in a container-side service) to work around that
was rejected as reintroducing exactly the backend complexity this
project deliberately avoided, and as its own bug surface (two systems
deciding "should I alarm now," risk of double-firing or disagreement).

Instead:
- **Fail open, not closed**: if the "already up" light-state check can't
  reach HA, default to *sounding* the alarm rather than silently
  skipping it — a false alarm is annoying, a missed one is much worse.
  **Built 2026-08-10** as part of the `kiosk_alarm.yaml` automation: the
  condition gating the alarm is `binary_sensor.bedroom_occupancy != 'on'`,
  which is true (alarm sounds) whenever the sensor reads `off`,
  `unavailable`, or `unknown` alike — fails open for free, no separate
  error-handling branch needed.
- **Connection status icon** on the main screen (stylized house glyph,
  in the spirit of the HA logo, themed to the app's palette rather than
  reproducing it) — normal in the app's accent color when connected; a
  jagged crack splits the icon and it dims to muted + pulses gently when
  the connection to HA is lost. Purpose: Skip gets notified when
  services go down during the day, but doesn't monitor that overnight —
  this makes an HA outage visible at a glance if he wakes and checks the
  clock, without trying to solve the outage itself.
- **All 6 action tiles dim + disable when offline**, not just the icon —
  every tile needs HA connectivity to actually do anything, so a small
  icon alone was judged too easy to miss; a systemically "broken" look
  across the whole button row is the real signal something's wrong.
- Recommended (not yet actioned): if HA downtime alerting isn't already
  wired for overnight hours, that's the real fix for this risk — worth
  its own follow-up, separate from this project.
- **Planned, not yet mocked up**: tapping the connection status icon
  opens a small popup showing HA health — current uptime/downtime, plus
  a last-synced timestamp so it's clear how fresh the status actually
  is (not just up/down as of some unknown point).

## Secrets

**No secrets in the compose file, and — as it turned out — none needed
server-side at all.** `/etc/homelab/kiosk-alarm-clock.env` was created
2026-08-07 anticipating one, but the container's `compose.yml` doesn't
reference it: every HA call happens straight from the browser to HA, so
there's nothing for the container itself to hold. The file is left in
place (harmless, matches the homelab-wide `{service-name}.env`
convention) in case a server-side secret is ever needed later.

Secret needed: an HA long-lived access token, so the page can call HA's
REST and WebSocket APIs directly from the browser (entered via the
Settings screen, stored in that browser's `localStorage` — see
Architecture). **Revised 2026-08-10 from the original 2026-08-07
decision**: the token must be **admin-scoped**, not narrowly-scoped as
first planned. Reason: "Add alarm" creates/deletes real
`schedule`/`input_boolean` helpers via HA's WebSocket API at runtime (see
Multi-alarm data model — originally assumed to be the REST Config API,
corrected 2026-08-11 once that turned out not to exist), and helper CRUD
requires `is_admin` either way — HA has no narrower permission tier for
"can manage helpers but nothing else." Skip explicitly chose this over a fixed
pre-provisioned alarm-slot pool (which would have kept the token
non-admin) to get true unlimited alarms. Mitigation unchanged from the
original decision: still mint it from its own **dedicated** HA user, not
shared with any other integration/token, so a leak is scoped to "this HA
instance" specifically. The token is embedded in client-side config and
readable via view-source on the tablet — accepted risk for a LAN-only
device behind Fully Kiosk's own device-admin PIN, now carrying more
blast radius than originally scoped, but still isolated to its own user.

## Multiple instances (e.g. a second clock for another family member)

Not planned, not decided — documented for reference in case it comes up.

Cloning this container for a second person (e.g. Skip's daughter) does
**not** need any "user profile" concept built into the app. HA doesn't
namespace helpers per user automatically, so the real risk is entity
collision: if a second instance is deployed still pointed at
`schedule.alarm_weekday` / `input_boolean.alarm_weekday_enabled` etc.,
both tablets would be reading and writing the *same* alarm. The fix is
just deployment config, not code:

- Give each instance its own distinctly-named HA entities (e.g. prefix
  by person or bedroom — `schedule.daughter_alarm_weekday` vs.
  `schedule.alarm_weekday`), and point each container's config at its
  own set.
- Mint each instance's HA long-lived token from its **own restricted HA
  user**, scoped to just that person's area/entities (same pattern as
  Skip's own token). This isn't just tidy — it's real enforcement: a
  misconfigured instance literally can't touch the wrong entities if its
  token doesn't have permission to.

HA's own "Users" feature (Settings → People) is about login/permissions,
not automatic per-user data partitioning, so it doesn't solve this by
itself — the restricted-user + distinct-entity-naming combination above
is the actual mechanism.

## Media assets

Sound/video files (including a certain Rick Astley option) are **not**
committed to git — copyright-distribution risk for a public GitHub repo,
plus general dislike of binary assets in version control. They live only
on docker-server (see `.gitignore`); the repo references filenames, not
the files themselves.

## Backlog / planned improvements

- **Done 2026-08-12**: configurable main-screen buttons (custom
  icon/label, filterable HA entity picker, drag reorder) — see Screens
  #6, Customize Buttons. Originally raised 2026-08-11 as three separate
  backlog items; built as one screen per the mockup review.
- **Still open**: Lighting & Control's 3 cards (Ceiling Fan, Skip's
  Light, Suzanne's Light) still have hardcoded labels/icons — Customize
  Buttons only covers the main screen's 6-tile bar, not this screen.
  Same underlying pattern would apply if/when this is wanted.

## Status

**In daily use as of 2026-08-12.** All 6 screens (`index.html`,
`alarms.html`, `lighting.html`, `ringing.html`, `settings.html`,
`buttons.html`) are wired to live HA state, deployed on docker-server
(`http://192.168.0.231:8850` — see the Holocron page under
`docker-server/docker-services/kiosk-alarm-clock.md`), and running on the
actual bedside tablet in Fully Kiosk. Everything below has been tested
end-to-end against real HA, not just exercised in isolation:

- Alarm create/edit/delete (HA WebSocket API — see Multi-alarm data
  model for why this isn't the REST Config API originally planned),
  including a real scheduled fire, the fail-open/smart-skip check
  (`bedroom_occupancy`), and Skip Tonight (with a way to cancel it —
  the "Skipped through…" pill is tappable).
- Ringing screen: Dismiss and Snooze both confirmed against a live fire.
- Lighting & Control: dimmer sliders, on/off, and the 4 fan speeds.
- All 5 provided sound files (mixed mp3/wav/flac) play correctly.
- Main-screen tile customization (drag reorder, icon/label/action).

Known still-open items, none blocking daily use:
- No Caddy-on-OPNsense route/friendly hostname (reachable by IP:port),
  no Glance/Uptime Kuma/DIUN — deliberately deferred, personal LAN-only
  device.
- Lighting & Control's 3 cards aren't customizable the way main-screen
  tiles now are (see Backlog).
- The original README's "tap connection icon → HA health popup" was
  never built — out of scope so far.
