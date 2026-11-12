// Runs selfTest() from apps-script/Code.gs under plain Node (no Google services needed for it).
// Run: node scripts/run-selftest.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = vm.createContext({ console });
for (const f of ['apps-script/Timetable.gs', 'apps-script/Code.gs']) vm.runInContext(readFileSync(f, 'utf8'), ctx, { filename: f });
vm.runInContext('selfTest()', ctx);
