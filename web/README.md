# GhostRoom website

Static site (plain HTML/CSS/JS, no build step) that shows GhostRoom's live room state: the building, one room drawn as a section, Approve / Walk in, and Room Scout.
All data comes from the Apps Script web app; its URL is the `API` const at the top of `app.js`. No keys or secrets live here.
Run locally: `python3 -m http.server 5178 --directory web` from the project folder, then open http://localhost:5178.
Redeploy: `cd web && vercel deploy --prod --yes` (Vercel project `ghostroom`).
The design spec is `DESIGN.md`. Occupancy is simulated; the timetable is APU's real open feed.
