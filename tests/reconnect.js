const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const settings = new Map();
let delay, pending;
const context = {
   window: {webui_inits: [], location: {protocol: 'https:', hostname: 'station', port: '4420'}},
   localStorage: {getItem: key => settings.get(key) || null},
   console: {log() {}}, setTimeout: (fn, ms) => { pending = fn; delay = ms; return 1; },
   wmSwitchTab() {},
   clearTimeout: () => { pending = null; }, clearInterval() {},
   $: () => ({show() {}, hide() {}, prop() {}})
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('www/js/webui.js', 'utf8'), context);
context.ChatBox = {Append() {}};
context.show_connecting = () => {};
function reconnect(expected) {
   vm.runInContext('reconnecting = false; reconnect_tries = 0;', context);
   context.handle_reconnect();
   assert.equal(delay, expected * 1000);
   assert.equal(typeof pending, 'function');
}
reconnect(1);
settings.set('reconnect-interval', '3');
reconnect(3);
settings.set('reconnect-interval:' + context.make_ws_url(), '12');
reconnect(12);
settings.set('reconnect-interval:' + context.make_ws_url(), '');
reconnect(3);
for (const invalid of ['0', '-1', '60', '3601', '1.5', 'garbage']) {
   settings.set('reconnect-interval:' + context.make_ws_url(), invalid);
   reconnect(1);
}
settings.clear();
vm.runInContext('reconnect_tries = 0;', context);
for (const seconds of [1, 2, 4, 8, 16, 32, 60, 60, 60, 60]) {
   vm.runInContext('reconnecting = false;', context);
   context.handle_reconnect();
   assert.equal(delay, seconds * 1000);
}
context.stop_reconnecting();
assert.equal(pending, null);
console.log('PASS: exponential reconnect growth/cap, global/server base delays, legacy defaults and cancellation');
