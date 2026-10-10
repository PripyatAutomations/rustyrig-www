const assert = require('node:assert/strict');
const fs = require('node:fs');
const {rrWireEncode, rrWireDecode, rrSendMessage, rrSendBinary, rrObserveAck} = require('../js/webui.wire.js');
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
assert.equal(rrWireEncode({msg: {type: 'auth'}, auth: {cmd: 'error', error: 'alias'}}), null);
assert.equal(rrWireEncode(null), null);
assert.equal(rrWireDecode(null), null);
for (const value of [NaN, Infinity, 9007199254740992, '\0', '\ud800'])
   assert.equal(rrWireEncode({msg: {type: 'property'}, property: {cmd: 'set', value}}), null);
assert.equal(rrWireDecode(' '.repeat(65536)), null);
console.log(`PASS: ${vectors.length} shared browser wire vectors, legacy rejection and limits`);

const outgoing = [];
const sock = {readyState: 1, bufferedAmount: 0, send: frame => outgoing.push(frame)};
assert(rrSendMessage(sock, {msg: {type: 'object'}, object: {cmd: 'snapshot'}, request: {id: 'rtt'}}));
assert.equal(rrObserveAck(sock, {request: {id: 'unrelated'}}), null);
assert(rrObserveAck(sock, {request: {id: 'rtt'}}) >= 0);
assert.equal(rrObserveAck(sock, {request: {id: 'rtt'}}), null);
sock.bufferedAmount = 8192;
assert.equal(rrSendBinary(sock, new ArrayBuffer(32)), false);
assert.equal(outgoing.length, 1);
sock.bufferedAmount = 1048576;
assert.equal(rrSendMessage(sock, {msg: {type: 'notice'}, notice: {msg: 'unsent'}}), false);
assert.equal(outgoing.length, 1);
sock.bufferedAmount = 0;
assert(rrSendMessage(sock, {msg: {type: 'notice'}, notice: {msg: 'recovered'}}));
assert.equal(outgoing.length, 2);
console.log('PASS: bounded browser sends, slow-peer recovery and correlated RTT without extra wire fields');
