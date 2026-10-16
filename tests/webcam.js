const assert = require('assert');
const fs = require('fs'), vm = require('vm');
const sent = [], revoked = [];
let url = 0;
class Element {
   constructor(tag) { this.tag = tag; this.children = []; this.style = {}; this.options = []; this.value = ''; }
   append(...children) { this.children.push(...children); }
   add(option) { this.options.push(option); if (this.options.length === 1) this.value = option.value; }
   setAttribute() {}
   addEventListener(name, callback) { this[name] = callback; }
   showModal() { this.open = true; }
   remove() { this.removed = true; }
}
const context = {console, Blob, Object, Option: function(text, value) { this.text = text; this.value = value; },
   document: {createElement: tag => new Element(tag), body: new Element('body')},
   URL: {createObjectURL: () => 'frame:' + ++url, revokeObjectURL: value => revoked.push(value)},
   window: {webui_inits: []}, rrSendMessage: (socket, message) => sent.push(message),
   socket: {readyState: 1}, WebSocket: {OPEN: 1}};
context.window.socket = context.socket;
vm.createContext(context);
vm.runInContext(fs.readFileSync('www/js/webui.media.js', 'utf8'), context);
context.mediaChannels.camera = {uuid: 'camera', subsystem: 2, dir: 0, stream: 3, codec: 'h264', subscribed: true,
   profiles: 'h264.1 h264.5 jpeg.1 jpeg.5 jpeg.10'};
context.mediaWebcam();
assert.equal(sent[0].media.profile, 'jpeg.1');
assert.equal(context.mediaVideo.dialog.children[2].options.length, 3);
const frame = {subsystem: 2, dir: 0, stream: 3, codec: 'jpeg', payload_len: 4, payload: Uint8Array.of(255,216,255,217)};
assert(context.mediaVideoFrame(frame));
assert.equal(context.mediaVideo.image.src, 'frame:1');
context.mediaVideoFrame({...frame, stream: 99});
assert.equal(url, 1);
context.mediaVideoFrame(frame);
assert.deepEqual(revoked, ['frame:1']);
context.mediaWebcam(false);
assert.equal(context.mediaVideo, null);
assert.equal(sent.at(-1).media.cmd, 'unsubscribe');
context.mediaVideoFrame(frame);
assert.equal(context.mediaVideo, null);
assert.deepEqual(revoked, ['frame:1', 'frame:2']);
console.log('PASS: browser webcam uses advertised JPEG profiles, checks subscriptions and releases frame URLs on close');
