const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('www/js/webui.audio.framing.js', 'utf8'), ctx);
function frame(text, rig = 0) {
   return {subsystem: 4, codec: 'nmea', dir: 0, vfo: 255, rig, stream: 1,
      payload: Uint8Array.from(Buffer.from(text))};
}
assert.equal(ctx.binframe_nmea_sentence(frame('$GPGLL*50\r\n')), '$GPGLL*50');
assert.equal(ctx.binframe_nmea_sentence(frame('$GPGLL*50\r\n', 1)), '$GPGLL*50');
assert.equal(ctx.binframe_nmea_sentence(frame('$GPGLL*00\r\n')), null);
assert.equal(ctx.binframe_nmea_sentence({...frame('$GPGLL*50'), dir: 1}), null);
assert.equal(ctx.binframe_nmea_sentence({...frame('$GPGLL*50'), codec: 'seri'}), null);
assert.equal(ctx.binframe_nmea_sentence(frame('$GPGLL*50\0')), null);
assert.equal(ctx.binframe_nmea_sentence({...frame('$GPGLL*50'), stream: 0}), null);
assert.equal(ctx.binframe_nmea_sentence(frame('$GPGLL*50\r\n$GPGLL*50')), null);
console.log('PASS: browser rig GPS NMEA frames, checksum and direction validation');
