const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const sources = [], gains = [], decoders = [];
class AudioContext {
   constructor() { this.currentTime = 0; }
   createGain() { const gain = {gain: {}, connect() {}, disconnect() {this.disconnected = true;}}; gains.push(gain); return gain; }
   createBuffer() { return {copyToChannel() {}}; }
   createBufferSource() {
      const source = {connect(gain) {this.gain = gain;}, disconnect() {}, start() {}, stop() {this.stopped = true;}};
      sources.push(source); return source;
   }
}
class AudioDecoder {
   constructor(options) { this.options = options; this.decodeQueueSize = 0; this.calls = 0; decoders.push(this); }
   configure() {}
   close() {this.closed = true;}
   decode(chunk) {
      this.calls++;
      this.options.output({timestamp: chunk.timestamp, numberOfFrames: 320, sampleRate: 16000, copyTo() {}, close() {}});
   }
}
const socket = {readyState: 1};
const ctx = {AudioContext, AudioDecoder, EncodedAudioChunk: class {constructor(options) {Object.assign(this, options);}},
   window: {webui_inits: [], socket}, document: {addEventListener() {}}, console,
   $: () => ({val: () => 1, change() {}, click() {}}), socket,
   active_vfo: 'A', mediaRoom: '#one',
   mediaRoomMatches(channel) {return channel.room === ctx.mediaRoom && channel.joined;},
   activeVfoId() {return ctx.active_vfo;}, vfoLetterToId(letter) {return letter.charCodeAt(0) - 65;},
   mediaChannels: {one: {uuid: 'one', room: '#one', joined: true, subscribed: true, dir: 0, vfo: 0, codec: 'g722'},
      two: {uuid: 'two', room: '#two', joined: true, subscribed: true, dir: 0, vfo: 0, codec: 'g722'}}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('www/js/webui.audio.js', 'utf8'), ctx);
const packet = new ArrayBuffer(160);
ctx.playAudioPacket(packet, 'g722', ctx.mediaChannels.one);
ctx.playAudioPacket(packet, 'g722', ctx.mediaChannels.two);
assert.equal(decoders.length, 2, 'same codec on different channels has independent state');
assert.equal(sources[0].gain.gain.value, 1);
assert.equal(sources[1].gain.gain.value, 0);
ctx.mediaRoom = '#two'; ctx.webui_sync_rx_routes();
assert.equal(sources[0].gain.gain.value, 0, 'queued audio mutes immediately');
assert.equal(sources[1].gain.gain.value, 1);
ctx.playAudioPacket(packet, 'g722', ctx.mediaChannels.one);
ctx.playAudioPacket(packet, 'g722', ctx.mediaChannels.two);
assert.equal(decoders.length, 2);
assert(decoders.every(decoder => decoder.calls === 2 && !decoder.closed));
assert(sources.every(source => !source.stopped), 'tab changes never stop playback');
ctx.webui_reset_rx_route('one');
assert(!sources[1].stopped && !sources[3].stopped, 'background discontinuity cannot flush active audio');
ctx.mediaChannels.one.subscribed = false; ctx.webui_sync_rx_routes();
assert(decoders[0].closed && !decoders[1].closed);
ctx.mediaChannels.two.codec = 'opus'; ctx.webui_sync_rx_routes();
assert(decoders[1].closed, 'codec replacement releases only the changed decoder');
ctx.playAudioPacket(packet, 'opus', ctx.mediaChannels.two);
assert.equal(decoders.length, 3);
console.log('PASS: per-channel browser decoders keep decoding muted audio; tab gains switch without stop/reset and cleanup is scoped');
