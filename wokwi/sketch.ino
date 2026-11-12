#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>

const char* URL  = "https://script.google.com/macros/s/AKfycbwzDVsgknE2HXOndbRJ0wXWR0xJhz1X_zuunbvPzxLwdpEurHgei4geGikPowEpk087UA/exec";
const char* ROOM = "D-07-08";

const int PIR_PIN = 13, LED_PIN = 26;
bool ledOn = false, lastPir = false;
unsigned long lastPost = 0, lastPoll = 0, lastMotion = 0;
bool posted = false;

// POST (body != "") or GET. Follows the Apps Script 302 by hand: the redirect target must be fetched with GET.
String call(const String& url, const String& body) {
  WiFiClientSecure c; c.setInsecure(); // Wokwi gateway: no cert checks
  HTTPClient h;
  const char* keys[] = {"Location"};
  h.begin(c, url);
  h.collectHeaders(keys, 1);
  h.setTimeout(20000); // TLS handshake is slow in the simulator
  h.setFollowRedirects(body.length() ? HTTPC_DISABLE_FOLLOW_REDIRECTS : HTTPC_STRICT_FOLLOW_REDIRECTS); // POST: we follow by hand with GET
  int code;
  if (body.length()) { h.addHeader("Content-Type", "application/json"); code = h.POST(body); }
  else code = h.GET();
  if (code == 301 || code == 302 || code == 303) { // POST redirect: go get the answer
    String loc = h.header("Location"); h.end();
    h.begin(c, loc); code = h.GET();
  }
  String out = code > 0 ? h.getString() : "";
  h.end();
  if (code <= 0) { Serial.printf("HTTP error %d\n", code); return ""; }
  return out;
}

void postSensor(bool motion) {
  String body = String("{\"type\":\"sensor\",\"room\":\"") + ROOM + "\",\"motion\":" + (motion ? "true" : "false") + "}";
  String r = call(URL, body);
  Serial.printf("POST motion=%s -> %s\n", motion ? "true" : "false", r.length() ? r.substring(0, 60).c_str() : "FAILED");
  lastPost = millis(); posted = true;
}

void setLed(bool on) {
  if (on == ledOn) return;
  ledOn = on; digitalWrite(LED_PIN, on);
  Serial.printf("LED -> %s\n", on ? "ON (aircon on)" : "OFF (setback)");
}

void pollState() {
  String r = call(String(URL) + "?api=state", "");
  lastPoll = millis();
  // ponytail: string search, not a JSON parse. Needs "room":"X" then the next "aircon":"..." in the same object.
  int i = r.indexOf(String("\"room\":\"") + ROOM + "\"");
  int j = i < 0 ? -1 : r.indexOf("\"aircon\":\"", i);
  if (j < 0) { Serial.println("STATE poll failed"); return; }
  j += 10;
  String a = r.substring(j, r.indexOf('"', j));
  Serial.printf("STATE aircon=%s\n", a.c_str());
  setLed(a == "ON");
}

void setup() {
  Serial.begin(115200);
  pinMode(PIR_PIN, INPUT); pinMode(LED_PIN, OUTPUT);
  WiFi.begin("Wokwi-GUEST", "", 6);
  while (WiFi.status() != WL_CONNECTED) delay(100);
  Serial.println("WiFi connected");
  postSensor(false);
  pollState();
}

void loop() {
  bool pir = digitalRead(PIR_PIN);
  if (pir && !lastPir && (lastMotion == 0 || millis() - lastMotion > 10000)) { // debounce 10 s
    lastMotion = millis();
    Serial.println("PIR motion");
    postSensor(true);
    pollState(); // show the LED turn back on right away
  }
  lastPir = pir;
  if (millis() - lastPost > 60000) postSensor(pir);
  if (millis() - lastPoll > 15000) pollState();
  delay(50);
}
