// Input command parsing and outgoing chat construction. See native rrclient/cmd.chat.c.
// Loaded after webui.chat.js; globals retain their existing public names.

var unmute_vol = $('#rig-rx-vol').val();

// Resolve media list/subscription commands against the current room.
function chat_media_command(args) {
   // PARITY: rustyrig-fw/rrclient/media.c: cmd_media()
   var sub = (args.length > 1 ? args[1].toLowerCase() : 'list');

   if (sub === 'list' || sub === '') {
      mediaListChannels();
      if (args.length < 2) {
         requestMediaChannels();
      }
   } else if (sub === 'sub' || sub === 'subscribe' ||
              sub === 'unsub' || sub === 'unsubscribe') {
      var unsub = sub.startsWith('un');
      var transport = null, target = null, invalid = false;
      args.slice(2).forEach(arg => {
         const option = arg.toLowerCase();
         if (option === '-direct' || option === '-proxy') {
            if (unsub || transport) invalid = true;
            transport = option;
         } else if (arg && arg[0] !== '-' && !target) target = arg;
         else invalid = true;
      });
      if (invalid || !target) {
         mediaCommandNotice('Usage: /media ' + sub + ' [-direct|-proxy] <name|uuid|#number>', true);
         return;
      }
      if (transport === '-direct') {
         mediaCommandNotice('Direct RTP requires the native client; use -proxy in the browser', true);
         return;
      }
      var chan = mediaChanLookup(target);

      if (!chan) {
         mediaCommandNotice("Unknown or ambiguous channel '" + target +
            "'; use /media list and choose a name, #number or UUID", true);
         return;
      }
      const label = chan.name || chan.uuid;
      if (unsub) {
         if (!chan.subscribed) mediaCommandNotice('Not subscribed to ' + label);
         else {
            mediaCommandNotice('Unsubscribing from ' + label);
            unsubscribeMediaChannel(chan.uuid, false, transport === '-proxy' ? 'ws' : null);
         }
      } else {
         if (chan.subscribed && !transport) mediaCommandNotice('Already subscribed to ' + label);
         else {
            mediaCommandNotice('Subscribing to ' + label);
            subscribeMediaChannel(chan.uuid, false, transport === '-proxy' ? 'ws' : null);
         }
      }
   } else {
      ChatBox.Append('<div><span class="error">Usage: /media [LIST | SUB|SUBSCRIBE &lt;name|uuid|#number&gt; | UNSUB|UNSUBSCRIBE &lt;name|uuid|#number&gt;]</span></div>',ChatBox.current_room);
   }
}

// Parse one input line, retain offline drafts, and dispatch chat or commands.
function parse_chat_cmd(e) {
   var message = $('#chat-input').val().trim();
   if (message && message[0] !== '/' && typeof webui_room_controls !== 'undefined' &&
       webui_room_controls[ChatBox.current_room]?.offline) {
      ChatBox.Append('<div class="notice">Room is OFFLINE; draft retained.</div>', ChatBox.current_room);
      return;
   }
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
            case 'receivers': rrReceiverCommand(args); break;
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
                  ChatBox.Append('<div><span class="error">Usage: /query user [message]</span></div>');
               } else {
                  // PARITY: rrclient/cmd.chat.c:cmd_query
                  private_target = args[1];
                  ChatBox.ensure_room(private_target, true);
                  if (args.length > 2) {
                     message = args.slice(2).join(' ');
                     chat_msg = true;
                     msg_type = "priv";
                  }
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
            case 'rxroute':
               if (args.length !== 2 || !webui_set_room_audio_route(ChatBox.current_room, args[1].toUpperCase())) {
                  ChatBox.Append('<div class="error">Usage: /rxroute L|R|S|M</div>');
               }
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
            case 'webcam':
               mediaWebcam(!/^(hide|close)$/i.test(args[1] || 'show'));
               break;
            case 'media':
               chat_media_command(args);
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
            // PARITY: rustyrig-fw/rrclient/cmd.chat.c cmd_users().
            case 'users':
               args_obj = {target: ChatBox.current_room};
               break;
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

            case 'supervise':
               if (args.length !== 4) {
                  ChatBox.Append($('<div class="error"></div>').text('Usage: /supervise accept|decline <request-id> <rig-room>. Accepting assumes responsibility as control operator.'));
                  return;
               }
               args_obj = {data: args.slice(1, 3).join(' '), room: args[3]};
               break;
            case 'link':
            case 'admin':
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
