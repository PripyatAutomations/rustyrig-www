const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const displayed = [];
const destinations = [];
const ctx = {console, ChatBox: {current_room: "commands", Append: (row,room) => { destinations.push(room); displayed.push(typeof row === 'string' ? row : row.value); }},
   $: () => ({val() { return 1; }, change() { return this; }, addClass() { return this; }, text(value) { this.value = value; return this; }})};
ctx.AudioContext = class { createGain() { return {gain: {}, connect() {}}; } };
ctx.window = ctx;ctx.webui_inits = [];ctx.document = {addEventListener() {}};
ctx.socket = {readyState: 1, send() {}};ctx.WebSocket = {OPEN: 1};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('www/js/webui.media.js', 'utf8'), ctx);
vm.runInContext(fs.readFileSync('www/js/webui.objects.js', 'utf8'), ctx);
vm.runInContext(fs.readFileSync('www/js/webui.audio.js', 'utf8'), ctx);
ctx.mediaChannels = {
   'rx-id': {uuid: 'rx-id', name: 'rig0.vfo_a.rx', descr: 'Main receiver', dir: 0, codec: 'opus', subsystem: 1,
      vfo: 0, rig: 0, room: '#station-rig0', joined: true, subscribed: true},
   'gps-id': {uuid: 'gps-id', name: 'station.gps.rx', descr: '<GPS>', dir: 0, codec: 'gpsp', subsystem: 4,
      vfo: 255, rig: 255, room: '#station', joined: false, subscribed: false}
};
ctx.mediaLastList = ['rx-id', 'gps-id'];
assert.equal(ctx.mediaChanLookup('RIG0.VFO_A.RX'), ctx.mediaChannels['rx-id']);
assert.equal(ctx.mediaChanLookup('RX-ID'), ctx.mediaChannels['rx-id']);
assert.equal(ctx.mediaChanLookup('#2'), ctx.mediaChannels['gps-id']);
assert.equal(ctx.mediaChanLookup('2'), ctx.mediaChannels['gps-id']);
assert.equal(ctx.mediaChanLookup('#2junk'), null);
assert.equal(ctx.mediaChanLookup('missing'), null);
const sent = [];ctx.socket.send = text => sent.push(JSON.parse(text));
assert.equal(ctx.webui_audio_set_codec('mu08',false,'RIG0.VFO_A.RX'),true);
assert.equal(sent.length,1);assert.equal(sent[0].media['chan-uuid'],'rx-id');
assert.equal(ctx.webui_audio_set_codec('none',true,'rig0.vfo_a.rx'),false);
assert.equal(ctx.webui_audio_set_codec('none',false,'station.gps.rx'),false);
sent.length=0;
ctx.mediaChannels.duplicate = {...ctx.mediaChannels['rx-id'], uuid: 'duplicate'};
assert.equal(ctx.mediaChanLookup('rig0.vfo_a.rx'), null);
assert.equal(ctx.mediaChanLookup('rx-id'), ctx.mediaChannels['rx-id']);
assert.equal(ctx.webui_audio_set_codec('none',false,'rig0.vfo_a.rx'),false);
assert.equal(ctx.mediaChannels['rx-id'].subscribed,true);
delete ctx.mediaChannels.duplicate;
assert.equal(ctx.webui_audio_set_codec('none',false,'missing'),false);
assert.equal(ctx.mediaChannels['rx-id'].subscribed,true);
ctx.mediaListChannels();
assert(displayed.some(line => line.includes('rig0.vfo_a.rx') && line.includes('Main receiver') && line.includes('room: #station-rig0')));
assert(displayed.some(line => line.includes('<GPS>') && line.includes('[join room first]')));
ctx.rrObjectCache.ready = true;
ctx.rrObjectCache.dump = () => [
   {uuid: 'rig-id', room: '#station-rig0', type: 'rig', alias: 'rig0', name: 'Main transceiver', backend: 'hamlib', properties: []},
   {uuid: 'vfo-id', type: 'vfo', alias: 'A', owner: 'rig-id', properties: [
      {name: 'frequency', descriptor: {unit: 'Hz', writable: true}, state: {known: true, value: 14074000, available: true}}
   ]},
   {uuid: 'other-id', room: '#elsewhere-rig1', type: 'rig', alias: 'rig1', name: 'Other radio', properties: []}
];
displayed.length = 0;
assert(ctx.rrObjectsList('rig0'));
assert(displayed.some(line => line.includes('rig rig0 — Main transceiver / hamlib')));
assert(displayed.some(line => line.includes('vfo rig0.A')));
assert(displayed.some(line => line.includes('frequency: 14074000 Hz [writable]')));
assert(!displayed.some(line => line.includes('Other radio')));
assert(ctx.rrObjectsList('RIG0.A'));
assert(!ctx.rrObjectsList('A'));
console.log('PASS: symbolic media lookup, ambiguity, descriptive listings and scoped object views');
vm.runInContext(fs.readFileSync('www/js/webui.chat.completion.js', 'utf8'), ctx);
let completionLabel;
ctx.$ = () => ({val() { return '/media SUB '; }, text(value) { completionLabel=value; return this; }, show() { return this; }});
ctx.updateCompletionIndicator('rig0.vfo_a.rx');
assert(completionLabel.includes('Main receiver') && completionLabel.includes('RX opus') && completionLabel.includes('#station-rig0'));

assert(destinations.length > 0);
assert(destinations.every(room => room === "commands"));

ctx.$ = () => ({val() { return 1; }, change() { return this; }, addClass() { return this; }, text(value) { this.value=value; return this; }});
ctx.ChatBox.current_room = '#station-rig0.rx';displayed.length=0;
ctx.mediaListChannels();
assert(displayed.some(line => line.includes('Main receiver')));
assert(!displayed.some(line => line.includes('<GPS>')));
displayed.length=0;assert(ctx.rrObjectsList());
assert(displayed.some(line => line.includes('vfo rig0.A')));
assert(!displayed.some(line => line.includes('Other radio')));
ctx.ChatBox.current_room = '#station';displayed.length=0;ctx.mediaListChannels();
assert(displayed.some(line => line.includes('Main receiver')) && displayed.some(line => line.includes('<GPS>')));
ctx.ChatBox.current_room = 'status';displayed.length=0;assert(ctx.rrObjectsList());
assert(displayed.some(line => line.includes('Other radio')));
assert.equal(ctx.mediaResourceMatches('#station-rig1.rx','#station-rig10'),false);
assert.equal(ctx.mediaResourceMatches('#station','#stationary-rig1'),false);
console.log('PASS: site, rig RX room and status resource filters');

ctx.ChatBox.current_room='#station-rig0.rx';
assert(ctx.chat_parameter_candidates('/media SUB ').includes('rig0.vfo_a.rx'));
assert(!ctx.chat_parameter_candidates('/media SUB ').includes('station.gps.rx'));

assert(ctx.chat_parameter_candidates('/object rig').includes('rig0'));
assert.equal(ctx.chat_parameter_candidates('/objects rig'),null);
