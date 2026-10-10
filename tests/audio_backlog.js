const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const nodes = [];
class AudioContext {
   constructor() { this.currentTime = 0; }
   createGain() { return {gain: {}, connect() {}}; }
   createBuffer() { return {copyToChannel() {}}; }
   createBufferSource() {
      const node = {connect() {}, disconnect() {}, start(time) {this.time = time;}, stop() {this.stopped = true;}};
      nodes.push(node); return node;
   }
}
const ctx = {AudioContext, window: {webui_inits: []}, document: {addEventListener() {}},
   console, $: () => ({val: () => 1, change() {}, click() {}}), socket: {readyState: 1}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('www/js/webui.audio.js', 'utf8'), ctx);
for (let i = 0; i < 20; i++) ctx.playFloat32Samples(new Float32Array(320), 16000);
assert(nodes.some(node => node.stopped), 'burst playback must discard stale scheduled audio');
assert(nodes.at(-1).time < 0.3, 'backlog must stay bounded');
ctx.stopPlayback();
assert(nodes.every(node => node.stopped), 'disconnect stops all scheduled sources');
const count = nodes.length;
ctx.socket.readyState = 3;
ctx.playFloat32Samples(new Float32Array(320), 16000);
assert.equal(nodes.length, count, 'late decoder output cannot play while disconnected');
ctx.socket.readyState = 1;
ctx.playFloat32Samples(new Float32Array(320), 16000);
assert.equal(nodes.at(-1).time, 0.075, 'recovery begins with a fresh jitter buffer');
ctx.AudioDecoder = class { constructor(options) { this.output = options.output; } };
const decoder = ctx.webui_make_audio_decoder('Opus', () => {});
ctx.audio_opus_timestamp = 20000;
ctx.stopPlayback();
const previous = nodes.length;
let closed = false;
decoder.output({timestamp: 0, close() {closed = true;}});
assert(closed && nodes.length === previous, 'old queued decoder output stays discarded after reconnect');
decoder.output({timestamp: 20000, numberOfFrames: 320, sampleRate: 16000,
   copyTo() {}, close() {}});
assert.equal(nodes.length, previous + 1, 'fresh output recovers after decoder invalidation');
console.log('PASS: bounded playback backlog, disconnect cancellation and fresh recovery');
