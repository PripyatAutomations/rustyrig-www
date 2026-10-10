const assert = require('node:assert/strict');
const fs = require('node:fs');
const {rrWireEncode, rrWireDecode} = require('../js/webui.wire.js');
const vectors = fs.readFileSync('librrprotocol/tests/wire-vectors.jsonl', 'utf8').trim().split('\n');
for (const line of vectors) {
   const vector = JSON.parse(line);
   if (vector.reject) {
      assert.equal(rrWireDecode(vector.reject), null, vector.reject);
   } else {
      const internal = JSON.parse(vector.internal);
      assert.deepEqual(rrWireDecode(vector.wire), internal);
      const encoded = rrWireEncode(internal);
      assert(encoded && Buffer.byteLength(encoded) < Buffer.byteLength(vector.internal));
      assert.deepEqual(JSON.parse(encoded), JSON.parse(vector.wire));
   }
}
assert.equal(rrWireEncode(null), null);
assert.equal(rrWireDecode(null), null);
for (const value of [NaN, Infinity, 9007199254740992, '\0', '\ud800'])
   assert.equal(rrWireEncode({msg: {type: 'property'}, property: {cmd: 'set', value}}), null);
assert.equal(rrWireDecode(' '.repeat(65536)), null);
console.log(`PASS: ${vectors.length} shared browser wire vectors, legacy rejection and limits`);
