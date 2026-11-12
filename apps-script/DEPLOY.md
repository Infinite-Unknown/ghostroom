# Deploy GhostRoom (about 15 minutes)

Use the team's personal Google account. No billing needed.

## 1. Make the Sheet
1. Go to https://sheets.new. Name it `GhostRoom`.
2. Menu **Extensions → Apps Script**. A code editor opens.

## 2. Paste the code
1. In the editor, click `Code.gs`. Delete what is there. Paste all of [`apps-script/Code.gs`](Code.gs).
2. Click **+** next to "Files" → **Script**. Name it `Timetable` (it becomes `Timetable.gs`). Paste all of [`apps-script/Timetable.gs`](Timetable.gs). It is one long line. That is fine.
3. Click **+** → **HTML**. Name it `dashboard` (it becomes `dashboard.html`). Delete what is there. Paste all of [`apps-script/dashboard.html`](dashboard.html).
4. Click the save icon (or Ctrl/Cmd + S).

## 2b. Room Scout key (chat box)
1. Make a free key in Google AI Studio (https://aistudio.google.com → **Get API key**). Never put it in a file or in the repo.
2. Apps Script editor → gear icon **Project Settings** → **Script Properties** → **Add script property**.
3. Property: `GEMINI_API_KEY`. Value: the key. **Save**.
4. In the editor pick `authorize` in the function box, click **Run**, and **Allow** the new permission (one time). Then make a new deployment version.
5. No key? The chat box still works and says "Room Scout is not set up yet". Nothing crashes.
6. Model is `gemini-3.5-flash-lite` (`ASK_MODEL` in `Code.gs`). Cap is 200 questions a day (`ASK_DAILY_CAP`).

## 3. Run `setup()`
1. In the function box at the top, pick `setup`. Click **Run**.
2. Google asks for permission. Click **Review permissions** → pick your account → **Advanced** → **Go to GhostRoom (unsafe)** → **Allow**. (It says "unsafe" only because the script is yours and not reviewed by Google.)
3. Wait about 10–20 seconds. The log should show `selfTest passed` and `tick took … ms`.
4. Back in the Sheet you now have the tabs `config`, `rooms_live`, `free_now`, `ghost_now`, `commands`, `daily_stats`, `gym_live`, `runs`.

`setup()` also turns on two timers: `tick` every 5 min, and `morningBrief` every day around 07:30 (Google runs it within ±15 min). You can re-run `setup()` any time. It does not delete data.

## 4. Deploy as a web app
1. Top right: **Deploy → New deployment**.
2. Gear icon → **Web app**.
3. Execute as: **Me**. Who has access: **Anyone**.
4. Click **Deploy**. Copy the **Web app URL** (ends in `/exec`).

## 5. Where the URL goes
- **Dashboard**: open the URL in a browser. (Without the `dashboard` HTML file it just says "running".) It talks to the script with `google.script.run`, not fetch.
- **Live JSON**: the URL + `?api=state`.
- **Wokwi ESP32**: POST to the URL. Body `{"type":"sensor","room":"D-07-08","motion":true}`.
- **README / demo link**: paste the URL there.
- Share the Sheet "Anyone with the link can view" for judges and Gemini Enterprise (no personal data in it).

**After any code change** (including adding `dashboard` or changing `Code.gs`): Deploy → Manage deployments → pencil icon → Version: **New version** → Deploy. The URL stays the same.

## 6. Quick checks
- Run `morningBrief` once by hand. You should get an email, and a new row in `runs`.
- Video day: in `config`, set `demo_scenario` to `demo`. Within 5 min (or run `tick`): `D-07-08` is a ghost, `B-05-03` is squatted, `B-08-01` is offline. Set it back to `live` after.
- Approve test from a terminal (any GHOST room from `ghost_now`):
  ```
  curl -L -H 'Content-Type: application/json' -d '{"type":"approve","room":"D-07-08"}' '<WEB_APP_URL>'
  ```

## Good to know
- Today (Mon 9 Nov) has no classes in the APU feed, so live mode shows every room free. Use `demo` mode or wait for Tue.
- Classes after 22 Nov reuse the same weekday from the last real week.
- To refresh the timetable: `node scripts/fetch-timetable.mjs`, then paste the new `Timetable.gs` again.
- To run the self-test on a laptop: `node scripts/run-selftest.mjs`.

## Filming the hero shot (demo mode)

1. Sheet → `config` tab → set `demo_scenario` to `demo`. Wait up to 5 min. `D-07-08` is now a ghost room (demo bookings run 06:30–22:30 MYT, so film between 07:00 and 22:30).
2. On the site: Approve setback, then Walk in.
3. For another take: in the Apps Script editor run `resetDemo()`. `D-07-08` is a ghost with aircon ON again at once, even if the take stopped after Approve. (Without it, wait about 30 min after Walk in; a setback without Walk in lasts until the 2-hour demo booking ends.)
4. When done, set `demo_scenario` back to `live`.
