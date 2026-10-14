const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {webcrypto, createHash} = require('node:crypto');
const {rrSendMessage, rrWireDecode} = require('../js/webui.wire.js');
const sha1 = text => createHash('sha1').update(text).digest('hex');
const frames = [];
let completed;
const sent = new Promise(resolve => { completed = resolve; });
const socket = {readyState: 1, bufferedAmount: 0, send(frame) { frames.push(frame); completed(); }};
const ctx = {window: {webui_inits: []}, crypto: webcrypto, TextEncoder, console, socket,
   rrSendMessage, $: selector => { assert.equal(selector, 'input#pass'); return {val: () => 'test-password'}; }};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('www/js/webui.auth.js', 'utf8'), ctx);
ctx.login_user = 'TESTUSER';
(async () => {
   const timeout = setTimeout(() => { console.error('FAIL: no authentication reply'); process.exit(1); }, 3000);
   ctx.webui_parse_auth_msg({auth: {cmd: 'challenge', nonce: 'test-nonce', token: 'session-token'}});
   await sent;
   clearTimeout(timeout);
   assert.equal(frames.length, 1);
   assert.deepEqual(rrWireDecode(frames[0]), {msg: {type: 'auth'}, auth: {
      cmd: 'pass', user: 'TESTUSER', token: 'session-token', pass: sha1(sha1('test-password') + '+test-nonce')
   }});
   assert(!frames[0].includes('test-password'));
   console.log('PASS: browser challenge sends required token and nonce-derived password through wire encoder');
})().catch(error => { console.error(error); process.exit(1); });
