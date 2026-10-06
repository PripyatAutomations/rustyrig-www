const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ctx = {
   auth_user: "alice", auth_privs: "view,chat", webui_is_staff: value => value.split(",").some(p => ["owner","admin"].includes(p)),
   UserCache: {get_all: () => [{name: 'alice'}, {name: 'bob'}]},
   mediaChannels: {'rx-a': {name: 'rig0.vfo_a.rx', subsystem: 1, dir: 0, subscribed: true}, 'rx-b': {name: 'rig1.vfo_a.rx', subscribed: false}},
   mediaLastList: ['rx-a', 'rx-b']
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('www/js/webui.chat.completion.js', 'utf8'), ctx);
function candidates(line) { return Array.from(ctx.chat_parameter_candidates(line) || []); }
assert.deepEqual(candidates('/sercom at'), ['ATTACH']);
assert.deepEqual(candidates('/sercom di'), ['DISCONNECT']);
assert.deepEqual(candidates('/whois a'), ['alice']);
assert.deepEqual(candidates('/whois alice a'), []);
assert.deepEqual(candidates('/quota SET alice '), []);
assert.deepEqual(candidates('/quota SHOW a'), ['alice']);
assert.deepEqual(candidates('/media SUB '), ['rig0.vfo_a.rx', 'rig1.vfo_a.rx']);
assert.deepEqual(candidates('/media SUB rig0'), ['rig0.vfo_a.rx']);
assert.deepEqual(candidates('/media SUB #'), ['#1', '#2']);
assert.deepEqual(candidates('/media UNSUB rx-'), ['rx-a']);
assert.deepEqual(candidates('/media SUB rx-a '), []);
assert.deepEqual(candidates('/rxcodec NONE rig0'), ['rig0.vfo_a.rx']);
assert.deepEqual(candidates('/txcodec NONE rig0'), []);
assert.deepEqual(candidates('/syslog of'), ['off']);
assert.deepEqual(candidates('/room re'), ['REMOVE']);
assert.deepEqual(candidates('/room add '), ['#']);
assert.deepEqual(candidates('/room remove #test --f'), ['--force']);
assert.deepEqual(candidates('/room remove #test -f --h'), ['--history']);

assert.deepEqual(candidates('/user '), ['PASS']);
assert.deepEqual(candidates('/user PASS '), ['alice']);
ctx.auth_privs = 'owner';
assert(candidates('/user ').includes('RESETPW'));
assert.deepEqual(candidates('/user PASS '), ['alice','bob']);
console.log('PASS: browser command parameter completion parity');
