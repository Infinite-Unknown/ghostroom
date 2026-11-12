# GhostRoom website — design spec (v1, 11 Nov)

The builder follows this. The designer (main session) reviews against it. If something here cannot work, say so; do not quietly swap it.

## The one idea

**Schedule vs truth.** Every screen shows two facts side by side: what the timetable says, and what the sensors say. When they disagree, that is a ghost room. The page is drawn like an architect's sheet: a building elevation where every window is a room, and a section drawing of one room. Thin ink lines, drafting paper, one signal colour. Not a dark neon dashboard.

Three things a viewer must get in 5 seconds: (1) how many rooms are booked but empty right now, (2) what that costs, (3) one click fixes one.

## Tokens

```
--paper:   #F2F5F8   page background
--sheet:   #FFFFFF   panels
--line:    #D5DCE4   hairlines (1px), panel borders
--ink:     #0F1A2B   text, drawing lines
--ink-2:   #566376   secondary text
--ghost:   #6B3CF0   the signal colour: ghost rooms only
--ghost-bg:#EFE9FF
--air:     #1AA5C4   aircon airflow only
--free:    #0F8A5F   free rooms, money recovered
--warn:    #B4530A   money wasted
--offline: #8A94A3   sensor offline (always with hatching)
```

Rules: `--ghost` is never used for decoration. No gradients, no shadows, no rounded cards above 6px radius, no emoji. Panels are white with a 1px `--line` border. Drawing areas get a faint 24px grid (`--line` at ~35% opacity).

Type (Google Fonts): **Bricolage Grotesque** 600/700 for headings and big numbers; **IBM Plex Sans** 400/500 for body; **IBM Plex Mono** 400/500 for room codes, labels on drawings, timestamps, units. Big numbers use tabular figures. Body 16px min; mono labels 12–13px, uppercase with 0.06em tracking. Sentence case everywhere else.

## Page, top to bottom (desktop ≥1100px, max width 1280)

1. **Top bar** (56px). Left: wordmark "GhostRoom" + the line "APSpace shows what is scheduled. GhostRoom shows what is true." Right: mono stamp `LIVE · 12:39` (from `generated_at`; turns `--warn` and says `STALE` if the last good poll is over 60 s old) and a "Ask Room Scout" button.

2. **Numbers strip** — four numbers, no boxes, separated by hairlines:
   - `4` **ghost rooms now** (in `--ghost`) — sub: "booked, empty, aircon on"
   - `RM 15.76` **wasted today** (`--warn`) — sub: "43.2 kWh over 12.3 ghost-hours"
   - `RM 0.00` **recovered today** (`--free`) — sub: "by approved setbacks"
   - `31` **rooms really free now** — sub: "of 60 tracked"
   From `counters` / `counters.today`. Numbers that change animate once (count up, 400 ms).

3. **Hero: the room** — two columns, 5/7 split. Must sit fully above the fold at 1920×1080.

   **Left: the case file** for the selected room.
   - Room code huge in mono (`D-07-08`), then "Block D · Floor 7 · 40 seats".
   - Two stacked rows with mono labels:
     - `TIMETABLE SAYS` → "Booked: Concurrent Programming, until 12:45" or "Nothing scheduled".
     - `SENSORS SAY` → "0 people · 3 Wi-Fi devices · empty for 34 min" or "21 people · 29 Wi-Fi devices". For offline: "No signal since 12:10. We do not guess."
   - **Verdict**: one big word + one plain sentence.
     - GHOST — "Booked, but nobody came. The aircon is cooling an empty room." Plus `est_rm` / `est_kwh` / `ghost_count_7d` from `ghost_now` ("RM 2.02 wasted so far · 5 times this week").
     - IN USE — "Class is running." If `scheduled_now` is false: "In use, but not on the timetable."
     - FREE — "Empty and not booked. Free until 15:45." (from `free_now`)
     - SETBACK — "Aircon set back. It comes back on the moment someone walks in."
     - SENSOR OFFLINE — "We cannot see this room, so we do not touch it."
   - Two buttons: **Approve setback** (primary, `--ghost` fill; enabled only when GHOST; otherwise disabled with the reason as helper text) and **Walk in** (secondary, outline).
   - Footnote, mono: `SIMULATED ROOM · DRAWN FROM LIVE DATA`.

   **Right: the section drawing** (inline SVG, ink line art, 2px strokes, on the grid).
   - Side view of one classroom: floor, ceiling, door at left, window at right, 3 rows of desks.
   - **People**: simple seated pictograms, one per person up to 12, then a mono `+N`.
   - **PIR sensor** on the ceiling with a dotted detection cone. Cone pulses once when motion is reported. Offline: sensor drawn with a cross, cone removed, room hatched in `--offline`, people shown as `?`.
   - **Aircon unit** high on the right wall. `ON`: 5–6 curved streamlines in `--air` flowing down and across (dash-offset animation, slow, ~4 s loop). `SETBACK`/`OFF`: streamlines fade out over 800 ms, louvre closes.
   - **Relay**: a small box wired to the aircon with a lever that rotates between ON and OFF (300 ms) and an LED dot. Mono callouts with leader lines: `PIR · MOTION 34 MIN AGO`, `AC · ON`, `RELAY · CLOSED`.
   - Ghost state: the room is empty, air still flowing. That contrast is the shot. Outline the room in `--ghost`.
   - **Approve** → lever flips, LED off, air fades, verdict becomes SETBACK. **Walk in** → door opens, one figure walks from the door to a desk (~1.2 s), cone pulses, lever flips back, air returns.
   - All of it is driven by the room object from the back end. Animations play when state changes; they never invent a state.

4. **The building** — full-width panel "Campus now". Two elevations side by side, Block B and Block D. Each floor is a row labelled in mono (`F9 … F4`, top floor on top), each room a window (~28px). Window styles (colour + shape, never colour alone):
   - in use: solid `--ink` at 85%
   - free: white with `--line` border
   - ghost: `--ghost` fill with a hollow centre, slow pulse (2.4 s)
   - setback: `--ghost` outline with two small bars (pause mark)
   - offline: diagonal hatch in `--offline`
   Legend in one line under the panel title, with live counts. Hover/focus a window: small tooltip (room, verdict word, people). Click: selects it into the hero. Selected window gets a 2px ink ring.

5. **Two lists**, side by side, max 6 rows each with "show all":
   - **Ghost rooms to review** — room, module, "empty 110 min", "RM 2.02", and a `Review →` that selects the room and scrolls to the hero. Sorted by `est_rm` desc. Empty state: "No ghost rooms right now."
   - **Really free now** — room, seats, "free until 15:45". Sorted by longest free. This is the student list.

6. **Footer strip**: last 5 `commands` as one-line mono entries ("12:31 · D-07-08 · SETBACK · by dashboard"); gym as one line ("Gym: Cardio 7/30 · Weights 12/40 · Studio 6/25", hidden if empty); and "Occupancy is simulated. Timetable is APU's real open feed. No personal data."

**Room Scout**: right-side drawer, closed by default. Title, one line ("Answers only from the live room data"), three starter chips ("Which rooms are really free now?", "Any free room for 40 people in Block D?", "Which rooms are being wasted?"), message list, input. Shows "thinking…" while waiting.

## Selection rule

Selected room on load = `?room=` in the URL if valid, else the first row of `ghost_now`, else `D-07-08`. Keep the selection across polls.

## Phone (≤700px)

Single column: top bar (pitch line wraps under the wordmark), numbers as a 2×2 grid, section drawing, then case file with buttons full width, building (each block full width, stacked), lists stacked, footer. Buttons at least 44px tall. Nothing scrolls sideways.

## Motion and access

`prefers-reduced-motion`: no loops, no walking figure; states switch with a 150 ms fade. Every control keyboard-reachable with a visible 2px focus ring. Text contrast AA. Windows in the building are buttons with `aria-label` ("D-07-08, ghost, 0 people").

## Not on this site

No login, no charts, no settings, no dark mode, no map, no scenario switch (the team flips `demo_scenario` in the Sheet).
