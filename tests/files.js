// Browser transfer engine: real chunking, offsets, errors and disconnect handling.
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
let stored = new Uint8Array(), upload = [], cancel = 0, injectOffset = false;
const context = {console, Map, Promise, Uint8Array, Blob, setTimeout, clearTimeout, window: {},
   btoa: text => Buffer.from(text, 'binary').toString('base64'), atob: text => Buffer.from(text, 'base64').toString('binary'),
   socket: {readyState: 1}, rrSendMessage(socket, message) {
      const file = message.file, id = message.request.id; let response;
      if(file.cmd === 'begin') { upload = []; response = {cmd: 'result'}; }
      else if(file.cmd === 'chunk') {
         assert.equal(file.offset, upload.length);
         const bytes = Buffer.from(file.data, 'base64'); assert(bytes.length <= 24576); upload.push(...bytes); response = {cmd: 'result'};
      } else if(file.cmd === 'commit') { stored = Uint8Array.from(upload); response = {cmd: 'result'}; }
      else if(file.cmd === 'read') {
         const bytes = stored.slice(file.offset, file.offset + 24576);
         response = {cmd: 'data', offset: injectOffset ? file.offset + 1 : file.offset, data: Buffer.from(bytes).toString('base64'), eof: file.offset + bytes.length >= stored.length};
      } else if(file.cmd === 'cancel') { cancel++; response = {cmd: 'result'}; }
      else if(file.cmd === 'delete') response = {cmd: 'result', error: 'Permission denied'};
      else return;
      setImmediate(() => context.rrFileMessage({msg: {type: 'file'}, file: response, request: {id}}));
   }};
vm.createContext(context); vm.runInContext(fs.readFileSync('www/js/webui.files.js','utf8'), context);
(async () => {
   const source = Uint8Array.from({length: 200000}, (_, i) => i % 251);
   await context.rrFileUpload('/share/data.bin', new Blob([source])); assert.deepEqual(stored, source);
   const chunks = []; await context.rrFileDownload('/share/data.bin', bytes => chunks.push(Buffer.from(bytes)));
   assert.deepEqual(Buffer.concat(chunks), Buffer.from(source));
   injectOffset = true; await assert.rejects(context.rrFileDownload('/share/data.bin', () => {}), /offset/); injectOffset = false;
   await assert.rejects(context.rrFileRequest('delete','/share/data.bin'), /Permission denied/);
   const pending = context.rrFileRequest('list','/'); context.rrFilesDisconnected(); await assert.rejects(pending, /Disconnected/);
   assert.equal(vm.runInContext('rrFilePending.size', context), 0);
   console.log('PASS: browser bounded binary upload/download, offsets, errors and disconnected request cleanup');
})().catch(error => {console.error(error);process.exitCode = 1;});
