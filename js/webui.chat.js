////////////////
// Chat Stuff //
////////////////
//
// Utility functions used stand-alone elsewhere
//
// Convert http(s) urls into clickable links
function msg_create_links(message) {
   const text = String(message);
   const matches = text.matchAll(/https?:\/\/[^\s<>"']+/g);
   let result = '', offset = 0;
   for (const match of matches) {
      result += webui_escape_html(text.slice(offset, match.index));
      const url = webui_escape_html(match[0]);
      result += '<a href="' + url + '" class="chat-link" target="_blank" rel="noopener noreferrer">' + url + '</a>';
      offset = match.index + match[0].length;
   }
   return result + webui_escape_html(text.slice(offset));
}

// Callsign responses contain data returned by an external lookup service.
// Escape it before inserting it into the chat DOM.
function webui_escape_html(value) {
   return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
}

/* PARITY: rustyrig-fw/rrclient/events.c:rrclient_handle_callsign */
function webui_parse_callsign_msg(msgObj) {
   const response = msgObj && msgObj.callsign;
   if (!response) {
      return;
   }

   const fields = response.fields && typeof response.fields === 'object' ? response.fields : null;
   if (!fields) {
      return;
   }

   const ts = msg_timestamp(msgObj.msg && msgObj.msg.ts);
   const rendered = [`<div class="chat-status notice">${ts}&nbsp;<b>CALLSIGN</b></div>`];
   if (fields) {
      if (response.status) {
         rendered.push(`<div class="chat-status">${ts}&nbsp;&nbsp;${webui_escape_html(response.status)}</div>`);
      }
      const preferred = [
         'callsign', 'name', 'email', 'address1', 'address2',
         'county', 'state', 'zip', 'country', 'wgs-84', 'heading',
         'license-effective', 'cached', 'cache-fetched', 'cache-expiry'
      ];
      const keys = Object.keys(fields).sort((a, b) => {
         const ai = preferred.indexOf(a.replace(/_/g, '-'));
         const bi = preferred.indexOf(b.replace(/_/g, '-'));
         if (ai >= 0 || bi >= 0) return (ai < 0 ? preferred.length : ai) - (bi < 0 ? preferred.length : bi);
         return a.localeCompare(b);
      });
      keys.forEach(key => {
         const label = key.replace(/_/g, '-');
         rendered.push(`<div class="chat-status">${ts}&nbsp;&nbsp;<span class="chat-msg-prefix">${webui_escape_html(label)}:</span>${webui_escape_html(fields[key])}</div>`);
      });
   }
   ChatBox.Append(rendered.join(''));
}

// Server sends booleans sometimes as real JSON bools (dict_add_bool) and
// sometimes as "true"/"false" strings (dict_add); handle both
function parse_bool_field(val) {
   return val === true || val === 'true';
}

/* PARITY: rustyrig-fw/rrclient/cmd.c:client_cmds and cmd.help.c:cmd_help */
const webui_help_sections = ['Connection', 'Chat and rooms', 'Radio and discovery',
   'Media', 'Serial', 'Client settings', 'Administration'];
const webui_command_help = [
   {
      "cmd": "help",
      "help_section": "Connection",
      "desc": "Show help message",
      "admin": false
   },
   {
      "cmd": "quit",
      "help_section": "Connection",
      "desc": "Exit (/quit [-yes|-y|y|yes] skips confirm)",
      "admin": false
   },
   {
      "cmd": "j",
      "help_section": "Chat and rooms",
      "desc": "Alias for /join",
      "admin": false
   },
   {
      "cmd": "join",
      "help_section": "Chat and rooms",
      "desc": "Join a channel",
      "admin": false
   },
   {
      "cmd": "list",
      "help_section": "Chat and rooms",
      "desc": "List available rooms",
      "admin": false
   },
   {
      "cmd": "me",
      "help_section": "Chat and rooms",
      "desc": "Send an action to the current channel",
      "admin": false
   },
   {
      "cmd": "msg",
      "help_section": "Chat and rooms",
      "desc": "Send a private message",
      "admin": false
   },
   {
      "cmd": "names",
      "help_section": "Chat and rooms",
      "desc": "List users with privilege flags",
      "admin": false
   },
   {
      "cmd": "part",
      "help_section": "Chat and rooms",
      "desc": "Leave a channel",
      "admin": false
   },
   {
      "cmd": "query",
      "help_section": "Chat and rooms",
      "desc": "Open a private message tab",
      "admin": false
   },
   {
      "cmd": "room",
      "help_section": "Chat and rooms",
      "desc": "/room list; add #room; remove #room [-f [-h]] [token]; #room vfo ...",
      "admin": false
   },
   {
      "cmd": "topic",
      "help_section": "Chat and rooms",
      "desc": "Get or set the current room topic",
      "admin": false
   },
   {
      "cmd": "whois",
      "help_section": "Chat and rooms",
      "desc": "Show client information",
      "admin": false
   },
   {
      "cmd": "gps",
      "help_section": "Radio and discovery",
      "desc": "GPS services: LIST | SUBSCRIBE <rig|station> | UNSUBSCRIBE <rig|station>",
      "admin": false
   },
   {
      "cmd": "grid",
      "help_section": "Radio and discovery",
      "desc": "Look up a grid square or coordinates",
      "admin": false
   },
   {
      "cmd": "object",
      "help_section": "Radio and discovery",
      "desc": "Inspect objects: /object [rig0|rig0.A|uuid]",
      "admin": false
   },
   {
      "cmd": "qrz",
      "help_section": "Radio and discovery",
      "desc": "Look up a callsign",
      "admin": false
   },
   {
      "cmd": "rig",
      "help_section": "Radio and discovery",
      "desc": "Radios and VFOs: LIST | SUBSCRIBE | UNSUBSCRIBE property updates",
      "admin": false
   },
   {
      "cmd": "media",
      "help_section": "Media",
      "desc": "Media channels: LIST | SUBSCRIBE <name|uuid|#> | UNSUBSCRIBE <name|uuid|#>",
      "admin": false
   },
   {
      "cmd": "rxcodec",
      "help_section": "Media",
      "desc": "RX codecs: [LIST | <codec>|NONE [uuid|#number]]",
      "admin": false
   },
   {
      "cmd": "rxvol",
      "help_section": "Media",
      "desc": "Set receive volume level",
      "admin": false
   },
   {
      "cmd": "txcodec",
      "help_section": "Media",
      "desc": "TX codecs: [LIST | <codec>|NONE [uuid|#number]]",
      "admin": false
   },
   {
      "cmd": "sercom",
      "help_section": "Serial",
      "desc": "LIST | REMOTE: discover permitted server serial exports; local attachments need the native client",
      "admin": false
   },
   {
      "cmd": "clear",
      "help_section": "Client settings",
      "desc": "Clear the scrollback",
      "admin": false
   },
   {
      "cmd": "config",
      "help_section": "Client settings",
      "desc": "Focus the configuration tab",
      "admin": false
   },
   {
      "cmd": "log",
      "help_section": "Client settings",
      "desc": "Switch to log tab",
      "admin": false
   },
   {
      "cmd": "die",
      "help_section": "Administration",
      "desc": "Shutdown the server",
      "admin": true
   },
   {
      "cmd": "kick",
      "help_section": "Administration",
      "desc": "Kick a user from the rig",
      "admin": true
   },
   {
      "cmd": "mute",
      "help_section": "Administration",
      "desc": "Mute a user",
      "admin": true
   },
   {
      "cmd": "quota",
      "help_section": "Administration",
      "desc": "TX/BW quota admin ([TX|BW] LIST|SHOW|ADD|RESET|SET)",
      "admin": true
   },
   {
      "cmd": "rehash",
      "help_section": "Administration",
      "desc": "Ask server to reload config & users",
      "admin": true
   },
   {
      "cmd": "restart",
      "help_section": "Administration",
      "desc": "Restart the server",
      "admin": true
   },
   {
      "cmd": "syslog",
      "help_section": "Administration",
      "desc": "Toggle server host log stream (/syslog on|off)",
      "admin": true
   },
   {
      "cmd": "unmute",
      "help_section": "Administration",
      "desc": "Unmute a user",
      "admin": true
   },
   {
      "cmd": "user",
      "help_section": "Administration",
      "desc": "PASS <your-user> <password>; admin/owner: manage accounts",
      "admin": false
   },
   {
      "cmd": "chat",
      "help_section": "Client settings",
      "desc": "Focus chat",
      "admin": false
   },
   {
      "cmd": "cfg",
      "help_section": "Client settings",
      "desc": "Focus configuration",
      "admin": false
   },
   {
      "cmd": "logout",
      "help_section": "Connection",
      "desc": "End session",
      "admin": false
   },
   {
      "cmd": "clearlog",
      "help_section": "Client settings",
      "desc": "Clear the log window",
      "admin": false
   },
   {
      "cmd": "clxfr",
      "help_section": "Client settings",
      "desc": "Clear file-transfer cache",
      "admin": false
   },
   {
      "cmd": "menu",
      "help_section": "Chat and rooms",
      "desc": "Show user menu",
      "admin": false
   },
   {
      "cmd": "reloadcss",
      "help_section": "Client settings",
      "desc": "Reload stylesheet",
      "admin": false
   },
   {
      "cmd": "rxmute",
      "help_section": "Media",
      "desc": "Mute receive audio",
      "admin": false
   },
   {
      "cmd": "rxunmute",
      "help_section": "Media",
      "desc": "Unmute receive audio",
      "admin": false
   }
];

function webui_is_staff(privileges) {
   return String(privileges || '').split(',').some(priv => ['admin', 'owner'].includes(priv.trim()));
}

function webui_show_help() {
   const staff = webui_is_staff(auth_privs);
   webui_help_sections.forEach(section => {
      const entries = webui_command_help.filter(entry => entry.help_section === section && (!entry.admin || staff))
         .sort((a, b) => a.cmd.localeCompare(b.cmd));
      if (!entries.length) return;
      ChatBox.Append('<div class="chat-status notice" style="color: #ff0000"><b>' + webui_escape_html(section) + '</b></div>');
      entries.forEach(entry => ChatBox.Append('<div class="chat-status notice">/' +
         webui_escape_html(entry.cmd) + ' — ' + webui_escape_html(entry.desc) + '</div>'));
   });
   ChatBox.Append('<div class="chat-status notice">Undashed rooms may be created by any authenticated account. Dashed station rooms, restoration, removal and VFO mappings require admin/owner. Removal needs a confirmation token: -f deletes metadata/bindings; -f -h also deletes chat history. Rig PTT logs and recordings remain.</div>');
   ChatBox.Append('<div class="chat-status notice">Codec changes require matching rx/tx account privileges and VFO room membership. Chain rig commands: !mode lsb freq 7200. Use Tab for command/resource completion.</div>');
}

class WebUiChat {
   constructor(output, input) {
      if (typeof output === 'undefined' || output === null) {
         return null;
      }

      this.output_selector = output;
      this.output = $(output);
      this.scrollback_max_lines = 1000;
      this.scrollback_purge_lines = 100;
      this.rooms = Object.create(null);
      this.current_room = null;
   }

   room_name(room) {
      return (room && String(room).length) ? String(room) :
         (webui_authoritative_room || '#rig');
   }

   ensure_room(room, select) {
      room = this.room_name(room);
      if (!Object.prototype.hasOwnProperty.call(this.rooms, room)) {
         this.rooms[room] = '';
         const tab = $('<button type="button"></button>')
            .text(room).attr('data-room', room);
         tab.on('click', () => this.SwitchRoom(room));
         $('#chat-room-tabs').append(tab);
      }
      if (select) {
         this.SwitchRoom(room);
      } else if (this.current_room === null) {
         this.current_room = room;
         this.output = $(this.output_selector);
      }
      return room;
   }

   SwitchRoom(room) {
      room = this.room_name(room);
      if (!Object.prototype.hasOwnProperty.call(this.rooms, room)) {
         this.ensure_room(room, false);
      }
      this.current_room = room;
      this.output = $(this.output_selector);
      if (typeof mediaSelectRoom === 'function') mediaSelectRoom(room);
      if (typeof webui_apply_room_controls === 'function') webui_apply_room_controls(room);
      this.output.html(this.rooms[room] || '');
      $('#chat-room-tabs button').each(function() {
         $(this).toggleClass('active', $(this).attr('data-room') === room);
      });
      this.output.scrollTop(this.output[0].scrollHeight);
      return room;
   }

   RemoveRoom(room) {
      if (!room || !Object.prototype.hasOwnProperty.call(this.rooms, room)) return;
      delete this.rooms[room];
      $('#chat-room-tabs button').filter(function() {
         return $(this).attr('data-room') === room;
      }).remove();
      if (this.current_room === room) {
         const next = Object.keys(this.rooms)[0] || webui_authoritative_room || '#rig';
         this.ensure_room(next, true);
      }
   }

   // Add a message to the chat
   Append(msg, room) {
      room = this.ensure_room(room, false);
      this.output = $(this.output_selector);
      if (room !== this.current_room) {
         this.rooms[room] += msg;
         return;
      }
      // limit scrollback to 1000 items
      const $messages = this.output.children();

      // Limit scrollback size
      if ($messages.length > this.scrollback_max_lines) {
         $messages.slice(0, this.scrollback_purge_lines).remove();
      }

      // Add the message to the chatbox and persist the active room's scrollback.
      this.output.append(msg);
      this.rooms[room] = this.output.html();

      // A few ms delay before scrolling to improve smoothness
      setTimeout(function () {
         $('#chat-box').scrollTop($('#chat-box')[0].scrollHeight);
      }, 10);
   }

   Clear() {
      this.output.empty();
      if (this.current_room) this.rooms[this.current_room] = '';

      setTimeout(function () {
         $('#chat-box').scrollTop($('#chat-box')[0].scrollHeight);
      }, 10);
   }
}

var webui_authoritative_room = null;
var webui_available_rooms = [];

if (!window.webui_inits) {
   window.webui_inits = [];
}
window.webui_inits.push(function webui_chat_init() { chat_init(); });

function chatbox_clear() {
   if (typeof ChatBox !== 'undefined' && ChatBox.Clear) {
      ChatBox.Clear();
   } else {
      $('#chat-box').empty();
   }
}

function chat_init() {
  $(document).ready(function() {
      let chatBox = $('#chat-box');

      // scroll the chatbox down when window is resized (keyboard open/closed, etc)
      $(window).on('resize', function() {
         chatBox.scrollTop(chatBox[0].scrollHeight);
      });

      $('#chat-input').on('paste', function(e) {
         handle_paste(e);
         e.preventDefault();
      });

      $('#send-btn').click(function(e) {
         parse_chat_cmd(e);
      });

      // Ensure #chat-box does not accidentally become focusable
      $('#chat-box').attr('tabindex', '-1');
      $('.um-close').click(function() {
         form_disable(false);
         $('#user-menu').hide('slow');
      });

      function applyChatFontSize(size) {
         $("#chatbox").css("font-size", size + "px");
         localStorage.setItem("chatFontSize", size);
      }

      $(function() {
         const savedSize = localStorage.getItem("chatFontSize") || 16;
         $("#ui-chat-font").val(savedSize);
         applyChatFontSize(savedSize);

         $("#ui-chat-font").on("input", function() {
            applyChatFontSize(this.value);
         });
      });

   });
}

function cul_offline() {
   // Clear the user-info cache (populated from JOIN messages)
   UserCache.clear();

   $('.cul-list').empty();
   $('.cul-list').append('<span class="error">OFFLINE</span>');
}

// Store the data from names reply in the UserCache, replacing outdated informations
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
function cul_render() {
    $('.cul-list').empty();
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

function send_admin_command(cmd, username) {
   const needsReason = ['kick', 'ban', 'mute'];

   if (needsReason.includes(cmd)) {
      show_reason_modal(cmd, username);
   } else {
      chat_send_command(cmd, { target: username });
   }
}

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
function chat_send_command(cmd, args) {
   var msgObj = {
      "msg": {
         "type": "talk"
      },
      "talk": {
         "cmd": cmd
      }
   };

   // args: target goes into talk.target (server reads talk.target),
   // everything else into talk.args.<key> (e.g. talk.args.reason)
   if (typeof args === 'object' && args !== null) {
      if (typeof args.target !== 'undefined') {
         msgObj.talk.target = args.target;
      }
      if (typeof args.data !== 'undefined') {
         msgObj.talk.data = args.data;
      }
      var rest = { ...args };
      delete rest.target;
      delete rest.data;
      if (Object.keys(rest).length > 0) {
         msgObj.talk.args = rest;
      }
   }

   rrSendMessage(socket, msgObj);
   $('#user-menu').hide();
}

var unmute_vol = $('#rig-rx-vol').val();

function parse_chat_cmd(e) {
   var message = $('#chat-input').val().trim();
   var chat_msg = false;
   var msg_type = "invalid";
   var private_target = null;
   // Each input is independent.  Do not let an argument object from a
   // previous command turn /query or /msg into an unrelated server command.
   var args_obj = null;

   // Determine if the message is a command, otherwise send it off as chat
   if (message) {
      if (message.charAt(0) == '/') {
         var args = message.split(' ');

         // remove the leading /
         if (args.length > 0 && args[0].startsWith('/')) {
            args[0] = args[0].slice(1);
         }
         var command = args[0];

         // Compare the lower-cased command
         switch(command.toLowerCase()) {
            // commands with no arguments
            // Native serial transports are frontend-specific; never forward to server.
            case 'rig': rrRigCommand(args); break;
            case 'gps': rrGpsCommand(args); break;
            case 'sercom':
               if (args.length === 1 || (args.length === 2 && ['list','remote'].includes(args[1].toLowerCase()))) { rrRigCommand(['serial', 'list']); break; }
               ChatBox.Append('<div><span class="notice">/sercom manages local PTYs and serial devices in the native GTK/TUI client.</span></div>');
               break;
            case 'clear':
               chatbox_clear();
               break;
            case 'clearlog':
               ChatBox.Append('<div><span class="error">Cleared syslog window</span></div>');
               syslog_clear();
               break;
            case 'clxfr':
               ChatBox.Append('<div><span class="error">Cleared xfer-chunks</span></div>');
               clear_xfer_chunks();
               break;
            case 'chat':
               wmSwitchTab('chat');
               break;
            case 'query':
               if (args.length < 2 || !args[1]) {
                  ChatBox.Append('<div><span class="error">Usage: /query user</span></div>');
               } else {
                  ChatBox.ensure_room(args[1], true);
               }
               break;
            case 'msg':
               if (args.length < 3 || !args[1]) {
                  ChatBox.Append('<div><span class="error">Usage: /msg user message</span></div>');
               } else {
                  private_target = args[1];
                  ChatBox.ensure_room(private_target, true);
                  message = args.slice(2).join(' ');
                  chat_msg = true;
                  msg_type = "priv";
               }
               break;
            case 'topic':
               args_obj = {target: ChatBox.current_room, data: args.slice(1).join(' ')};
               break;
            case 'list':
            case 'join':
            case 'part':
            case 'room':
               if (command.toLowerCase() === 'join' && args.length < 2) {
                  ChatBox.Append('<div><span class="error">Usage: /join #room</span></div>');
                  break;
               }
               if (command.toLowerCase() === 'part' && args.length < 2 &&
                   !ChatBox.current_room) {
                  ChatBox.Append('<div><span class="error">Usage: /part #room (select a room tab or provide the room)</span></div>');
                  break;
               }
               if (command.toLowerCase() === 'part' && args.length < 2 &&
                   ChatBox.current_room.charAt(0) !== '#' &&
                   ChatBox.current_room.charAt(0) !== '&') {
                  ChatBox.RemoveRoom(ChatBox.current_room);
                  break;
               }
               if (command.toLowerCase() === 'room' && args.length < 2) {
                  ChatBox.Append('<div><span class="error">Usage: /room list|add #room|remove #room [-f [-h]] [token]|#room vfo ...</span></div>');
                  break;
               }
               if (command.toLowerCase() === 'list') {
                  args_obj = {};
               } else if (command.toLowerCase() === 'join' || command.toLowerCase() === 'part') {
                  args_obj = { target: args[1] || ChatBox.current_room };
               } else {
                  args_obj = { data: args.slice(1).join(' ') };
               }
               break;
            case 'cfg':
            case 'config':
               wmSwitchTab('cfg');
               break;
            case 'log':
               wmSwitchTab('syslog');
               break;
            case 'menu':
               show_user_menu(args[1]);
               break;
            case 'logout':
            case 'quit':
               logout();
               break;
            case 'reloadcss':
               console.log("Reloading CSS on user command");
               reload_css();
               ChatBox.Append('<div><span class="notice">Reloaded CSS</span></div>');
               break;
            case 'rxvol':
               $('#rig-rx-vol').val(args[1] / 100);
               console.log("Set volume to " + args[1] + "%");
               rxGainNode.gain.value = parseFloat($('#rig-rx-vol').val());
               break;
            case 'rxcodec':
            case 'txcodec': {
               var codec_direction_tx = command.toLowerCase() === 'txcodec';
               var requested_codec = args.length > 1 ? args[1].toLowerCase() : 'list';
               if (requested_codec === 'list') {
                  ChatBox.Append('<div><span class="notice">' +
                     (codec_direction_tx ? 'TX' : 'RX') + ' codecs: ' +
                     'NONE ' + webui_audio_codec_list().join(' ') + '</span></div>',ChatBox.current_room);
                  mediaLastList = Object.keys(mediaChannels);
                  mediaLastList.forEach((uuid,index) => {
                     const ch = mediaChannels[uuid];
                     if (!mediaResourceMatches(ChatBox.current_room,ch.controlRoom || ch.room)) return;
                     if (ch.subsystem === 1 && ch.dir === (codec_direction_tx ? 1 : 0) && (ch.subscribed || ch.disabled))
                        mediaCommandNotice(mediaFormatChan(index+1,ch));
                  });
               } else if (!webui_audio_set_codec(requested_codec, codec_direction_tx,
                  args.length > 2 ? args[2] : null)) {
                  ChatBox.Append('<div><span class="error">Unknown/ambiguous channel or unsupported browser audio codec: ' +
                     requested_codec + '</span></div>',ChatBox.current_room);
               }
               break;
            }
            case 'qrz':
            case 'grid': {
               const lookup = args.slice(1).join(' ').trim();
               if (!lookup) {
                  ChatBox.Append('<div><span class="error">Usage: /' + command.toLowerCase() +
                     (command.toLowerCase() === 'grid' ? ' GRID|LAT,LON' : ' CALLSIGN') + '</span></div>');
               } else {
                  args_obj = { data: lookup };
               }
               break;
            }
            case 'rxmute':
               unmute_vol = $('#rig-rx-vol').val();
               rxGainNode.gain.value = 0;
               console.log("Muting RX audio");
               break;
            case 'rxunmute':
               $('#rig-rx-vol').val(unmute_vol);
               console.log("Unmuting RX audio");
               rxGainNode.gain.value = unmute_vol;
               break;
            case 'object':
               if (args.length > 2) ChatBox.Append($('<div class="notice"></div>').text('Usage: /object [symbol|uuid] (e.g. rig0 or rig0.A)'),ChatBox.current_room);
               else rrObjectsList(args[1]);
               break;
            case 'media':
               // PARITY: rustyrig-fw/rrclient/media.c: cmd_media()
               var sub = (args.length > 1 ? args[1].toLowerCase() : 'list');

               if (sub === 'list' || sub === '') {
                  mediaListChannels();
                  if (args.length < 2) {
                     requestMediaChannels();
                  }
               } else if (sub === 'sub' || sub === 'subscribe' ||
                          sub === 'unsub' || sub === 'unsubscribe') {
                  if (args.length < 3 || args[2] === '') {
                     ChatBox.Append('<div><span class="error">Usage: /media ' + sub + ' &lt;name|uuid|#number&gt;</span></div>',ChatBox.current_room);
                     break;
                  }
                  var chan = mediaChanLookup(args[2]);
                  var unsub = (sub.startsWith('un'));

                  if (!chan) {
                     mediaCommandNotice("Unknown or ambiguous channel '" + args[2] +
                        "'; use /media list and choose a name, #number or UUID", true);
                     break;
                  }
                  const label = chan.name || chan.uuid;
                  if (unsub) {
                     if (!chan.subscribed) mediaCommandNotice('Not subscribed to ' + label);
                     else {
                        mediaCommandNotice('Unsubscribing from ' + label);
                        unsubscribeMediaChannel(chan.uuid);
                     }
                  } else {
                     if (chan.subscribed) mediaCommandNotice('Already subscribed to ' + label);
                     else {
                        mediaCommandNotice('Subscribing to ' + label);
                        subscribeMediaChannel(chan.uuid);
                     }
                  }
               } else {
                  ChatBox.Append('<div><span class="error">Usage: /media [LIST | SUB|SUBSCRIBE &lt;name|uuid|#number&gt; | UNSUB|UNSUBSCRIBE &lt;name|uuid|#number&gt;]</span></div>',ChatBox.current_room);
               }
               break;
            case 'help':
               webui_show_help();
               break;
            case 'me':	// /me shows an ACTION in the chat
               message = message.slice(4);
               chat_msg = true;
               msg_type = "action";
               break;
            ////////////////////////////////////////////
            // All these are sent to the server as-is //
            //   It will respond if allowed or not    //
            ////////////////////////////////////////////
            case 'kick':
            case 'mute':
            case 'names':
               if (args.length >= 2) {
                  args_obj = {
                     target: args[1],
                     reason: args.slice(2).join(' ') || ''
                  };
               } else {
                  args_obj = {
                     target: args[1],
                  };
               }
               break;

            case 'syslog':
            case 'unmute':
            case 'whois':
               if (args.length >= 2) {
                  args_obj = {
                     target: args[1]
                  };
               }
               break;

            case 'user':
               args_obj = {data: args.slice(1).join(' ')};
               break;
            case 'quota':
               // PARITY: rustyrig-fw/rrclient/cmd.admin.c: cmd_quota()
               // Server checks admin/owner privs; sends the raw tail as data
               // plus a single-user target if one arg was given
               if (args.length >= 2) {
                  args_obj = {
                     target: args[1], data: args.slice(2).join(' ')
                  };
               } else {
                  // Bare /quota is a shortcut for LIST + showing the help
                  args_obj = {
                     target: 'LIST'
                  };
                  ChatBox.Append('<div><span class="notice">Usage: /quota [TX|BW] LIST | SHOW &lt;user&gt;... | ADD &lt;user&gt; &lt;amount&gt; | RESET &lt;user&gt;... | SET &lt;user&gt; &lt;amount&gt;</span></div>');
                  ChatBox.Append('<div><span class="notice">&nbsp;&nbsp;TX amounts use dhms (30m, 2h); BW uses whole decimal M/G/T/P units, with no suffix meaning M.</span></div>');
               }
               break;

            case 'rehash':
               // PARITY: rustyrig-fw/rrclient/cmd.admin.c: cmd_rehash()
               // Server checks admin/owner privs; reloads cfg + user db
               rrSendMessage(socket, {
                  "msg": { "type": "rehash" },
                  "ts": Math.floor(Date.now() / 1000)
               });
               ChatBox.Append('<div><span class="notice">Rehash requested from server</span></div>');
               break;
            case 'die':
            case 'restart':
               args_obj = {
                  reason: args.slice(1).join(' ') || ''
               };
               break;
            default:
               ChatBox.Append('<div><span class="error">Invalid command: ' + command + '</span></div>');
               break;
         }
         if (typeof args_obj === 'object' && args_obj !== null) {
            chat_send_command(command, args_obj);
         }
      } else {
        chat_msg = true;
        msg_type = "pub";
      }

      // Is this a user message that we should display?
      if (chat_msg) {
         var msgObj = {
            "msg": {
               "type": "talk"
            },
            "talk": {
               "cmd": "msg",
               "ts": Math.floor(Date.now() / 1000),

               "msg_type": msg_type,
               "data": message
            }
         };
         if (ChatBox.current_room && ChatBox.current_room !== webui_authoritative_room) {
            msgObj.talk.target = ChatBox.current_room;
            if (ChatBox.current_room.charAt(0) !== '#' &&
                ChatBox.current_room.charAt(0) !== '&') {
               msgObj.talk.msg_type = 'priv';
            }
         }
         if (private_target) msgObj.talk.target = private_target;
         rrSendMessage(socket, msgObj);
      }

      // Record the sent line in the input history (for up/down recall)
      /* PARITY: rustyrig-fw/librustyaxe/tui.keys.c history_add() */
      chat_history_add(message);

      // Clear the input field and after a delay re-focus it, to avoid flashing
      $('#chat-input').val('');
      setTimeout(function () {
           $('#chat-input').focus();
      }, 10);
   }
}

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

   get(name) {
      const entry = this.users[name] || null;
      if (!entry || typeof ChatBox === 'undefined' || !ChatBox.current_room ||
          entry.room === ChatBox.current_room) return entry;
      return null;
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

function user_link(username) {
   const className = username === auth_user ? 'my-link' : 'other-link';
   const action = 'show_user_menu(' + JSON.stringify(String(username)) + '); return false;';
   return '<a href="#" class="' + className + '" onclick="' + webui_escape_html(action) + '">' +
      webui_escape_html(username) + '</a>';
}

/*
      if (typeof input === 'undefined' || input === null) {
         return null;
      }
      this.input = $(input);
*/
function insert_at_cursor($input, text) {
   const start = $input.prop('selectionStart');
   const end = $input.prop('selectionEnd');
   const val = $input.val();
   $input.val(val.substring(0, start) + text + val.substring(end));
   $input[0].setSelectionRange(start + text.length, start + text.length);
}

function paste_plaintext(e, item) {
   item.getAsString(function(text) {
      const $input = $('#chat-input');
      const start = $input.prop('selectionStart');
      const end = $input.prop('selectionEnd');
      const val = $input.val();
      insert_at_cursor($('#chat-input'), text);
   });
}

function paste_html(e, item) {
   item.getAsString(function(html) {
      const text = $('<div>').html(html).text();
      insert_at_cursor($('#chat-input'), text);
   });
}

function handle_paste(e) {
   const items = (e.originalEvent || e).clipboardData.items;

   for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
         paste_image(e, item);
         break;
      } else if (item.type === 'text/plain') {			// Handle plaintext
         paste_plaintext(e, item);
         break;
      } else if (item.type === 'text/html') {			// Strip HTML tabs
         paste_html(e, item);
         break;
      } else {
         alert("PASTE: Unsupported file type: " + item.type);
         console.log("PASTE: Unsupported file type:", item.type);
         break;
      }
   }
}
//      const Inputbox = new WebUiInput('#chat-input');


/////////////////////////////////
/////////////////////////////////
/////////////////////////////////
function webui_parse_chat_msg(msgObj) {
   var cmd = msgObj.talk.cmd;
   var message = msgObj.talk.data;
   var rawTarget = msgObj.talk.target || msgObj.talk.room || null;
   var privateMsg = msgObj.talk.msg_type === 'priv' ||
      msgObj.talk.msg_type === 'privmsg';
   // The server echoes a private message to both endpoints with the same
   // target.  Show it in the counterpart's tab at the receiving endpoint.
   var targetRoom = privateMsg && msgObj.talk.from &&
      msgObj.talk.from !== auth_user ? msgObj.talk.from : rawTarget;
   var append = function(html) { ChatBox.Append(html, targetRoom); };

   /* PARITY: rustyrig-fw/rrclient/events.c:rrclient_handle_talk_msg
    * The server now tags join/chat events with their room.  Keep a small
    * client-side room model so side-room traffic and private targets do not
    * collapse into the rig conversation. */
   if (cmd === 'join' && msgObj.talk.user === auth_user && targetRoom &&
       typeof webui_room_controls !== 'undefined' && webui_room_controls[targetRoom]?.joined) {
      return;
   }

   if (targetRoom) {
      ChatBox.ensure_room(targetRoom, false);
   }

   if ((cmd === 'join' && msgObj.talk.user === auth_user || cmd === 'room-vfo') && targetRoom &&
       msgObj.room && typeof webui_room_controls !== 'undefined') {
      webui_room_controls[targetRoom] = {
         joined: true,
         vfoMask: Number(msgObj.room['vfo-mask'] || 0),
         tx: msgObj.room['tx-control'] !== undefined ? parse_bool_field(msgObj.room['tx-control']) :
            parse_bool_field(msgObj.room['has-vfos']) && /-rig[0-9]+$/i.test(targetRoom),
         tune: parse_bool_field(msgObj.room['has-vfos']) && parse_bool_field(msgObj.room['rx-tunable']),
         tuningMask: Number(msgObj.room['rx-tuning-mask'] || 0)
      };
      if (typeof ChatBox !== 'undefined' && ChatBox.current_room === targetRoom)
         webui_apply_room_controls(targetRoom);
   }
   if (cmd === 'join' && msgObj.talk.user === auth_user && targetRoom) {
      if (msgObj.room && msgObj.room.site) webui_authoritative_room = targetRoom;
      if (msgObj.room && msgObj.room['has-vfos'] && typeof mediaJoinRoom === 'function')
         mediaJoinRoom(targetRoom);
      ChatBox.ensure_room(targetRoom, true);
   }
   if (cmd === 'part' && targetRoom && msgObj.talk.user === auth_user &&
       msgObj.talk.session === auth_token) {
      if (typeof webui_room_controls !== 'undefined' && webui_room_controls[targetRoom])
         webui_room_controls[targetRoom].joined = false;
      if (typeof mediaPartRoom === 'function') mediaPartRoom(targetRoom);
      ChatBox.RemoveRoom(targetRoom);
   }

   if (cmd === 'topic') {
      append('<div class="chat-status notice">Topic: ' + webui_escape_html(msgObj.talk.topic || '(none)') + '</div>');
      return;
   }
   if (cmd === 'room-list') {
      webui_available_rooms = String(msgObj.talk.rooms || '').split(/\s+/)
         .filter(room => room.startsWith('#') || room.startsWith('&'));
      const roomControls = typeof webui_room_controls !== 'undefined' ? webui_room_controls : {};
      const joinedRooms = Object.keys(roomControls).filter(room => roomControls[room].joined);
      const openRooms = typeof ChatBox !== 'undefined' && ChatBox.rooms ?
         Object.keys(ChatBox.rooms) : [];
      webui_rejoin_open_rooms(openRooms, webui_available_rooms, joinedRooms, room =>
         rrSendMessage(socket, {
            msg: { type: 'talk' }, talk: { cmd: 'join', target: room }
         }));
      append('<div><span class="notice">Available rooms: ' +
         webui_escape_html(msgObj.talk.rooms || '(none)') + '</span></div>');
      return;
   }
   if (cmd === 'room-vfo-list') {
      var mappings = webui_escape_html(msgObj.talk.vfos || '(none)').replace(/\n/g, '<br>');
      append('<div><span class="notice">Room/VFO mappings: ' +
         mappings + '</span></div>');
      return;
   }
   if (cmd === 'room-removed') {
      if (targetRoom) webui_available_rooms = webui_available_rooms.filter(room => room !== targetRoom);
      if (targetRoom) ChatBox.RemoveRoom(targetRoom);
      ChatBox.Append('<div><span class="notice">Room removed: ' +
         webui_escape_html(targetRoom || '(unknown)') + '</span></div>');
      return;
   }

   // keep msg up top as it's the most frequently encountered command
   // XXX: Maybe we should keep a counter of received commands so we can optimize this a bit later??
   var msg_ts = msg_timestamp(msgObj.msg.ts);

   if (cmd === 'replay-start') {
      append('<div>' + msg_ts + ' *** Chat replay Start ***</div>');
   } else if (cmd === 'replay-complete') {
      append('<div>' + msg_ts + ' *** Chat replay End ***</div>');
   } else if (cmd === 'msg' && message) {
      var rawSender = msgObj.talk.from;
      var sender = webui_escape_html(rawSender || "");
      var msg_type = msgObj.talk.msg_type;

      if (msg_type === "file_chunk") {
         handle_file_chunk(msgObj);
      } else if (msg_type === "action" || msg_type == "pub") {
         message = msg_create_links(message);
         // Don't play a bell or set highlight on SelfMsgs
         if (rawSender === auth_user) {
            if (msg_type === 'action') {
               append('<div>' + msg_ts + ' <span class="chat-my-msg-prefix">&nbsp;==>&nbsp;</span>***&nbsp;' + sender + '&nbsp;***&nbsp;<span class="chat-my-msg">' + message + '</span></div>');
            } else if (msg_type === 'pub') {
               append('<div>' + msg_ts + ' <span class="chat-my-msg-prefix">&nbsp;==>&nbsp;</span><span class="chat-my-msg">' + message + '</span></div>');
            }
         } else {
            if (msg_type === 'action') {
               append('<div>' + msg_ts + ' ***&nbsp;<span class="chat-msg-prefix">&nbsp;' + sender + '&nbsp;</span>***&nbsp;<span class="chat-msg">' + message + '</span></div>');
            } else if (msg_type === 'pub') {
               append('<div>' + msg_ts + ' <span class="chat-msg-prefix">&lt;' + sender + '&gt;&nbsp;</span><span class="chat-msg">' + message + '</span></div>');
            }

            play_notify_bell();
            set_highlight("chat");
            // XXX: Update the window title to show a pending message
         }
      } else if (msg_type === "priv" || msg_type === "privmsg") {
         message = msg_create_links(message);
         append('<div>' + msg_ts + ' <span class="chat-msg-prefix">*' +
            sender + '*&nbsp;</span><span class="chat-msg">' +
            message + '</span></div>');
         if (rawSender !== auth_user) {
            play_notify_bell();
            set_highlight("chat");
         }
      } else if (msg_type === "replay-action" || msg_type == "replay-pub" || msg_type == 'replay-privmsg' || msg_type == 'replay-priv') {
         message = msg_create_links(message);

         if (msg_type === 'replay-action') {
            append('<div>' + msg_ts + ' ***&nbsp;<span class="chat-msg-prefix">&nbsp;' + sender + '&nbsp;</span>***&nbsp;<span class="chat-msg">' + message + '</span></div>');
         } else if (msg_type === 'replay-pub') {
            append('<div>' + msg_ts + ' <span class="chat-msg-prefix">&lt;' + sender + '&gt;&nbsp;</span><span class="chat-msg">' + message + '</span></div>');
         } else {  // replay-privmsg / replay-priv
            append('<div>' + msg_ts + ' <span class="chat-msg-prefix">*' + sender + '*&nbsp;</span><span class="chat-msg">' + message + '</span></div>');
         }
         set_highlight("chat");
         // XXX: Update the window title to show a pending message
      }
   } else if (cmd === 'join') {
      var user = msgObj.talk.user;
      var privs = msgObj.talk.privs;

      if (typeof user !== 'undefined') {
         var msg_ts = msg_timestamp(msgObj.msg.ts);
         var nl = user_link(user);
         var ptt_state = msgObj.talk.ptt;

         if (typeof ptt_state === 'undefined') {
            ptt_state = false;
         }

         var muted_state = parse_bool_field(msgObj.talk.muted);

         var sessions = msgObj.talk.sessions;
         if (typeof sessions !== 'undefined') {
            UserCache.add({ name: user, room: targetRoom, ptt: ptt_state, muted: muted_state, privs: privs, sessions: sessions });
         } else {
            UserCache.add({ name: user, room: targetRoom, ptt: ptt_state, muted: muted_state, privs: privs });
         }

         append('<div>' + msg_ts + ' ***&nbsp;<span class="chat-msg-prefix">' + nl + '&nbsp;</span><span class="chat-msg">connected to the radio</span>&nbsp;***</div>');
         // Play join (door open) sound if the bell button is checked
         if ($('#bell-btn').data('checked')) {
            if (!(user === auth_user)) {
               join_ding.currentTime = 0;  // Reset audio to start from the beginning
               join_ding.play();
            }
         }
      } else {
         console.log("got join for undefined user, ignoring");
      }
   } else if (cmd === 'kick') {
      var user = msgObj.talk.user;
      // Play leave (door close) sound if the bell button is checked
      if ($('#bell-btn').data('checked') && user && user !== auth_user) {
         leave_ding.currentTime = 0;  // Reset audio to start from the beginning
         leave_ding.play();
      }
      if (user) {
         UserCache.remove(user);
      }
      console.log("Kick command received for user:", user, " reason:", msgObj.talk.data);
   } else if (cmd === 'mute') {
      var user = msgObj.talk.user;
      // Shows a muted icon
      console.log("Mute command received for user:", user);
      UserCache.update({ name: user, muted: true });

      // this is for us, so disable the PTT button
      if (user === auth_user) {
         $('button.rig-ptt').attr("disabled", "disabled");
      }
   } else if (cmd === "quit") {
      var user = msgObj.talk.user;
      var reason = msgObj.talk.reason;

      if (user) {
         var msg_ts = msg_timestamp(msgObj.msg.ts);
         if (typeof reason === 'undefined') {
            reason = 'Client exited';
         }

         /* PARITY: rrclient/events.c:rrclient_handle_quit; a quit is per session. */
         var sessions = msgObj.talk.sessions;
         if (typeof sessions !== 'undefined') {
            UserCache.update({ name: user, sessions: sessions });
         } else {
            UserCache.remove(user);
         }
         // Play leave (door close) sound if the bell button is checked
         if ($('#bell-btn').data('checked')) {
            if (user !== auth_user) {
               leave_ding.currentTime = 0;  // Reset audio to start from the beginning
               leave_ding.play();
            }
         }

         append('<div>' + msg_ts + ' ***&nbsp;<span class="chat-msg-prefix">' + webui_escape_html(user) + '&nbsp;</span><span class="chat-msg">disconnected: ' + webui_escape_html(reason) + '</span>&nbsp;***</div>');
      } else {
         console.log("got %s for undefined user, ignoring", cmd);
      }
   } else if (cmd === "userinfo") {
      parse_userinfo_reply(msgObj);
   } else if (cmd === "unmute") {
      var user = msgObj.talk.user;
      UserCache.update({ name: user, muted: false });

      // this is for us, so re-enable the PTT button, if appropriate
      if (user === auth_user) {
         $('button.rig-ptt').removeAttr("disabled");
      }
   } else if (cmd === 'whois') {
      // Flat whois reply (see srv.chat.c): talk.username/email/privs/muted/sessions
      // talk.connected/last_heard (unix ts) and talk.ua
      // Rendered IRC-style in the chat scrollback
      const username = msgObj.talk.username;

      if (!username) {
         return;
      }

      const who_ts = msg_timestamp(msgObj.msg.ts);
      const who_line = (text, cls) => {
         append(`<div>${who_ts}&nbsp;<span class="chat-msg-prefix">***&nbsp;</span><span class="${cls || 'chat-msg'}">${text}</span></div>`);
      };

      who_line(`Whois for <b>${webui_escape_html(username)}</b>`, 'notice');
      who_line(`Email:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${webui_escape_html(msgObj.talk.email || 'none')}`);
      who_line(`Privileges:&nbsp;&nbsp;${webui_escape_html(msgObj.talk.privs || 'None')}`);
      if (parse_bool_field(msgObj.talk.muted)) {
         who_line(`This user is currently MUTEd. Rigctl is temporarily suspended.`, 'error');
      }
      who_line(`Sessions:&nbsp;&nbsp;&nbsp;&nbsp;${webui_escape_html(msgObj.talk.sessions || 0)}`);
      if (msgObj.talk.connected) {
         who_line(`Connected:&nbsp;&nbsp;&nbsp;${new Date(msgObj.talk.connected * 1000).toLocaleString()}`);
      }
      if (msgObj.talk.last_heard) {
         who_line(`Last heard:&nbsp;&nbsp;${new Date(msgObj.talk.last_heard * 1000).toLocaleString()}`);
      }
      who_line(`Client:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${webui_escape_html(msgObj.talk.ua || 'unknown')}`);
      const usage = msgObj.talk.usage;
      if (usage && usage['total-bytes'] !== undefined) {
         who_line(`Usage: ${webui_escape_html(usage['total-bytes'])} bytes; BW remaining ${webui_escape_html(usage['bandwidth-remaining'])}; TX ${webui_escape_html(usage['tx-seconds'])}s; session time ${webui_escape_html(usage['session-seconds'])}s`);
         who_line(`Frames: TX text ${webui_escape_html(usage['tx-text-frames'])} / binary ${webui_escape_html(usage['tx-binary-frames'])}; RX text ${webui_escape_html(usage['rx-text-frames'])} / binary ${webui_escape_html(usage['rx-binary-frames'])}`);
      }
      who_line(`End of WHOIS ${webui_escape_html(username)}`, 'notice');
   } else {
      console.log("Unknown talk command:", cmd, "msg:", msgData);
   }
}
