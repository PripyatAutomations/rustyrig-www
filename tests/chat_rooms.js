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
