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
   status icon, alarm/vacation status, 6 permanent action tiles:
   **Lighting** (opens screen 3), **Ceiling Light, Good Night, Bathroom,
   Skip Tonight, Snooze**.
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

## Mockups

Interactive HTML prototypes (no backend, all client-side) — saved in
`mockups/` alongside this README so they survive independent of any
Claude artifact hosting:

- `mockups/main-screen.html` — the main clock screen
- `mockups/alarms-screen.html` — the alarms list + editor (dial picker,
  day chips, sound picker)
- `mockups/lighting-screen.html` — the Lighting & Control card gallery
  + dimmer/fan popups

All three share one CSS custom-property token system (split-flap/warm-amber
palette, serif numerals) so new screens should reuse the same tokens
rather than inventing a new look per screen.

## Architecture

- **Hosting**: Docker container on docker-server, deliberately minimal —
  a static file server (nginx/Caddy) serving HTML/CSS/JS. No custom backend
  service.
- **State**: lives in Home Assistant via `input_helpers` (input_datetime for
  alarm time, input_boolean/input_text for skip-until date) — not a custom
  DB. Editable from the HA app, one source of truth.
- **Alarm decision logic**: an HA automation, not client-side JS. It checks
  light/motion state and the skip-until date, and pushes a simple state
  (e.g. "alarm active") that the page watches and reacts to. Keeps the
  time-critical decision off a browser tab that could crash/reload
  overnight.
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
  (see Alarms screen mockup's sound picker). Storage mechanism (HA
  helper vs. static per-alarm config) not yet decided — revisit when
  scaffolding the container, since it depends on whether alarm records
  end up in HA or a local config file.

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
  (Not yet implemented — note for when the HA automation is built.)
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

**No secrets in the compose file.** Secret lives in
`/etc/homelab/kiosk-alarm-clock.env` (owner `root:988`, mode `640`) —
this is the standard homelab-wide convention (every docker service on
docker-server has a matching `{service-name}.env` there), not something
specific to this project. Referenced in compose with an absolute path
since it's outside the project directory:

```yaml
services:
  kiosk-alarm-clock:
    env_file: /etc/homelab/kiosk-alarm-clock.env
```

This location is also structurally protected from Claude: the
homelab-mcp secret-path guard blocks every MCP tool (`ssh_exec`,
`grep_file`, `read_file`, `write_file`, ...) from reading *or writing*
anything under `/etc/homelab/`, regardless of filename — confirmed
2026-08-07 by testing against this exact path before adopting it. Create
and edit this file by SSHing in directly, not by asking Claude to do it.

Secret needed: an HA long-lived access token, so the page can call HA's
REST/WebSocket API directly from the browser. Decided 2026-08-07: mint a
**dedicated, narrowly-scoped token** from a restricted HA user (only the
entities this clock needs — lights/motion sensors, not full admin) rather
than reusing homelab-mcp's own HA token or building a server-side proxy.
The token will be embedded in client-side config and is readable via
view-source on the tablet — acceptable risk for a LAN-only device behind
Fully Kiosk's own device-admin PIN, given the token's scope is limited.

## Media assets

Sound/video files (including a certain Rick Astley option) are **not**
committed to git — copyright-distribution risk for a public GitHub repo,
plus general dislike of binary assets in version control. They live only
on docker-server (see `.gitignore`); the repo references filenames, not
the files themselves.

## Status

Design/planning phase. No application code written yet. Repo initialized
in `/srv/kiosk-alarm-clock`, committed, and pushed to
`github.com/MrGibbage/kiosk-alarm-clock` (`main` branch) on 2026-08-07.
Directory chowned to `skip:skip`, HA token secret file created. Three
mockups built and saved (see Mockups above) — main screen, alarms, and
Lighting & Control are all visually/interactively settled. Remaining
open item before scaffolding: where per-alarm sound selection is stored
(HA helper vs. local config — see Multi-alarm data model above). Next
session: start building the real container/frontend.
