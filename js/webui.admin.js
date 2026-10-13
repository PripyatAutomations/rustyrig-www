// PARITY: rustyrig-fw/rrclient/gtk/gtk.admin.c quota fields and action prompts.
// PARITY: rrserver/events.c admin_send and rrclient/gtk/gtk.admin.c.
const adminTables = {
   users: ['name', 'enabled', 'permissions', 'email', 'maxsessions', 'password_set', 'password_expires', 'password_change_required', 'uid'],
   rooms: ['name', 'deleted', 'topic', 'has_vfos', 'vfo_mask'],
   quotas: ['name', 'tx_remaining', 'tx_used', 'bandwidth_remaining', 'bandwidth_tx_used', 'bandwidth_rx_used'],
   audit: ['id', 'timestamp', 'username', 'event_type', 'details'],
   ptt: ['id', 'start_time', 'username', 'vfo', 'frequency', 'mode', 'duration', 'stop_reason', 'recording_id']
};
const adminPaging = {};
function adminRequest(table, before) {
   chat_send_command('admin', {data: table + (before ? ' ' + before : '')});
}
function adminEdit(table, row) {
   if (table === 'users') {
      const dialog = document.createElement('dialog');
      const form = document.createElement('form');
      const entries = {};
      form.method = 'dialog';
      adminTables.users.forEach(field => {
         const label = document.createElement('label');
         label.style.display = 'block';
         label.textContent = field + ' ';
         const input = document.createElement('input');
         input.value = row[field] || '';
         input.readOnly = ['name', 'uid', 'password_set'].includes(field);
         entries[field] = input;
         label.appendChild(input);
         form.appendChild(label);
      });
      const hint = document.createElement('p');
      hint.textContent = 'enabled / password_change_required: 0 or 1; expiry: Unix seconds, blank = never';
      form.appendChild(hint);
      ['Cancel', 'Save'].forEach(label => {
         const button = document.createElement('button');
         button.textContent = button.value = label;
         form.appendChild(button);
      });
      dialog.appendChild(form);
      dialog.addEventListener('close', () => {
         if (dialog.returnValue === 'Save') {
            const fields = {};
            Object.entries(entries).forEach(([field, input]) => { fields[field] = input.value; });
            chat_send_command('admin', {action: 'user-edit', target: row.name, data: JSON.stringify(fields)});
         }
         dialog.remove();
      });
      document.body.appendChild(dialog);
      dialog.showModal();
      return;
   } else {
      const value = window.prompt('Room topic for ' + row.name, row.topic || '');
      if (value === null) return;
      chat_send_command('topic', {target: row.name, data: value});
   }
   adminRequest(table);
}
function adminResult(message) {
   const table = message.talk.target;
   if (!adminTables[table]) return;
   let row;
   try { row = JSON.parse(message.talk.data || '{}'); } catch (_) { return; }
   const body = document.getElementById('admin-' + table + '-rows');
   if (!body) return;
   if (message.talk.action === 'confirm' && table === 'rooms') {
      if (window.confirm(row.deleted ? 'Permanently delete room ' + row.room + '? All chat history will be lost. This cannot be undone.' : 'Remove room ' + row.room + '? It can be restored later.'))
         chat_send_command('admin', {action: 'room-remove', target: row.room, data: row.confirmation});
   } else if (message.talk.action === 'changed') {
      adminRequest(table);
   } else if (message.talk.action === 'begin') {
      if (!row.append) body.replaceChildren();
   } else if (message.talk.action === 'row') {
      const tr = document.createElement('tr');
      adminTables[table].forEach(field => {
         const td = document.createElement('td');
         td.textContent = row[field] || '';
         tr.appendChild(td);
      });
      if (table === 'users' || table === 'rooms' || table === 'quotas') {
         const td = document.createElement('td');
         const actions = table === 'users' ? ['Edit', 'Lock', 'Unlock', 'Remove', 'Reset password'] : table === 'quotas' ? ['TX SET', 'TX ADD', 'BW SET', 'BW ADD'] : ['Edit', 'Remove', 'Restore'];
         actions.forEach(action => {
            const button = document.createElement('button');
            button.textContent = action;
            button.onclick = () => {
               if (action === 'Edit') return adminEdit(table, row);
               if (table === 'quotas') {
                  const amount = window.prompt(action + ' for ' + row.name + ' (TX: 30m; BW: 10M' + (action.endsWith('SET') ? '; SET 0 exhausts allowance' : '') + ')');
                  if (amount === null) return;
                  chat_send_command('quota', {data: action + ' ' + row.name + ' ' + amount});
                  return adminRequest(table);
               }
               if (action === 'Remove') {
                  if (table === 'rooms') return chat_send_command('admin', {action: 'room-remove', target: row.name, data: ''});
                  if (!window.confirm('Remove account ' + row.name + '?')) return;
               }
               const command = table === 'users' ? 'user' : 'room';
               chat_send_command(command, {data: (action === 'Restore' ? 'add' : action === 'Reset password' ? 'resetpw' : action.toLowerCase()) + ' ' + row.name});
               adminRequest(table);
            };
            td.appendChild(button);
         });
         tr.appendChild(td);
      }
      body.appendChild(tr);
   } else if (message.talk.action === 'end') {
      adminPaging[table] = row.next === '0' ? null : row.next;
      document.getElementById('admin-' + table + '-more').disabled = !adminPaging[table];
   }
}
window.webui_inits = window.webui_inits || [];
window.webui_inits.push(function() {
   const root = document.getElementById('win-admin');
   if (!root) return;
   Object.entries(adminTables).forEach(([name, fields]) => {
      const section = document.createElement('section');
      const heading = document.createElement('h3');
      heading.textContent = name === 'audit' ? 'Audit Log' : name === 'ptt' ? 'PTT Log' : name === 'users' ? 'Users' : name === 'rooms' ? 'Rooms' : 'Quotas';
      section.appendChild(heading);
      const refresh = document.createElement('button');
      refresh.textContent = 'Refresh';
      refresh.onclick = () => adminRequest(name);
      section.appendChild(refresh);
      const more = document.createElement('button');
      more.id = 'admin-' + name + '-more';
      more.textContent = 'Load older / more';
      more.disabled = true;
      more.onclick = () => { more.disabled = true; adminRequest(name, adminPaging[name]); };
      section.appendChild(more);
      const scroll = document.createElement('div');
      scroll.style.cssText = 'max-height:24em;overflow:auto';
      const table = document.createElement('table');
      const head = document.createElement('thead');
      const line = document.createElement('tr');
      fields.concat(name === 'users' || name === 'rooms' || name === 'quotas' ? ['Actions'] : []).forEach(field => {
         const th = document.createElement('th');
         th.textContent = field;
         line.appendChild(th);
      });
      head.appendChild(line);
      table.appendChild(head);
      const body = document.createElement('tbody');
      body.id = 'admin-' + name + '-rows';
      table.appendChild(body);
      scroll.appendChild(table);
      section.appendChild(scroll);
      root.appendChild(section);
   });
   $('#tab-admin').click(function() {
      wm_switch_tab('admin');
      if (webui_is_staff(auth_privs)) Object.keys(adminTables).forEach(name => adminRequest(name));
   });
});

// PARITY: rrclient/supervision.c and GTK consent prompts. Grants belong to a login session and TX room.
const supervisionGrants = new Set();
const supervisionDialogs = new Map();
function supervisionRequired() {
   return typeof auth_privs !== 'undefined' && String(auth_privs).split(',').includes('noob') &&
      !supervisionGrants.has(webui_control_room());
}
function supervisionClear() {
   supervisionGrants.clear();
   supervisionDialogs.forEach(dialog => dialog.remove());
   supervisionDialogs.clear();
}
function supervisionResult(message) {
   const row = message.talk;
   if (row.action === 'granted') supervisionGrants.add(row.room);
   if (row.action === 'pending' || row.action === 'revoked') supervisionGrants.delete(row.room);
   ChatBox.Append($('<div class="notice"></div>').text('SUPERVISION: ' + row.user + ' — ' + row.data), row.room);
   const old = supervisionDialogs.get(row.target);
   if (old && row.action !== 'request') { old.remove(); supervisionDialogs.delete(row.target); }
   if (row.action === 'request' && !old) {
      const dialog = document.createElement('dialog');
      const title = document.createElement('h3');
      title.textContent = 'Supervise ' + row.user + ' in ' + row.room + '?';
      const warning = document.createElement('p');
      warning.textContent = row.data;
      dialog.append(title, warning);
      const answer = action => {
         chat_send_command('supervise', {room: row.room, data: action + ' ' + row.target});
         dialog.remove(); supervisionDialogs.delete(row.target);
      };
      [['Decline', 'decline'], ['Accept responsibility', 'accept']].forEach(([label, action]) => {
         const button = document.createElement('button');
         button.textContent = label;
         button.onclick = () => answer(action);
         dialog.appendChild(button);
      });
      dialog.addEventListener('cancel', event => { event.preventDefault(); answer('decline'); });
      supervisionDialogs.set(row.target, dialog);
      document.body.appendChild(dialog);
      dialog.showModal();
   }
   if (typeof ptt_button_apply === 'function') ptt_button_apply();
}
