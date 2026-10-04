const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
let click, label;
const timers = new Map();
let nextTimer = 0;
const widget = new Proxy({}, {get: (_, method) => (...args) => {
   if (method === 'click') click = args[0];
   if (method === 'html') label = args[0];
   return widget;
}});
const sent = [];
const context = {
   window: {webui_inits: []}, console: {log() {}}, $: () => widget,
   auth_user: 'OPERATOR', webui_authoritative_room: '#site',
   socket: {send: text => sent.push(JSON.parse(text))},
   msg_timestamp: () => '', format_freq: String,
   setTimeout: fn => { const id = ++nextTimer; timers.set(id, fn); return id; },
   clearTimeout: id => timers.delete(id)
};
vm.createContext(context);
for (const file of ['webui.chat.js', 'webui.rigctl.js'])
   vm.runInContext(fs.readFileSync('www/js/' + file, 'utf8'), context);
vm.runInContext('cul_render = function() {};', context);
context.ptt_btn_init();
click();
assert.equal(label, 'PENDING');
assert.equal(sent[0].cat.ptt, 'true');
function info(user, tx, vfo) {
   context.parse_userinfo_reply({talk: {user, tx, 'ptt-vfo': vfo}});
}
info('OTHER', true, 'A');
assert.equal(context.ptt_pending, true);
info('operator', true, 'B');
assert.equal(context.ptt_pending, true);
info('operator', false, undefined); // stale release while awaiting key-up
assert.equal(context.ptt_pending, true);
info('operator', true, 'A');
assert.equal(context.ptt_pending, false);
assert.equal(context.ptt_active, true);
assert.equal(timers.size, 0);
assert.match(label, /^TX/);
click();
assert.equal(sent[1].cat.ptt, 'false');
assert.equal(context.ptt_pending, true);
info('operator', false, undefined); // releases omit the old VFO on the wire
assert.equal(context.ptt_pending, false);
assert.equal(context.ptt_active, false);
// Command acknowledgements must identify the requested VFO too.
click();
context.webui_parse_cat_msg({cat: {cmd: 'ptt', user: 'operator', vfo: 'B', ptt: true}});
assert.equal(context.ptt_pending, true);
context.webui_parse_cat_msg({cat: {cmd: 'ptt', user: 'operator', vfo: 'A', ptt: true}});
assert.equal(context.ptt_pending, false);
click();
context.webui_parse_cat_msg({cat: {user: 'operator', state: {vfo: 'A', ptt: false}}});
assert.equal(context.ptt_pending, false);
click();
assert.equal(context.ptt_pending, true);
const expiry = Array.from(timers.values())[0];
expiry();
assert.equal(context.ptt_pending, false);
assert.notEqual(label, 'PENDING');
console.log('PASS: browser PTT userinfo/CAT confirmations, ownership, VFO isolation, and timeout');
