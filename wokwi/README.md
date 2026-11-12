# GhostRoom virtual ESP32 (room D-07-08)
1. Go to https://wokwi.com/projects/new/esp32
2. Paste `sketch.ino` into the sketch tab. Open `diagram.json` tab, paste that too.
3. Click the green Play button. Watch the Serial monitor.
4. Red LED = aircon relay. ON when the Sheet says aircon ON, OFF on SETBACK/OFF.
5. Click the PIR sensor (then the "Simulate motion" toggle) = motion. A POST goes out and the LED turns back on.
6. Demo: Approve D-07-08 on the dashboard. Within 15 s the LED goes OFF.
7. Change `URL` / `ROOM` at the top of the sketch if needed.
