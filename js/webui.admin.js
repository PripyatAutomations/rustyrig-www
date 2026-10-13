// PARITY: rrserver/events.c admin_send and rrclient/gtk/gtk.admin.c.
const adminTables = {
   users: ['name', 'enabled', 'permissions', 'email', 'maxsessions'],
   rooms: ['name', 'deleted', 'topic', 'has_vfos', 'vfo_mask'],
   audit: ['id', 'timestamp', 'username', 'event_type', 'details'],
   ptt: ['id', 'start_time', 'username', 'vfo', 'frequency', 'mode', 'duration', 'stop_reason', 'recording_id']
};
const adminPaging = {};
function adminRequest(table, before) {
   chat_send_command('admin', {data: table + (before ? ' ' + before : '')});
}
function adminEdit(table, row) {
   if (table === 'users') {
      const value = window.prompt('Account privileges for ' + row.name, row.permissions || '');
      if (value === null) return;
      chat_send_command('user', {data: 'privs ' + row.name + ' set ' + value});
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
   if (message.talk.action === 'begin') {
      if (!row.append) body.replaceChildren();
   } else if (message.talk.action === 'row') {
      const tr = document.createElement('tr');
      adminTables[table].forEach(field => {
         const td = document.createElement('td');
         td.textContent = row[field] || '';
         tr.appendChild(td);
      });
      if (table === 'users' || table === 'rooms') {
         const td = document.createElement('td');
         const actions = table === 'users' ? ['Edit', 'Lock', 'Unlock'] : ['Edit', 'Remove', 'Restore'];
         actions.forEach(action => {
            const button = document.createElement('button');
            button.textContent = action;
            button.onclick = () => {
               if (action === 'Edit') return adminEdit(table, row);
               const command = table === 'users' ? 'user' : 'room';
               chat_send_command(command, {data: (action === 'Restore' ? 'add' : action.toLowerCase()) + ' ' + row.name});
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
      heading.textContent = name === 'audit' ? 'AUDIT events' : name === 'ptt' ? 'AUDIT PTT sessions' : name;
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
      fields.concat(name === 'users' || name === 'rooms' ? ['Actions'] : []).forEach(field => {
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
