const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const sent = [], displayed = [], destinations = [];
const ctx = {console, mediaChannels: {gps: {uuid: 'gps', name: 'rig0.gps.rx', codec: 'gpsp'}},
   socket: {readyState: 1, send: text => sent.push(JSON.parse(text))}, WebSocket: {OPEN: 1},
   ChatBox: {current_room: "#first", Append: (value,room) => { displayed.push(value); destinations.push(room); }}, $: () => ({text: value => value}),
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

ctx.ChatBox.current_room = '#second';
ctx.rrRigCommand(['rig', 'list']);
const secondId = sent.at(-1).request.id;
ctx.ChatBox.current_room = '#third';
for (const [id, room] of [[sent[0].request.id, '#first'], [secondId, '#second']]) {
   ctx.rrInventoryMessage({object: {cmd: 'inventory-entry'}, request: {id}, inventory: {depth: 0, name: room}});
   assert.equal(destinations.at(-1), room);
   ctx.rrInventoryMessage({object: {cmd: 'inventory-end'}, request: {id}});
   assert.equal(destinations.at(-1), room);
}
const count = displayed.length;
ctx.rrInventoryMessage({object: {cmd: 'inventory-entry'}, request: {id: secondId}, inventory: {name: 'late'}});
assert.equal(displayed.length, count);
ctx.rrObjectsList();
assert.equal(destinations.at(-1), '#third');
ctx.rrRigCommand(['rig', 'invalid']);
assert.equal(destinations.at(-1), '#third');
ctx.rrGpsCommand(['gps', 'invalid']);
assert.equal(destinations.at(-1), '#third');
console.log('PASS: issuing room retained for concurrent and delayed inventory replies');
