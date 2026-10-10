const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const output = [];
const context = {console, auth_user: 'alice', auth_privs: 'view,chat', auth_token: 'token',
   webui_authoritative_room: '#site', msg_timestamp: () => 'time',
   play_notify_bell() {}, set_highlight() {},
   ChatBox: {Append: html => output.push(html), ensure_room() {}, current_room: '#chat'},
   $: () => ({data: () => false, val: () => 1})};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'webui.chat.js'), 'utf8'), context);
assert.equal(context.msg_create_links('<img src=x onerror=evil()>'), '&lt;img src=x onerror=evil()&gt;');
const linked = context.msg_create_links('https://host/?a=1&b=2" onclick="evil() <svg/onload=evil()>');
assert.match(linked, /href="https:\/\/host\/\?a=1&amp;b=2"/);
assert(!linked.includes('<svg'));
assert(!linked.includes(' onclick="evil()'));
for (const msg_type of ['pub', 'action', 'priv', 'privmsg', 'replay-pub', 'replay-action', 'replay-priv']) {
   output.length = 0;
   context.webui_parse_chat_msg({msg:{ts:1}, talk:{cmd:'msg', msg_type, from:'<svg/onload=bad()>',
      target:'#chat', data:'<img src=x onerror=bad()> https://host/ok'}});
   const rendered = output.join('');
   assert(!rendered.includes('<img') && !rendered.includes('<svg'), msg_type);
   assert(rendered.includes('&lt;img') && rendered.includes('href="https://host/ok"'), msg_type);
}
context.webui_parse_chat_msg({msg:{ts:1},talk:{cmd:'whois',username:'<img>',email:'<svg>',ua:'<script>'}});
assert(!output.join('').includes('<script>'));
assert(!context.user_link('x" onclick="evil()').includes('onclick="evil()'));
for (const [privs, staff] of [['view,chat',false],['notadmin',false],['owner',true],['admin,chat',true]]) {
   output.length=0;context.auth_privs=privs;context.webui_show_help();
   const rendered=output.join('');
   assert.equal(rendered.includes('/kick —'),staff);
   assert.equal(rendered.includes('/syslog —'),staff);
   assert(rendered.includes('/user —'));
   assert(!rendered.includes('/ban') && !rendered.includes('/edit'));
   assert(rendered.includes('style="color: #ff0000"><b>Media</b>'));
   assert(rendered.indexOf('<b>Media</b>') < rendered.indexOf('/media —'));
   assert(rendered.indexOf('/media —') < rendered.indexOf('/rxcodec —'));
}
const sent = [];
context.socket = {};
context.chat_history_add = () => {};
context.setTimeout = () => {};
context.rrSendMessage = (_socket, message) => sent.push(message);
context.$ = () => ({val: () => '/quota BW ADD alice 2G', hide() {}, focus() {}});
context.parse_chat_cmd({preventDefault() {}});
assert.equal(sent[0].talk.cmd, 'quota');
assert.equal(sent[0].talk.target, 'BW');
assert.equal(sent[0].talk.data, 'ADD alice 2G');
console.log('PASS: escaped live/replay/private/action chat, links, account data and sectioned privilege-aware help');
