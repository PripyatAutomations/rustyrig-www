// Roster rendering, account actions and user menus. See native rrclient/userlist.c.
// Loaded after webui.chat.js; globals retain their existing public names.

// Clear online user presentation after connection loss.
function cul_offline() {
   // Clear the user-info cache (populated from JOIN messages)
   UserCache.clear();

   $('.cul-list').empty();
   $('.cul-list').append('<span class="error">OFFLINE</span>');
}

// Store the data from names reply in the UserCache, replacing outdated informations
// Merge one server user-state update into the roster cache.
function parse_userinfo_reply(message) {
//    console.log("parse_userinfo_reply:", message);
    if (typeof message !== 'undefined') {
       if (message.talk.user === auth_user && message.talk.privs !== undefined) auth_privs = message.talk.privs;
       // Server sends the PTT state as talk.tx (see srv.chat.c: ws_send_userinfo)
       // PARITY: rrclient/events.c rrclient_handle_userinfo().
       const tx = message.talk.tx !== undefined ? message.talk.tx : message.talk.ptt;
       if (tx !== undefined && typeof ptt_confirm_state === 'function')
          ptt_confirm_state(message.talk.user, message.talk['ptt-vfo'], parse_bool_field(tx), message.talk['ptt-room']);
       UserCache.update({ name: message.talk.user, room: message.talk.room || webui_authoritative_room,
          privs: message.talk.privs, muted: parse_bool_field(message.talk.muted),
          ptt: parse_bool_field(message.talk.tx !== undefined ? message.talk.tx : message.talk.ptt),
          ptt_room: message.talk['ptt-room'] || '',
          ptt_vfo: message.talk['ptt-vfo'] || '',
          sessions: message.talk.sessions });
    }

    return false;
}

// Re-render the #chat-user-list from UserCache contents
// Render the current room roster from cached user state.
function cul_render() {
    $('.cul-list').empty();
    if (typeof webui_room_controls !== 'undefined' && webui_room_controls[ChatBox.current_room]?.offline) {
       $('.cul-list').text('OFFLINE');
       return;
    }
    const users = UserCache.get_all();

    // Only show each user once in the list
    const uniqueUsers = Array.from(
       new Map(users.map(u => [u.name.toLowerCase(), u])).values()
    );

    uniqueUsers.sort((a, b) => a.name.localeCompare(b.name, undefined, {
       sensitivity: 'base',
       numeric: true
    }));

    uniqueUsers.forEach(user => {
//       console.log("cul_render:", user.name, "data:", user);
       const { name } = user;
       const privs = new Set((user.privs || '').split(',').map(p => p.trim()));
       let badges = '', tx_badges = '';

       if (privs.has('elmer')) {
           tx_badges +=  '<span class="badge admin-badge">🧙&nbsp;</span>';
       }
       if (user.ptt) {
          tx_badges += '<span class="badge tx-badge">🎙️</span>';
       } else if (parse_bool_field(user.muted)) {
           tx_badges += '<span class="badge">🙊</span>';
        }

        if (privs.has('owner')) {
           badges += '<span class="badge owner-badge">👑&nbsp;</span>';
       } else if (privs.has('admin')) {
           badges += '<span class="badge admin-badge">⭐&nbsp;</span>';
       } else if (privs.has('noob')) {
           badges += '<span class="badge admin-badge">🐣&nbsp;</span>';
       } else if (privs.has('tx')) {
           badges +=  '<span class="badge admin-badge">👤&nbsp;</span>';
       } else {
           badges += '<span class="badge view-badge">👀&nbsp;</span>';
//           badges += '<span class="badge empty-badge">&nbsp;✴&nbsp;</span>';
       }

       // Change color for our own name in CUL
       let cul_class = 'cul-other';
       if (auth_user === user.name) {
          cul_class = 'cul-self';
        }

       // render the user item (li)
       const userItem = `<li>
          <span class="chat-user-list" onclick="${webui_escape_html('show_user_menu(' + JSON.stringify(user.name) + ');')}">
             ${badges}<span class="${cul_class}">${webui_escape_html(user.name)}</span>${tx_badges}
          </span>
       </li>`;

       $('.cul-list').append(userItem);
    });
}

// Send a user-menu moderation command for the selected account.
function send_admin_command(cmd, username) {
   const needsReason = ['kick', 'ban', 'mute'];

   if (needsReason.includes(cmd)) {
      show_reason_modal(cmd, username);
   } else {
      chat_send_command(cmd, { target: username });
   }
}

// Collect a moderation reason before sending the requested action.
function show_reason_modal(cmd, username) {
   const modal = document.getElementById("reason-modal");
   const form = document.getElementById("reason-form");
   const textarea = document.getElementById("reason-text");
   const title = document.getElementById("reason-title");

   title.textContent = `Enter ${cmd} reason for ${webui_escape_html(username)}`;
   textarea.value = "";

   modal.style.display = "block";
   textarea.focus();

   const handler = function(e) {
      e.preventDefault();
      const reason = textarea.value.trim();
      if (reason) {
         chat_send_command(cmd, { target: username, reason: reason });
      }
      modal.style.display = "none";
      form_disable(false);
      form.removeEventListener("submit", handler);
   };

   form.addEventListener("submit", handler);
}

// Present actions allowed by the current account privileges.
function show_user_menu(username) {
    var isAdmin = webui_is_staff(auth_privs);

    form_disable(true);

    // Admin menu to be appended if the user is an admin
    var admin_menu = `
        <hr width="50%"/>Admin<br/><br/>
        <li>
         <button class="cul-menu-button mute-user" title="Mute (disable CAT/TX) for user">Mute</button>
         <button class="cul-menu-button unmute-user" title="Unmute (enable CAT/TX) for user">Unmute</button>
        </li>
        <li><button class="cul-menu-button kick-user" title="Disconnect user">Kick</button></li>
    `;

    // Base menu
    var user_email = 'none';

    var menu = `
        <div class="um-header" style="position: relative;">
            <span class="um-close">✖</span>
        </div><br/>
        <center>User: ${webui_escape_html(username)}</center><br/>
        <span class="user-menu-items">
            <ul>
<!--                <li><a href="mailto:${user_email}" target="_blank">Email</a></li> -->
                <li><button class="cul-menu-button whois-user">Whois</button></li>
                ${isAdmin ? admin_menu : ''}
            </ul>
        </span>
    `;

    // Update the user menu and show it
    $('#user-menu').html(menu);

    var user = UserCache.get(username);
    // if user is in the cache, see if they have muted property set
    if (user) {
       $('.mute-user').on('click', function() {
          chat_send_command('mute', { target: username });
          form_disable(false);
          $('#user-menu').hide('slow');
       });

       $('.unmute-user').on('click', function() {
          chat_send_command('unmute', { target: username });
          form_disable(false);
          $('#user-menu').hide('slow');
       });

       // do we show mute or unmute button?
       if (parse_bool_field(user.muted)) {
          $('.mute-user').hide('fast');
          $('.unmute-user').show('fast');
       } else {
          $('.unmute-user').hide('fast');
          $('.mute-user').show('fast');
       }
    }

    // Close button functionality
    $('.um-close').on('click', function() {
        form_disable(false);
        $('#user-menu').hide('slow');
    });

    // Attach event listeners
    $('.whois-user').on('click', () => chat_send_command('whois', { target: username }));
    $('.kick-user').on('click', () => send_admin_command('kick', username));
    $('.ban-user').on('click', () => send_admin_command('ban', username));

    // Finally, show the menu
    $('#user-menu').show();
}

// Function to send commands over WebSocket

const UserCache = {
   users: {},

   add(user) {
      // I dont remember why this is done as such; ideally we should duplicate user object into this.users[user.name] directly
      this.users[user.name] = {
         ...(user.hasOwnProperty('ptt')   && { ptt:   user.ptt }),
         ...(user.hasOwnProperty('ptt_vfo') && { ptt_vfo: user.ptt_vfo }),
         ...(user.hasOwnProperty('ptt_room') && { ptt_room: user.ptt_room }),
         ...(user.hasOwnProperty('muted') && { muted: user.muted }),
         ...(user.hasOwnProperty('privs') && { privs: user.privs }),
         ...(user.hasOwnProperty('sessions') && { sessions: user.sessions }),
         room: user.room || webui_authoritative_room || '#rig'
      };
      console.log("UC.add: name:", user.name, "sessions:", user.sessions);
      cul_render();
      if (typeof ptt_button_apply === 'function') ptt_button_apply();
   },

   remove(name) {
      const entry = this.users[name];
      if (!entry) return;

      console.log("UC.remove: name:", name, "sessions:", entry.sessions);
      if (entry.sessions <= 1) {
         delete this.users[name];
      } else {
         entry.sessions--;
      }

      cul_render();
      if (typeof ptt_button_apply === 'function') ptt_button_apply();
   },

   update(user) {
      const existing = this.users[user.name];

      if (!existing) {
         console.log("UC.update: No entry for", user.name, "- creating new");
         this.add(user);
         return;
      }
      if ('ptt'   in user) existing.ptt   = user.ptt;
      if ('ptt_vfo' in user) existing.ptt_vfo = user.ptt_vfo;
      if ('ptt_room' in user) existing.ptt_room = user.ptt_room;
      if ('privs' in user) existing.privs = user.privs;
      if ('muted' in user) existing.muted = user.muted;
      if ('sessions' in user) existing.sessions = user.sessions;
      if ('room' in user && user.room) existing.room = user.room;
      cul_render();
   },

   get(name, room) {
      const entry = this.users[name] || null;
      if (room === undefined) room = typeof ChatBox === 'undefined' ? null : ChatBox.current_room;
      return !entry || !room || entry.room === room ? entry : null;
   },

   get_all() {
      return Object.entries(this.users)
         .filter(([, props]) => typeof ChatBox === 'undefined' || !ChatBox.current_room ||
            props.room === ChatBox.current_room)
         .map(([name, props]) => ({ name, ...props }));
   },

   sessions(name) {
      return this.users[name]?.sessions || 0;
   },

   dump() {
      console.log("UserCache contents:");
      for (const [name, props] of Object.entries(this.users)) {
         console.log(`- ${name}:`, props);
      }
   },

   clear() {
      this.users = {};
      cul_render();
   }
};
