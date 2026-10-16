// Exported-share browser. PARITY: rrclient/files.c and gtk/gtk.files.c.
const rrFilePending = new Map();
let rrFileSequence = 0, rrFileDialog = null, rrFileBusy = false;
function rrFileMessage(message) {
   if (message.msg?.type !== 'file') return false;
   const pending = rrFilePending.get(message.request?.id);
   if (!pending) return true;
   if (message.file?.cmd === 'entry') { pending.rows.push(message.file); return true; }
   clearTimeout(pending.timer); rrFilePending.delete(message.request.id);
   if (message.file?.error) pending.reject(new Error(message.file.error));
   else pending.resolve(message.file?.cmd === 'end' ? pending.rows : message.file);
   return true;
}
function rrFilesDisconnected() {
   for(const pending of rrFilePending.values()){clearTimeout(pending.timer);pending.reject(new Error('Disconnected'));}
   rrFilePending.clear(); if(rrFileDialog)rrFileDialog.close();
}
function rrFileRequest(command, path, extra = {}) {
   return new Promise((resolve, reject) => {
      if (!socket || socket.readyState !== 1) { reject(new Error('Connect to a RustyRig server first.')); return; }
      const id = 'files-' + (++rrFileSequence);
      const timer = setTimeout(() => { rrFilePending.delete(id); reject(new Error('File request timed out.')); }, 30000);
      rrFilePending.set(id, {resolve, reject, rows: [], timer});
      try { rrSendMessage(socket, {msg: {type: 'file'}, file: {cmd: command, path, ...extra}, request: {id}}); }
      catch(error) { clearTimeout(timer); rrFilePending.delete(id); reject(error); }
   });
}
function rrFileEncode(bytes) { let text = ''; for (const byte of bytes) text += String.fromCharCode(byte); return btoa(text); }
function rrFileDecode(text) { return Uint8Array.from(atob(text), c => c.charCodeAt(0)); }
async function rrFileUpload(path, file, overwrite = false) {
   const transport = socket;
   await rrFileRequest('begin', path, {overwrite});
   try {
      for (let offset = 0; offset < file.size; offset += 24576) {
         if(socket !== transport) throw new Error("Disconnected");
         const bytes = new Uint8Array(await file.slice(offset, offset + 24576).arrayBuffer());
         if(socket !== transport) throw new Error("Disconnected");
         await rrFileRequest('chunk', path, {offset, data: rrFileEncode(bytes)});
      }
      if(socket !== transport) throw new Error('Disconnected');
      await rrFileRequest('commit', path);
   } catch (error) { if(socket === transport)rrFileRequest('cancel', path).catch(() => {}); throw error; }
}
async function rrFileDownload(path, receive) {
   const transport = socket;
   let offset = 0;
   for (;;) {
      if(socket !== transport) throw new Error('Disconnected');
      const reply = await rrFileRequest('read', path, {offset}), bytes = rrFileDecode(reply.data || '');
      if (reply.offset !== offset || bytes.length > 24576) throw new Error('Invalid download offset or chunk.');
      await receive(bytes); offset += bytes.length;
      if (reply.eof) return;
      if (!bytes.length) throw new Error('Empty download chunk.');
   }
}
function rrFilesOpen() {
   if (rrFileDialog) { rrFileDialog.focus(); return; }
   const dialog = document.createElement('dialog'); rrFileDialog = dialog;
   dialog.style.cssText = 'width:min(900px,90vw);height:75vh;';
   const title = document.createElement('h3'); title.textContent = 'Server Files'; dialog.append(title);
   const status = document.createElement('p'), toolbar = document.createElement('div'), tree = document.createElement('div');
   tree.style.cssText = 'overflow:auto;max-height:55vh;';
   dialog.append(toolbar, tree, status); let selected = null;
   const join = (base, name) => (base === '/' ? '' : base) + '/' + name;
   async function load(container, path) {
      const rows = await rrFileRequest('list', path); container.replaceChildren();
      rows.sort((a, b) => (b.kind === 'directory') - (a.kind === 'directory') || a.name.localeCompare(b.name, undefined, {numeric: true, sensitivity: 'base'}));
      for (const row of rows) {
         const full = join(path, row.name), directory = row.kind === 'directory';
         const node = document.createElement(directory ? 'details' : 'div'), label = document.createElement(directory ? 'summary' : 'button');
         node.style.marginLeft = '20px'; label.textContent = row.name + (directory ? '/' : ' (' + row.size + ' bytes)') + ' · ' + (row.writable ? 'read/write' : 'read-only');
         label.onclick = () => { selected = {...row, path: full}; status.textContent = full; };
         node.append(label);
         if (directory) {
            const children = document.createElement('div'); node.append(children); let loaded = false;
            node.ontoggle = async () => { if (node.open && !loaded) { try { await load(children, full); loaded = true; } catch (error) { status.textContent = error.message; } } };
         }
         container.append(node);
      }
   }
   async function refresh() { selected = null; await load(tree, '/'); }
   function button(label, action) {
      const b = document.createElement('button'); b.textContent = label; toolbar.append(b);
      b.onclick = async () => {
         if (rrFileBusy) { status.textContent = 'Wait for the current file operation.'; return; }
         rrFileBusy = true;
         try { await action(); } catch (error) { status.textContent = error.message; }
         finally { rrFileBusy = false; }
      };
   }
   function requireSelection(directory, write = false) {
      if (!selected || (directory !== null && (selected.kind === 'directory') !== directory) || (write && !selected.writable)) throw new Error('Select an accessible ' + (directory ? 'directory' : 'file') + '.');
      return selected;
   }
   button('Upload', async () => {
      const row = requireSelection(true, true), input = document.createElement('input'); input.type = 'file';
      const file = await new Promise(resolve => { input.onchange = () => resolve(input.files[0]); input.oncancel = () => resolve(null); input.click(); });
      if (!file) return; status.textContent = 'Uploading…'; await rrFileUpload(join(row.path, file.name), file); await refresh(); status.textContent = 'Upload complete';
   });
   button('Download', async () => {
      const row = requireSelection(false); status.textContent = 'Downloading…';
      if (window.showSaveFilePicker) {
         const handle = await window.showSaveFilePicker({suggestedName: row.name}), output = await handle.createWritable();
         try { await rrFileDownload(row.path, bytes => output.write(bytes)); await output.close(); } catch (error) { await output.abort(); throw error; }
      } else {
         if (row.size > 268435456) throw new Error('Use the native client to download files over 256 MiB in this browser.');
         const chunks = []; let total = 0; await rrFileDownload(row.path, bytes => { total += bytes.length; if(total > 268435456) throw new Error('Browser download limit reached.'); chunks.push(bytes); });
         const url = URL.createObjectURL(new Blob(chunks)), a = document.createElement('a'); a.href = url; a.download = row.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
      status.textContent = 'Download complete';
   });
   button('Rename', async () => { const row = requireSelection(null, true), name = prompt('New name', row.name); if (!name) return; if (name.includes('/') || name === '.' || name === '..') throw new Error('Enter a single filename.'); await rrFileRequest('rename', row.path, {dest: join(row.path.slice(0, row.path.lastIndexOf('/')) || '/', name)}); await refresh(); });
   button('Move', async () => { const row = requireSelection(null, true), dest = prompt('Destination virtual path', row.path); if (dest && dest !== row.path) { await rrFileRequest('rename', row.path, {dest}); await refresh(); } });
   button('Delete', async () => { const row = requireSelection(null, true); if (confirm('Delete ' + row.path + '? Directories must be empty.')) { await rrFileRequest('delete', row.path); await refresh(); } });
   button('New directory', async () => { const row = requireSelection(true, true), name = prompt('Directory name'); if(name) { await rrFileRequest('mkdir', join(row.path, name)); await refresh(); } });
   button('Edit', async () => {
      const row = requireSelection(false, true); if(row.size > 1048576) throw new Error('Edit is limited to UTF-8 text files up to 1 MiB.');
      const chunks = []; let total = 0; await rrFileDownload(row.path, bytes => { total += bytes.length; if(total > 1048576) throw new Error('File grew beyond the editor limit.'); chunks.push(bytes); });
      const bytes = new Uint8Array(total); let offset = 0; for(const part of chunks) { bytes.set(part, offset); offset += part.length; }
      if(bytes.includes(0)) throw new Error('Binary files cannot be edited as text.');
      const editor = document.createElement('dialog'), text = document.createElement('textarea'), save = document.createElement('button'), close = document.createElement('button'), result = document.createElement('p');
      const heading = document.createElement('p'); heading.textContent = row.path;
      text.value = new TextDecoder('utf-8', {fatal: true}).decode(bytes); const original = text.value;
      text.style.cssText = 'width:75vw;height:60vh;font-family:monospace;'; save.textContent = 'Save'; close.textContent = 'Close';
      save.onclick = async () => { if(rrFileBusy)return; rrFileBusy = true; try { await rrFileUpload(row.path, new Blob([text.value]), true); result.textContent = 'Saved'; } catch(error) { result.textContent = error.message; } finally { rrFileBusy = false; } };
      close.onclick = () => { if(text.value === original || confirm('Close the editor? Unsaved changes will be lost.')) editor.close(); };
      editor.append(heading, text, save, close, result); editor.onclose = () => editor.remove(); document.body.append(editor); editor.showModal();
   });
   button('Refresh', refresh); button('Close', async () => dialog.close());
   dialog.onclose = () => { dialog.remove(); rrFileDialog = null; };
   document.body.append(dialog); dialog.showModal(); refresh().catch(error => { status.textContent = error.message; });
}
