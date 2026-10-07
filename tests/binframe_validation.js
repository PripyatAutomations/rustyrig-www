const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ctx = {ArrayBuffer, DataView, Uint8Array, console: {log() {}}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('www/js/webui.binframe.js', 'utf8'), ctx);
function packet(size = 30, declared = 2) {
   const buf = new ArrayBuffer(size), bytes = new Uint8Array(buf);
   bytes.set([0x52, 0x52, 1, 1, 0x70, 0x63, 0x31, 0x36]);
   new DataView(buf).setUint32(16, declared, false);
   return buf;
}
assert.equal(ctx.binframe_parse(packet()).payload_len, 2);
assert.equal(ctx.binframe_parse(packet(29)), null);
assert.equal(ctx.binframe_parse(packet(31)), null);
assert.equal(ctx.binframe_parse(packet(30, 65508)), null);
console.log('PASS: browser binary frames reject truncated, trailing and oversized payloads');
