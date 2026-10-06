const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const sent = [], displayed = [];
const ctx = {console, mediaChannels: {gps: {uuid: 'gps', name: 'rig0.gps.rx', codec: 'gpsp'}},
   socket: {readyState: 1, send: text => sent.push(JSON.parse(text))}, WebSocket: {OPEN: 1},
   ChatBox: {Append: value => displayed.push(value)}, $: () => ({text: value => value}),
   subscribeMediaChannel: uuid => sent.push({subscribe: uuid}),
   unsubscribeMediaChannel: uuid => sent.push({unsubscribe: uuid})};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('www/js/webui.objects.js', 'utf8'), ctx);
ctx.rrRigCommand(['rig', 'list']);
assert.equal(sent[0].object.cmd, 'inventory');
ctx.rrInventoryMessage({object: {cmd: 'inventory-entry'}, request: {id: sent[0].request.id},
   inventory: {kind: 'vfo', name: 'A', depth: 2, uuid: 'vfo-id'}});
assert.equal(displayed[0], '   +- vfo A  uuid=vfo-id');
ctx.rrGpsCommand(['gps', 'subscribe', 'rig0']);
ctx.rrGpsCommand(['gps', 'unsubscribe', 'rig0']);
assert.equal(sent[1].subscribe, 'gps');
assert.equal(sent[2].unsubscribe, 'gps');
assert.equal(ctx.rrInventoryLine({depth: 100}), null);
ctx.rrRigCommand(['rig', 'unsubscribe']);
assert.equal(sent[3].object.cmd, 'unsubscribe');
console.log('PASS: browser tree, discovery correlation, GPS and object subscriptions');
