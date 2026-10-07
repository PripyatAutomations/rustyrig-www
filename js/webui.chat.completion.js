/////
/// chat stuff that needs to move
////
let completing = false;
let completionList = [];
let completionIndex = 0;
let matchStart = 0;
let matchLength = 0;

/* PARITY: rustyrig-fw/librustyaxe/tui.keys.c history_add()/history_prev()/history_next() */
let inputHistory = [];
let inputHistoryIndex = -1;   // -1 means "at the prompt" (no entry recalled)
const INPUT_HISTORY_MAX = 50; // HISTORY_LINES in tui.h

function webui_room_rejoin_candidates(openRooms, availableRooms, joinedRooms) {
   const available = new Set((availableRooms || []).map(room => room.toLowerCase()));
   const joined = new Set((joinedRooms || []).map(room => room.toLowerCase()));
   const candidates = new Map();
   (openRooms || []).forEach(room => {
      if (!room || (room[0] !== '#' && room[0] !== '&')) return;
      const key = room.toLowerCase();
      if (available.has(key) && !joined.has(key)) candidates.set(key, room);
   });
   return Array.from(candidates.values());
}

function chat_history_add(line) {
   if (!line) {
      return;
   }
   // avoid consecutive duplicates, like most shells
   if (inputHistory.length && inputHistory[inputHistory.length - 1] === line) {
      inputHistoryIndex = -1;
      return;
   }
   inputHistory.push(line);
   if (inputHistory.length > INPUT_HISTORY_MAX) {
      inputHistory.shift();
   }
   inputHistoryIndex = -1;
}

function showPreviousInput() {
   if (!inputHistory.length) {
      return;
   }
   if (inputHistoryIndex < 0) {
      inputHistoryIndex = inputHistory.length - 1;
   } else if (inputHistoryIndex > 0) {
      inputHistoryIndex--;
   }
   $('#chat-input').val(inputHistory[inputHistoryIndex]);
}

function showNextInput() {
   if (!inputHistory.length || inputHistoryIndex < 0) {
      return;
   }
   inputHistoryIndex++;
   if (inputHistoryIndex >= inputHistory.length) {
      inputHistoryIndex = -1;
      $('#chat-input').val('');
      return;
   }
   $('#chat-input').val(inputHistory[inputHistoryIndex]);
}

// PARITY: rustyrig-fw/rrclient/cmd.completion.c (shared command parameters)
function chat_parameter_candidates(beforeCaret) {
   const word = /\S*$/.exec(beforeCaret)[0];
   const tokens = beforeCaret.slice(0, beforeCaret.length - word.length).trim().split(/\s+/);
   const command = tokens[0].toLowerCase();
   const arg = tokens.length;
   const first = (tokens[1] || '').toUpperCase();
   let values = [];
   if (command === '/join' || command === '/j') {
      if (arg === 1) {
         const joined = typeof ChatBox !== 'undefined' && ChatBox.rooms ?
            Object.keys(ChatBox.rooms).filter(room => room.startsWith('#') || room.startsWith('&')) : [];
         const available = typeof webui_available_rooms !== 'undefined' ? webui_available_rooms : [];
         values = [...new Set([...joined, ...available])];
      }
   } else if (['/whois', '/kick', '/mute', '/unmute', '/msg', '/query'].includes(command)) {
      if (arg === 1) values = getCULNames();
   } else if (command === '/rig' || command === '/gps') {
      if (arg === 1) values = ['LIST', 'SUBSCRIBE', 'UNSUBSCRIBE'];
      if (command === '/gps' && arg === 2 && ['SUBSCRIBE','UNSUBSCRIBE'].includes(first)) {
         const channels = typeof mediaChannels === 'undefined' ? {} : mediaChannels;
         values = Object.values(channels).filter(ch => (typeof mediaResourceMatches !== 'function' || mediaResourceMatches(ChatBox.current_room,ch.controlRoom || ch.room)) && ch.codec === 'gpsp' && ch.name?.endsWith('.gps.rx') &&
            (first !== 'UNSUBSCRIBE' || ch.subscribed)).map(ch => ch.name.slice(0,-7));
      }
   } else if (command === '/sercom') {
      if (arg === 1) values = ['LIST', 'REMOTE', 'ATTACH', 'DISCONNECT'];
   } else if (command === '/user') {
      const staff = typeof webui_is_staff === 'function' && webui_is_staff(auth_privs);
      if (arg === 1) values = staff ? ['LIST', 'ADD', 'REMOVE', 'LOCK', 'UNLOCK', 'PRIVS', 'OLDPW', 'RESETPW', 'PASS', 'HELP'] : ['PASS'];
      if (arg === 2 && first === 'PASS') values = staff ? getCULNames() : [auth_user];
      if (arg === 2 && staff && ['REMOVE', 'LOCK', 'UNLOCK', 'PRIVS', 'RESETPW'].includes(first)) values = getCULNames();
      if (arg === 3 && staff && first === 'PRIVS') values = ['LIST', 'ADD', 'REMOVE', 'SET'];
   } else if (command === '/quota') {
      if (arg === 1) values = ['LIST', 'SHOW', 'ADD', 'RESET', 'SET', 'HELP'];
      if (arg === 1 || ['SHOW', 'RESET'].includes(first) ||
          (arg === 2 && ['ADD', 'SET'].includes(first))) values = values.concat(getCULNames());
   } else if (command === '/room') {
      if (arg === 1) values = ['LIST', 'ADD', 'REMOVE', '#'];
      else if (arg === 2 && ['ADD', 'REMOVE'].includes(first.toUpperCase())) values = ['#'];
      else if (arg >= 3 && first.toUpperCase() === 'REMOVE') values = ['--force', '--history', '-f', '-h'];
      else if (arg === 2 && first.startsWith('#')) values = ['ADD', 'REMOVE', 'VFO'];
      else if (arg === 3 && tokens[2] && tokens[2].toUpperCase() === 'VFO') values = ['ADD', 'LIST', 'REMOVE'];
   } else if (command === '/media' || command === '/rxcodec' || command === '/txcodec') {
      const media = command === '/media';
      const tx = command === '/txcodec';
      if (arg === 1 && !media) values = ['LIST','NONE'].concat(typeof webui_audio_codec_list === 'function' ? webui_audio_codec_list() : []);
      if (arg === 1 && media) values = ['LIST', 'SUBSCRIBE', 'UNSUBSCRIBE', 'SUB', 'UNSUB'];
      if (arg === 2 && (media ? ['SUBSCRIBE', 'UNSUBSCRIBE', 'SUB', 'UNSUB'].includes(first) : first !== 'LIST')) {
         const channels = typeof mediaChannels === 'undefined' ? {} : mediaChannels;
         const numbers = typeof mediaLastList === 'undefined' ? [] : mediaLastList;
         Object.keys(channels).forEach(uuid => {
            if (typeof mediaResourceMatches === 'function' && !mediaResourceMatches(ChatBox.current_room,channels[uuid].controlRoom || channels[uuid].room)) return;
            if (media ? (first.startsWith('UN') && !channels[uuid].subscribed) :
                (channels[uuid].subsystem !== 1 || channels[uuid].dir !== (tx ? 1 : 0) || (!channels[uuid].subscribed && !channels[uuid].disabled))) return;
            const named = channels[uuid].name && !/\s/.test(channels[uuid].name) && Object.values(channels).filter(ch =>
               ch.name?.toLowerCase() === channels[uuid].name.toLowerCase()).length === 1;
            if (named) values.push(channels[uuid].name);
            if (word || !named) values.push(uuid);
            const number = numbers.indexOf(uuid) + 1;
            if (number && /^#?[0-9]/.test(word)) values.push((word.startsWith('#') ? '#' : '') + number);
            else if (number && word.startsWith('#')) values.push('#' + number);
         });
      }
   } else if (command === '/object') {
      if (arg === 1 && typeof rrObjectReferences === 'function') {
         const objects = rrObjectReferences();
         for (const object of objects) {
            if (typeof rrObjectInContext === 'function' && !rrObjectInContext(object,objects,ChatBox.current_room)) continue;
            const named = object.symbol && !/\s/.test(object.symbol);
            if (named) values.push(object.symbol);
            if (word || !named) values.push(object.uuid);
         }
      }
   } else if (command === '/syslog') {
      if (arg === 1) values = ['on', 'off'];
   } else {
      return null;
   }
   return [...new Set(values)].filter(value => value.toLowerCase().startsWith(word.toLowerCase()));
}

function handle_chat_completion(e) {
   const input = $('#chat-input');
   const text = input.val();
   const caretPos = this.selectionStart;

   if (e.key === 'Tab') {
      e.preventDefault();

      if (!completing) {
         const beforeCaret = text.slice(0, caretPos);

         const candidates = chat_parameter_candidates(beforeCaret);
         if (candidates !== null) {
            const word = /\S*$/.exec(beforeCaret)[0];
            if (candidates.length) {
               completionList = candidates;
               matchStart = caretPos - word.length;
               matchLength = word.length;
               completing = true;
               completionIndex = 0;
               const current = completionList[completionIndex++];
               input.val(text.slice(0, matchStart) + current + text.slice(caretPos));
               const newCaret = matchStart + current.length;
               this.setSelectionRange(newCaret, newCaret);
               updateCompletionIndicator(current);
               completionIndex %= completionList.length;
            }
            return;
         }

         const match = beforeCaret.match(/@(\w*)$/);

         if (match) {
            const word = match[1];
            matchStart = match.index;  // includes the @
            matchLength = word.length;
            const afterCaret = text.slice(caretPos);

            completionList = getCULNames().filter(name => name.toLowerCase().startsWith(word.toLowerCase()));

            if (!completionList.length) {
               return;
            }

            completing = true;
            completionIndex = 0;

            const current = completionList[completionIndex];
            const completed = text.slice(0, matchStart - 1) + current + afterCaret;

            input.val(completed);
            const newCaret = matchStart - 1 + current.length;
            this.setSelectionRange(newCaret, newCaret);
            updateCompletionIndicator(current);
            completionIndex = (completionIndex + 1) % completionList.length;
         }
      }
      if (completing && completionList.length) {
         const currentName = completionList[completionIndex];
         const atStart = matchStart === 0;
         const suffix = atStart ? ": " : (!text.startsWith("/") ? ", " : " ");
         const completedText = text.slice(0, matchStart) + currentName + suffix + text.slice(caretPos);

         input.val(completedText);
         const newCaret = matchStart + currentName.length + suffix.length;
         this.setSelectionRange(newCaret, newCaret);

         updateCompletionIndicator(currentName);
         completionIndex = (completionIndex + 1) % completionList.length;
      }
   } else if (e.key === 'Escape') {
      if (completing) {
         input.val(originalText);
         this.setSelectionRange(matchStart + 1 + originalPrefix.length, matchStart + 1 + originalPrefix.length);
         completing = false;
         updateCompletionIndicator(null);
      }
   } else if (completing && !e.key.match(/^[a-zA-Z0-9]$/)) {
      completing = false;
      updateCompletionIndicator(null);
   } else if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();

      let chatBox = $("#chat-box");
      let pageScrollAmount = chatBox.outerHeight();

      if (e.ctrlKey) {
         if (e.key === "ArrowUp") {
            showPreviousInput();
         } else if (e.key === "ArrowDown") {
            showNextInput();
         }
         return;
      } else {
         // Plain up/down walks the input history; PageUp/PageDown scroll the chat box
         if (e.key === "ArrowUp") {
            showPreviousInput();
            return;
         } else if (e.key === "ArrowDown") {
            showNextInput();
            return;
         } else if (e.key === "PageUp") {
            chatBox.scrollTop(chatBox.scrollTop() - pageScrollAmount);
         } else if (e.key === "PageDown") {
            chatBox.scrollTop(chatBox.scrollTop() + pageScrollAmount);
         }
      }
   } else if (completing && (e.key === ' ' || e.key === 'Enter')) {
      // Finalize current match
      const finalName = completionList[(completionIndex - 1 + completionList.length) % completionList.length];
      const finalizedText = text.slice(0, matchStart) + finalName + text.slice(caretPos);
      input.val(finalizedText);

      const newCaret = matchStart + finalName.length;
      this.setSelectionRange(newCaret, newCaret);
      completing = false;
      updateCompletionIndicator(null);
   }
}

function getCULNames() {
   return UserCache.get_all().map(user => user.name);
}

function updateCompletionIndicator(name) {
   if (name) {
      const line = $('#chat-input').val();
      let label = name;
      if (/^\/(media|gps|rxcodec|txcodec)\s/i.test(line) && typeof mediaChanLookup === 'function') {
         const ch = mediaChanLookup(/^\/gps\s/i.test(line) ? name + '.gps.rx' : name);
         if (ch) label += ' — ' + (ch.descr || ch.name || '') + ' [' +
            (ch.dir === 1 ? 'TX' : 'RX') + ' ' + (ch.codec || '----') + '; ' +
            (ch.subscribed ? 'subscribed' : 'unsubscribed') + '; room ' + (ch.room || 'any') +
            (ch.room && !ch.joined ? '; join first' : '') + ']';
      }
      if (/^\/object\s/i.test(line) && typeof rrObjectReferences === 'function') {
         const object = rrObjectReferences().find(o => o.symbol.toLowerCase() === name.toLowerCase() || o.uuid.toLowerCase() === name.toLowerCase());
         if (object) label += ' — ' + object.type + ' ' + (object.name || object.symbol);
      }
      $('#completion-indicator').text(`🔍 COMPLETING: ${label}`).show();
   } else {
      $('#completion-indicator').hide();
   }
}
