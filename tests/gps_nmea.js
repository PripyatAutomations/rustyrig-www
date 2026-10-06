const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('www/js/webui.audio.framing.js', 'utf8'), ctx);
function frame(lat = 381234567, lon = -807654321, flags = 3, rig = 0) {
   const payload = new Uint8Array(9), view = new DataView(payload.buffer);
   view.setInt32(0, lat, false); view.setInt32(4, lon, false); payload[8] = flags;
   return {subsystem: 4, codec: 'gpsp', dir: 0, vfo: 255, rig, stream: 1, payload};
}
const utc = new Date(Date.UTC(2026, 9, 6, 12, 35, 19));
const sentence = ctx.binframe_gps_position(frame(), utc);
assert.match(sentence, /^\$GPRMC,123519,A,3807\.407402,N,08045\.925926,W,0\.0,,061026,,,M\*[0-9A-F]{2}$/);
let checksum = 0;
for (const c of sentence.slice(1, sentence.indexOf('*'))) checksum ^= c.charCodeAt(0);
assert.equal(sentence.slice(-2), checksum.toString(16).toUpperCase().padStart(2, '0'));
assert.match(ctx.binframe_gps_position(frame(0, 0, 0), utc), /^\$GPRMC,123519,V,,,,,0\.0,,061026,,,N\*/);
assert.equal(ctx.binframe_gps_position({...frame(), dir: 1}, utc), null);
assert.equal(ctx.binframe_gps_position({...frame(), codec: 'nmea'}, utc), null);
assert.equal(ctx.binframe_gps_position({...frame(), stream: 0}, utc), null);
assert.equal(ctx.binframe_gps_position(frame(900000001, 0, 1), utc), null);
assert.equal(ctx.binframe_gps_position(frame(0, 0, 4), utc), null);
assert.equal(ctx.binframe_gps_position({...frame(), payload: new Uint8Array(8)}, utc), null);
console.log('PASS: browser gpsp position validation and synthesized RMC/checksum');

const raw = {...frame(), codec: 'nmea', payload: new TextEncoder().encode('$GPGLL*50')};
assert.equal(ctx.binframe_gps_nmea(raw), '$GPGLL*50');
assert.equal(ctx.binframe_gps_nmea({...raw, dir: 1}), null);
assert.equal(ctx.binframe_gps_nmea({...raw, payload: new TextEncoder().encode('$GPGLL*00')}), null);
