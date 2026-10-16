////////////////
// Chat Stuff //
////////////////
//
// Utility functions used stand-alone elsewhere
//
// Convert http(s) urls into clickable links
// Escape chat text and decorate HTTP(S) URLs without HTML injection.
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

// PARITY: rustyrig-fw/rrclient/gtk/gtk.chat.c gtk_chat_link_inserted/link_event.
// Decorate text only, leaving existing links and all HTML attributes intact.
// Decorate room references without changing existing anchors or attributes.
function chat_room_links(html) {
   let inAnchor = false;
   return String(html).replace(/(<(?:[^"'<>]|"[^"]*"|'[^']*')*>)|([^<]+)/g, (part, tag, text) => {
      if (tag) {
         if (/^<a(?:\s|>)/i.test(tag)) inAnchor = true;
         if (/^<\/a\s*>/i.test(tag)) inAnchor = false;
         return tag;
      }
      if (inAnchor) return text;
      return text.replace(/(^|[^A-Za-z0-9_/#&])(#([A-Za-z0-9_][A-Za-z0-9_.+-]*))/g,
         (match, prefix, room) => {
            const clean = room.replace(/\.+$/, '');
            return prefix + '<a href="#" class="chat-room-link" data-room="' + clean + '">' +
               clean + '</a>' + room.slice(clean.length);
         });
   });
}

// Callsign responses contain data returned by an external lookup service.
// Escape it before inserting it into the chat DOM.
// Escape untrusted text before inserting it into chat HTML.
function webui_escape_html(value) {
   return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
}

/* PARITY: rustyrig-fw/rrclient/events.c:rrclient_handle_callsign */
// Render an escaped structured callsign lookup response.
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
// Interpret wire boolean values used in chat and roster messages.
function parse_bool_field(val) {
   return val === true || val === 'true';
}

/* PARITY: rustyrig-fw/rrclient/cmd.c:client_cmds and cmd.help.c:cmd_help */
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
      this.output.on('click', 'a.chat-room-link', event => {
         event.preventDefault();
         if (typeof window.getSelection === 'function' && String(window.getSelection())) return;
         this.ActivateRoom(event.currentTarget.getAttribute('data-room'));
      });
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
         if (typeof webui_room_audio_route === 'function') {
            const output = $('<select aria-label="RX audio output"></select>')
               .attr('data-audio-room', room).attr('title', 'Left / Right / Stereo (both ears) / Muted');
            ['L', 'R', 'S', 'M'].forEach(value => output.append($('<option></option>').val(value).text(value)));
            output.val(webui_room_audio_route(room));
            output.on('change', () => webui_set_room_audio_route(room, output.val()));
            const group = $('<span class="chat-room-tab"></span>').append(tab, output);
            $('#chat-room-tabs').append(group);
         } else $('#chat-room-tabs').append(tab);
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
      if (typeof ptt_button_apply === 'function') ptt_button_apply();
      if (typeof UserCache !== 'undefined') cul_render();
      this.output.html(this.rooms[room] || '');
      $('#chat-room-tabs button').each(function() {
         $(this).toggleClass('active', $(this).attr('data-room') === room);
      });
      this.output.scrollTop(this.output[0].scrollHeight);
      return room;
   }

   ActivateRoom(room) {
      if (!/^#[A-Za-z0-9_][A-Za-z0-9_.+-]*$/.test(room)) return;
      const existing = Object.keys(this.rooms).find(name => name.toLowerCase() === room.toLowerCase());
      if (existing) {
         this.SwitchRoom(existing);
      } else {
         rrSendMessage(socket, {msg: {type: 'talk'}, talk: {cmd: 'join', target: room}});
      }
   }

   RemoveRoom(room) {
      if (!room || !Object.prototype.hasOwnProperty.call(this.rooms, room)) return;
      delete this.rooms[room];
      const removed = $('#chat-room-tabs button').filter(function() {
         return $(this).attr('data-room') === room;
      });
      if (typeof webui_room_audio_route === 'function') removed.parent('.chat-room-tab').remove();
      else removed.remove();
      if (this.current_room === room) {
         const next = Object.keys(this.rooms)[0] || webui_authoritative_room || '#rig';
         this.ensure_room(next, true);
      }
   }

   // Add a message to the chat
   Append(msg, room) {
      msg = chat_room_links(msg);
      room = this.ensure_room(room, false);
      this.output = $(this.output_selector);
      if (room !== this.current_room) {
         this.rooms[room] += msg;
         return;
      }
      // PARITY: rrclient/gtk/gtk.core.c ui_print_gtk; preserve a reader's viewport.
      const output = this.output[0];
      const previousTop = output.scrollTop;
      const follow = previousTop + output.clientHeight >= output.scrollHeight - 1;
      const previousHeight = output.scrollHeight;
      // limit scrollback to 1000 items
      const $messages = this.output.children();

      // Limit scrollback size
      if ($messages.length > this.scrollback_max_lines) {
         $messages.slice(0, this.scrollback_purge_lines).remove();
      }

      const removedHeight = previousHeight - output.scrollHeight;
      // Add the message to the chatbox and persist the active room's scrollback.
      this.output.append(msg);
      if (!follow) output.scrollTop = Math.max(0, previousTop - removedHeight);
      this.rooms[room] = this.output.html();

      const expectedTop = output.scrollTop;
      if (follow) setTimeout(() => {
         if (room === this.current_room && output.scrollTop === expectedTop) output.scrollTop = output.scrollHeight;
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

// Clear the active room scrollback if the chat view exists.
function chatbox_clear() {
   if (typeof ChatBox !== 'undefined' && ChatBox.Clear) {
      ChatBox.Clear();
   } else {
      $('#chat-box').empty();
   }
}

// Construct the room view and install input handlers during UI initialization.
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

// Construct and send a room/user command using the active chat context.
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

// Build an escaped user action link from a roster or message sender.
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
// Insert pasted text at the input selection and restore the caret.
function insert_at_cursor($input, text) {
   const start = $input.prop('selectionStart');
   const end = $input.prop('selectionEnd');
   const val = $input.val();
   $input.val(val.substring(0, start) + text + val.substring(end));
   $input[0].setSelectionRange(start + text.length, start + text.length);
}

// Read a plain-text clipboard item into the chat input.
function paste_plaintext(e, item) {
   item.getAsString(function(text) {
      const $input = $('#chat-input');
      const start = $input.prop('selectionStart');
      const end = $input.prop('selectionEnd');
      const val = $input.val();
      insert_at_cursor($('#chat-input'), text);
   });
}

// Extract clipboard HTML text for insertion into the chat input.
function paste_html(e, item) {
   item.getAsString(function(html) {
      const text = $('<div>').html(html).text();
      insert_at_cursor($('#chat-input'), text);
   });
}

// Select the supported clipboard representation for chat input.
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
// Dispatch incoming room, roster and message updates to their chat presentation.
function webui_parse_chat_msg(msgObj) {
   var cmd = msgObj.talk.cmd;
   if (cmd === "supervise") {
      if (typeof supervisionResult === "function") supervisionResult(msgObj);
      return;
   }
   if (cmd === "admin") {
      if (typeof adminResult === "function") adminResult(msgObj);
      return;
   }
   var message = msgObj.talk.data;
   var rawTarget = msgObj.talk.target || msgObj.talk.room || null;
   var privateMsg = msgObj.talk.msg_type === 'priv' ||
      msgObj.talk.msg_type === 'privmsg';
   // The server echoes a private message to both endpoints with the same
   // target.  Show it in the counterpart's tab at the receiving endpoint.
   var targetRoom = privateMsg && msgObj.talk.from &&
      msgObj.talk.from !== auth_user ? msgObj.talk.from : rawTarget;
   var append = function(html) { ChatBox.Append(html, targetRoom); };

   if (cmd === 'room-state' && targetRoom) {
      const policy = webui_room_controls[targetRoom] || (webui_room_controls[targetRoom] = {});
      policy.offline = !parse_bool_field(msgObj.talk.connected);
      if (policy.offline) {
         for (const [name, user] of Object.entries(UserCache.users)) {
            if (user.room === targetRoom) delete UserCache.users[name];
         }
         policy.joined = false;
         if (typeof mediaPartRoom === 'function') mediaPartRoom(targetRoom);
      }
      if (ChatBox.current_room === targetRoom) {
         cul_render();
         if (typeof ptt_button_apply === 'function') ptt_button_apply();
      }
      append('<div class="notice">Room ' + (policy.offline ? 'OFFLINE; draft retained until its owner returns.' : 'ONLINE') + '</div>');
      return;
   }
   /* PARITY: rustyrig-fw/rrclient/events.c:rrclient_handle_talk_msg
    * The server now tags join/chat events with their room.  Keep a small
    * client-side room model so side-room traffic and private targets do not
    * collapse into the rig conversation. */
   if (cmd === 'join' && msgObj.talk.user === auth_user && targetRoom &&
       typeof webui_room_controls !== 'undefined' && webui_room_controls[targetRoom]?.joined && !webui_room_controls[targetRoom]?.offline) {
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
      const policy = webui_room_controls[targetRoom] || (webui_room_controls[targetRoom] = {});
      policy.offline = false;
      policy.joined = true;
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
      // PARITY: rustyrig-fw/rrclient/events.c LIST decoration is presentation only.
      const remoteRooms = new Set(String(msgObj.talk['remote-rooms'] || '').split(/\s+/).map(room => room.toLowerCase()));
      if (msgObj.talk.servers) append('<div><span class="notice">Servers (↗ remote): ' +
         webui_escape_html(msgObj.talk.servers) + '</span></div>');
      append('<div><span class="notice">Available rooms: ' +
         webui_escape_html(webui_available_rooms.map(room => (remoteRooms.has(room.toLowerCase()) ? '↗' : '') + room).join(' ') || '(none)') + '</span></div>');
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
      } else if (msg_type === "notice") {
         // PARITY: rustyrig-fw/rrclient/events.c notice replies, including /users.
         append('<div class="chat-status notice">' + sender + ': ' + webui_escape_html(message) + '</div>');
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
         /* PARITY: rrclient/events.c rrclient_handle_whois quota status. */
         who_line(`Quotas: TX remaining ${webui_escape_html(usage['tx-remaining'])}s (${usage['tx-enforced'] ? 'enforced' : 'advisory'}); BW ${webui_escape_html(usage['bandwidth-status'])} (warning only)`);
         who_line(`Usage: ${webui_escape_html(usage['total-bytes'])} bytes; BW remaining ${webui_escape_html(usage['bandwidth-remaining'])}; TX ${webui_escape_html(usage['tx-seconds'])}s; session time ${webui_escape_html(usage['session-seconds'])}s`);
         who_line(`Frames: TX text ${webui_escape_html(usage['tx-text-frames'])} / binary ${webui_escape_html(usage['tx-binary-frames'])}; RX text ${webui_escape_html(usage['rx-text-frames'])} / binary ${webui_escape_html(usage['rx-binary-frames'])}`);
      }
      who_line(`End of WHOIS ${webui_escape_html(username)}`, 'notice');
   } else {
      console.log("Unknown talk command:", cmd, "msg:", msgData);
   }
}
