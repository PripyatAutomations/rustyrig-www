const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const sent = [];
const socket = {readyState: 1, send: text => sent.push(JSON.parse(text).media)};
const ctx = {window: {socket, webui_inits: []}, socket, WebSocket: {OPEN: 1}, console: {log() {}},
   active_vfo: 'A'};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('www/js/webui.media.js', 'utf8'), ctx);
ctx.mediaReady = true;
function announce(uuid, room, joined, rig = 0) {
   ctx.webui_parse_media_msg({media: {cmd: 'available', 'chan-uuid': uuid,
      subsys: 1, dir: 0, vfo: 0, rig, room, joined, codec: 'pc16'}});
}
announce('rig0-rx', '#rig0', false);
announce('rig1-rx', '#rig1', false, 1);
assert.equal(sent.length, 0);
ctx.mediaJoinRoom('#rig0');
announce('rig0-rx', '#rig0', true);
assert.deepEqual(sent, [{cmd: 'subscribe', 'chan-uuid': 'rig0-rx'}]);
announce('rig0-rx', '#rig0', true);
assert.equal(sent.length, 1); // repeated metadata must not resubscribe
ctx.mediaJoinRoom('#rig1');
announce('rig1-rx', '#rig1', true, 1);
assert.equal(ctx.mediaChannels['rig0-rx'].subscribed, false);
assert.equal(ctx.mediaChannels['rig1-rx'].subscribed, true);
ctx.webui_parse_media_msg({media: {cmd: 'subscribed', 'chan-uuid': 'rig0-rx', stream: 1}});
assert.equal(ctx.mediaChannels['rig0-rx'].subscribed, false);
ctx.mediaPartRoom('#rig1');
assert.equal(ctx.mediaChannels['rig1-rx'].subscribed, false);
ctx.webui_parse_media_msg({media: {cmd: 'subscribed', 'chan-uuid': 'rig1-rx', stream: 2}});
assert.equal(ctx.mediaChannels['rig1-rx'].subscribed, false); // stale acknowledgement
ctx.mediaSelectRoom('#rig0');
assert.equal(ctx.mediaChannels['rig0-rx'].subscribed, true);
console.log('PASS: browser lobby, joined rig rooms, switching, PART, and stale acknowledgements');
ctx.webui_room_controls = {
   '#site-rig0': {joined: true, vfoMask: 3, tx: true},
   '#site-rig0.monitor': {joined: true, vfoMask: 2, tx: false, tuningMask: 2},
   '#site-rig0.listen': {joined: true, vfoMask: 1, tx: false},
};
ctx.webui_parse_media_msg({media: {cmd: 'available', 'chan-uuid': 'rx-b',
   subsys: 1, dir: 0, vfo: 1, rig: 0, room: '#site-rig0',
   'control-room': '#site-rig0', joined: true, codec: 'pc16'}});
ctx.mediaSelectRoom('#site-rig0.monitor');
assert.equal(ctx.active_vfo, 'B');
assert.equal(ctx.mediaChannels['rx-b'].room, '#site-rig0.monitor');
assert.equal(ctx.mediaChannels['rx-b'].subscribed, true);
ctx.webui_parse_media_msg({media: {cmd: 'available', 'chan-uuid': 'rx-b',
   subsys: 1, dir: 0, vfo: 1, rig: 0, room: '#site-rig0.listen',
   'control-room': '#site-rig0', joined: true, codec: 'pc16'}});
assert.equal(ctx.mediaChannels['rx-b'].room, '#site-rig0.monitor');
ctx.mediaSelectRoom('#site-rig0.listen');
assert.equal(ctx.active_vfo, 'A');
assert.equal(ctx.mediaChannels['rx-b'].joined, false);
assert.equal(ctx.mediaChannels['rx-b'].subscribed, false);
console.log('PASS: mapped RX subrooms select only owned VFOs and preserve the selected view');
