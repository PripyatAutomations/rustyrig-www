const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const buttons = [];
const boxes = {'#chat-box': {html: '', scrollHeight: 0}, '#chat-input': {html: '', scrollHeight: 0}};
const box = boxes['#chat-box'];
const tabStrip = {append(button) { buttons.push(button); }};
function collection(selector) {
   if (selector && typeof selector === 'object') {
      const element = selector;
      return {
         0: element,
         val(value) { if (value === undefined) return element.html; element.html = value; return this; },
         html(value) {
            if (value === undefined) return element.html;
            element.html = value;
            return this;
         },
         append(value) { element.html += value; return this; },
         empty() { element.html = ''; return this; },
         on(name, selector, callback) { element.handlers = element.handlers || {}; element.handlers[name] = callback; return this; },
         scrollTop() { return this; },
         children() { return {length: 0, slice() { return {remove() {}}; }}; },
         attr(name) { return element.attrs?.[name]; },
         toggleClass(name, active) { element.active = active; return this; }
      };
   }
   if (selector === '#chat-room-tabs button') {
      return {
         each(callback) { buttons.forEach((button, i) => callback.call(button, i, button)); },
         filter(callback) { return {remove() { buttons.splice(0, buttons.length, ...buttons.filter((button, i) => !callback.call(button, i, button))); }}; }
      };
   }
   if (selector === '#chat-room-tabs') return tabStrip;
   if (selector === '#chat-box') return collection(boxes['#chat-box']);
   if (typeof selector === 'string' && boxes[selector]) return collection(boxes[selector]);
   if (selector === '#rig-rx-vol') return {val() { return 1; }};
   if (typeof selector === 'string' && selector.startsWith('<button')) {
      const attrs = {};
      const button = {
         text(value) { this.label = value; return this; },
         attr(name, value) { if (value === undefined) return attrs[name]; attrs[name] = value; return this; },
         on(name, callback) { this.click = callback; return this; },
         toggleClass(name, active) { this.active = active; return this; },
         get attrs() { return attrs; }
      };
      return button;
   }
   throw new Error(`Unexpected selector: ${selector}`);
}
function $(selector) { return collection(selector); }
const context = {console, $, setTimeout() {}, webui_authoritative_room: '#rig', document: {}};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync('www/js/webui.chat.js', 'utf8'), context);
const chat = vm.runInContext('new WebUiChat("#chat-box")', context);
context.ChatBox = chat;
chat.ensure_room('#rig', true);
chat.Append('rig traffic', '#rig');
chat.ensure_room('&channel', true);
chat.Append('channel traffic', '&channel');
chat.SwitchRoom('#rig');
chat.Append('updated rig traffic', '#rig');
assert.equal(box.html, 'rig trafficupdated rig traffic');
chat.SwitchRoom('&channel');
assert.equal(box.html, 'channel traffic');
assert.equal(buttons.length, 2);
context.webui_room_controls = {'#rig': {joined: true}};
context.auth_user = 'alice';
context.auth_token = 'token';
context.msg_timestamp = () => '';
context.user_link = user => user;
context.UserCache = {add() { throw new Error('duplicate JOIN should be ignored'); }};
context.webui_parse_chat_msg({msg: {ts: 1}, talk: {cmd: 'join', user: 'alice', room: '#rig'}});
assert.equal(buttons.length, 2);
chat.SwitchRoom('&channel');
assert.equal(box.html, 'channel traffic');
chat.SwitchRoom('#rig');
assert.equal(box.html, 'rig trafficupdated rig traffic');
console.log('PASS: multiroom chat switches tabs and ignores duplicate joins');

context.webui_authoritative_room = '#nycvny37';
context.webui_rejoin_open_rooms = () => {};
context.webui_parse_chat_msg({talk: {cmd: 'room-list', rooms:
   '#nycvny37 #nycvny37-rig0 #nycvny37-rig1 #rplywv00 #rplywv00-rig0 #rplywv00-rig1 #nycvny370-rig0'}});
assert.deepEqual(Array.from(vm.runInContext('webui_available_rooms', context)),
   ['#nycvny37', '#nycvny37-rig0', '#nycvny37-rig1', '#rplywv00', '#rplywv00-rig0', '#rplywv00-rig1', '#nycvny370-rig0']);
console.log('PASS: room-list preserves all rooms returned by the server');

context.webui_parse_chat_msg({talk: {cmd: 'room-list', rooms: '#local #remote',
   'remote-rooms': '#remote', servers: 'local ↗remote'}});
assert.deepEqual(Array.from(vm.runInContext('webui_available_rooms', context)), ['#local', '#remote']);
assert(chat.rooms['#nycvny37'].includes('Servers (↗ remote): local ↗remote'));
assert(chat.rooms['#nycvny37'].includes('data-room="#local">#local</a> ↗'));
console.log('PASS: remote LIST markers preserve plain completion targets');
context.webui_parse_chat_msg({msg: {}, talk: {cmd: 'msg', msg_type: 'notice',
   target: '#rig', from: '***SERVER***', data: 'CALL@remote <script>'}});
assert(box.html.includes('CALL@remote &lt;script&gt;'));
assert(!box.html.includes('CALL@remote <script>'));
console.log('PASS: /users notices appear in issuing room and escape user text');

const linked = context.chat_room_links('<div title="a>#attribute">See #remote-rig0, #room. &#123; ' +
   '<a href="https://example/#fragment">https://example/#fragment</a> ' +
   '<a href="#" class="user">#callsign</a></div>');
assert(linked.includes('data-room="#remote-rig0">#remote-rig0</a>,'));
assert(linked.includes('data-room="#room">#room</a>.'));
assert(linked.includes('title="a>#attribute"'));
assert(linked.includes('&#123;'));
assert(!linked.includes('data-room="#fragment"'));
assert(!linked.includes('data-room="#callsign"'));
const sent = [];
context.socket = {id: 'this-window-connection'};
context.rrSendMessage = (socket, message) => sent.push({socket, message});
chat.ActivateRoom('#RIG');
assert.equal(chat.current_room, '#rig');
assert.equal(sent.length, 0);
boxes['#chat-input'].html = 'unfinished draft';
chat.ActivateRoom('#remote-rig0');
assert.equal(sent[0].socket, context.socket);
assert.equal(sent[0].message.talk.target, '#remote-rig0');
assert.equal(sent[0].message.talk.cmd, 'join');
assert.equal(boxes['#chat-input'].html, 'unfinished draft');
chat.ActivateRoom('#remote /quit');
assert.equal(sent.length, 1);
console.log('PASS: room links select existing tabs or join through this connection without touching drafts');

let prevented = false;
const click = {preventDefault() { prevented = true; },
   currentTarget: {getAttribute() { return '#clicked-room'; }}};
context.getSelection = () => 'selected transcript';
box.handlers.click(click);
assert(prevented);
assert.equal(sent.length, 1);
context.getSelection = () => '';
box.handlers.click(click);
assert.equal(sent.length, 2);
assert.equal(sent[1].message.talk.target, '#clicked-room');
console.log('PASS: delegated room clicks retain selection and activate unselected links');
