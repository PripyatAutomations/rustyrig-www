//
// www/js/webui.media.js: media channel subscribe handling (browser client)
//    This is part of rustyrig-fw.
// https://github.com/pripyatautomations/rustyrig-fw
//
// Do not pay money for this, except donations to the project, if you wish to.
// The software is not for sale. It is freely available, always.
//
// Licensed under MIT license, if built without mongoose or GPL if built with.
//
// PARITY: librrprotocol/ws.mediachan.c (server side)
// PARITY: rrclient/media.c (native client)
//
// The server sends a `media.available` message per streamable channel
// (one per subsystem/direction/vfo/rig). The browser client tracks them,
// auto-subscribes the audio RX/TX pair for the active VFO, and re-emits
// the messages so other modules can subscribe to more channels.
//
"use strict";

var mediaChannels = {};        // uuid -> { name, subsystem, dir, vfo, rig, descr, codec, subscribed, disabled }
var mediaReady = false;
var mediaRoom = "";

function mediaRoomMatches(entry) {
   return !entry.room || (entry.joined && entry.room.toLowerCase() === mediaRoom.toLowerCase());
}

function mediaRoomPolicy(room) {
   return typeof webui_room_controls !== 'undefined' ? webui_room_controls[room] : null;
}
function mediaSameRig(room, base) {
   return !!room && !!base && (room.toLowerCase() === base.toLowerCase() ||
      room.toLowerCase().startsWith(base.toLowerCase() + '.'));
}
function mediaProjectRxRoom(entry, room) {
   const policy = mediaRoomPolicy(room);
   if (entry.dir !== 0 || !policy || !policy.joined || !mediaSameRig(room, entry.controlRoom)) return;
   entry.room = room;
   entry.joined = entry.vfo < 26 && !!(policy.vfoMask & (1 << entry.vfo));
}

// PARITY: rrclient/media.c rrclient_media_room_joined/parted.
function mediaJoinRoom(room) {
   mediaRoom = room || "";
   const policy = mediaRoomPolicy(mediaRoom);
   if (policy && policy.vfoMask && !(policy.vfoMask & (1 << vfoLetterToId(activeVfoId())))) {
      for (let index = 0; index < 26; index++) if (policy.vfoMask & (1 << index)) {
         active_vfo = String.fromCharCode(65 + index); break;
      }
   }
   Object.keys(mediaChannels).forEach(uuid => mediaProjectRxRoom(mediaChannels[uuid], mediaRoom));
   mediaSyncActiveVfo();
   if (typeof webui_refresh_room_vfo === 'function') webui_refresh_room_vfo();
}

function mediaSelectRoom(room) {
   const policy = mediaRoomPolicy(room);
   if (policy && policy.joined && policy.vfoMask) { mediaJoinRoom(room); return; }
   if (Object.keys(mediaChannels).some(function(uuid) {
      var entry = mediaChannels[uuid];
      return entry.room && entry.room.toLowerCase() === room.toLowerCase() && entry.joined;
   })) mediaJoinRoom(room);
}

function mediaPartRoom(room) {
   Object.keys(mediaChannels).forEach(function(uuid) {
      var entry = mediaChannels[uuid];
      if (entry.room && entry.room.toLowerCase() === room.toLowerCase()) entry.joined = false;
   });
   if (mediaRoom.toLowerCase() === room.toLowerCase()) mediaRoom = "";
   mediaSyncActiveVfo();
}

function subscribeMediaChannel(uuid, automatic) {
   if (!uuid || !window.socket || socket.readyState !== WebSocket.OPEN) {
      return;
   }
   if (mediaChannels[uuid]) mediaChannels[uuid].auto = automatic === true;
   var sub = {
      "msg": { "type": "media" },
      "media": { "cmd": "subscribe", "chan-uuid": uuid }
   };
   socket.send(JSON.stringify(sub));
   console.log("Subscribing to media channel", uuid);
}

function unsubscribeMediaChannel(uuid) {
   if (!uuid || !window.socket || socket.readyState !== WebSocket.OPEN) {
      return;
   }
   var msg = {
      "msg": { "type": "media" },
      "media": { "cmd": "unsubscribe", "chan-uuid": uuid }
   };
   socket.send(JSON.stringify(msg));
}

function requestMediaChannels() {
   if (!window.socket || socket.readyState !== WebSocket.OPEN) {
      return;
   }
   var msg = {
      "msg": { "type": "media" },
      "media": { "cmd": "list" }
   };
   socket.send(JSON.stringify(msg));
}

function activeVfoId() {
   // webui.rigctl.js tracks the active VFO as a letter; default A
   if (typeof active_vfo !== "undefined" && active_vfo) return active_vfo;
   return (typeof cat_state !== "undefined" && cat_state.active) ? cat_state.active : "A";
}

function vfoLetterToId(letter) {
   var l = (letter || "A").toUpperCase();
   var id = l.charCodeAt(0) - 65;   // 'A' = 0
   return (id >= 0 && id < 26) ? id : 0;
}

// Try to auto-subscribe the audio RX/TX pair for the active VFO. We do
// NOT assume the rig has a single VFO: multi-VFO RX rigs (Radioberry etc)
// expose independent channels per VFO and the user can switch.
function mediaTryAutosubscribe(entry) {
   if (!mediaReady || !entry || entry.subscribed || entry.disabled) {
      return;
   }
   // Only audio channels are auto-subscribed for now
   if (entry.subsystem !== 0x01 || !mediaRoomMatches(entry)) {    // RR_BINFRAME_SUBSYS_AUDIO
      return;
   }
   if (entry.vfo !== vfoLetterToId(activeVfoId()) && entry.vfo !== 0xFF) {
      return;
   }
   if (typeof audio_direction_disabled !== "undefined" && audio_direction_disabled[entry.dir]) {
      entry.disabled = true;
      return;
   }
   entry.auto = true;
   entry.subscribed = true;
   subscribeMediaChannel(entry.uuid, true);
}

// The server chooses the initial codec when the first subscriber joins. Do
// not send a codec request here; only reflect the confirmed stream format.
function mediaApplyConfirmedCodec(entry) {
   if (!entry || !mediaRoomMatches(entry) || !entry.codec || entry.vfo !== vfoLetterToId(activeVfoId())) {
      return;
   }
   if (entry.dir === 1 && typeof audio_codec_tx !== 'undefined') {
      audio_codec_tx = entry.codec;
   } else if (entry.dir === 0 && typeof audio_codec_rx !== 'undefined') {
      audio_codec_rx = entry.codec;
   }
}

// Keep the automatic audio pair aligned with the VFO shown by the UI. An
// explicitly selected non-active channel remains untouched; only channels
// that were auto-subscribed for another VFO are released here.
function mediaSyncActiveVfo() {
   if (!mediaReady) return;
   var active = vfoLetterToId(activeVfoId());
   Object.keys(mediaChannels).forEach(function(uuid) {
      var entry = mediaChannels[uuid];
      if (!entry || entry.subsystem !== 0x01 || entry.vfo === 0xFF) return;
      if (entry.vfo === active && mediaRoomMatches(entry)) {
         mediaTryAutosubscribe(entry);
      } else if (entry.auto && entry.subscribed && !entry.disabled) {
         entry.subscribed = false;
         unsubscribeMediaChannel(uuid);
      }
   });
}

// Called from webui.js handle_text_frame for msgObj.media with
// media.cmd of `available` or `subscribed`. Returns true if handled.
function webui_parse_media_msg(msgObj) {
   if (!msgObj || !msgObj.media || !msgObj.media.cmd) {
      return false;
   }
   var m = msgObj.media;

   if (m.cmd === "available") {
      var uuid = m["chan-uuid"];

      if (uuid) {
         // The server may re-announce availability after a codec change.
         // Refresh metadata without losing the subscription state; otherwise
         // each announcement starts another subscribe/codec negotiation loop.
         var entry = mediaChannels[uuid] || {
            uuid: uuid,
            subscribed: false
         };
         entry.subsystem = m.subsys;
         entry.dir = m.dir;
         entry.vfo = m.vfo;
         entry.rig = m.rig;
         entry.room = m.room || "";
         entry.controlRoom = m['control-room'] || entry.room;
         entry.joined = m.joined === true;
         entry.rigUuid = m["rig-uuid"] || "";
         entry.vfoUuid = m["vfo-uuid"] || "";
         if (entry.joined) mediaProjectRxRoom(entry, mediaRoom);
         if (entry.room && !entry.joined) { entry.subscribed = false; delete entry.stream; }
         if (entry.room && entry.joined && !mediaRoom) mediaRoom = entry.room;
         entry.name = m.name || entry.name || "";
         entry.codec = m.codec || entry.codec || null;
         if (typeof entry.disabled !== 'boolean') entry.disabled = false;
         entry.descr = m.descr || entry.descr || "";
         mediaChannels[uuid] = entry;
         console.log("Media channel available:", uuid, mediaChannels[uuid]);
         mediaApplyConfirmedCodec(entry);
         mediaTryAutosubscribe(mediaChannels[uuid]);
      }
      return true;
   } else if (m.cmd === "unsubscribed") {
      var entry = mediaChannels[m["chan-uuid"]];
      if (entry) { entry.subscribed = false; delete entry.stream; }
      return true;
   } else if (m.cmd === "subscribed") {
      var u = m["chan-uuid"];

      if (u && mediaChannels[u]) {
         if (mediaChannels[u].disabled || (mediaChannels[u].room && !mediaChannels[u].joined) ||
             (mediaChannels[u].auto && !mediaRoomMatches(mediaChannels[u]))) {
            unsubscribeMediaChannel(u);
            return true;
         }
         mediaChannels[u].subscribed = true;
         mediaChannels[u].disabled = false;
         mediaChannels[u].stream = m.stream;
         if (m.codec) {
            mediaChannels[u].codec = m.codec;
         }
         mediaApplyConfirmedCodec(mediaChannels[u]);
      }
      console.log("Subscribed to media channel", u, "stream", m.stream);
      return true;
   } else if (m.cmd === "isupport" || m.cmd === "capab") {
      // handled by webui.audio.js codec negotiation
      return false;
   }
   return false;
}

window.webui_inits.push(function webui_media_init() {
   // Reset channel state on (re)connect; the server pushes a fresh
   // media.available batch after auth.
   if (typeof on_socket_open === "function") {
      var prev = on_socket_open;
      on_socket_open = function() {
         mediaChannels = {};
         mediaRoom = "";
         if (typeof audio_direction_disabled !== "undefined") {
            audio_direction_disabled = [false, false];
         }
         mediaReady = true;
         if (prev) {
            prev();
         }
      };
   } else {
      mediaReady = true;
   }
});

// Look up a media channel by uuid or by #index (1-based, from last listing).
// PARITY: rrclient/media.c media_chan_lookup()
var mediaLastList = [];   // uuids in order of the last /media list output

function mediaChanLookup(ref) {
   if (!ref) return null;
   const entries = Object.entries(mediaChannels);
   const exact = entries.find(([uuid]) => uuid.toLowerCase() === ref.toLowerCase());
   if (exact) return exact[1];
   if (/^#?[0-9]+$/.test(ref)) {
      const index = Number(ref.replace(/^#/, ''));
      return Number.isSafeInteger(index) && index > 0 && index <= mediaLastList.length ?
         mediaChannels[mediaLastList[index - 1]] || null : null;
   }
   const matches = entries.map(([, ch]) => ch).filter(ch =>
      ch.name && ch.name.toLowerCase() === ref.toLowerCase());
   return matches.length === 1 ? matches[0] : null;
}

function mediaCommandNotice(text, error = false) {
   ChatBox.Append($('<div></div>').addClass(error ? 'error' : 'notice').text(text));
}

// Format one channel entry for display
function mediaFormatChan(idx, chan) {
   var sub = chan.subsystem === 0x01 ? 'audio' :
             chan.subsystem === 0x02 ? 'video' :
             chan.subsystem === 0x04 ? 'GPS/serial' : ('sub-' + chan.subsystem);
   var dir = chan.dir === 0 ? 'rx' : chan.dir === 1 ? 'tx' : 'n/a';
   return '#' + idx + ' ' + (chan.name || chan.uuid) + ' [' + chan.uuid + '; ' + sub + ' ' + dir +
          ' vfo:' + (chan.vfo === 0xFF ? '*' : String.fromCharCode(65 + chan.vfo)) +
          ' rig:' + (chan.rig === 0xFF ? '*' : chan.rig) + ']' +
          ' codec: ' + (chan.codec || '(none)') +
          ' room: ' + (chan.room || 'any') +
          (chan.subscribed ? ' [subscribed]' : ' [unsubscribed]') +
          (chan.room && !chan.joined ? ' [join room first]' : '') +
          (chan.descr ? ' - ' + chan.descr : '');
}

// Print a listing of known media channels to chat.
// Rebuilds mediaLastList so /media subscribe #N works.
function mediaListChannels() {
   var uuids = Object.keys(mediaChannels);
   mediaLastList = uuids;

   if (typeof ChatBox === 'undefined' || !ChatBox.Append) {
      console.log("media:", uuids.length, "channels known");
      return;
   }
   if (uuids.length === 0) {
      ChatBox.Append('<div><span class="notice">No media channels known yet (server may not have announced any).</span></div>');
      return;
   }
   ChatBox.Append('<div><span class="notice">*** Media channels (' + uuids.length + ') ***</span></div>');
   for (var i = 0; i < uuids.length; i++) {
      var chan = mediaChannels[uuids[i]];
      mediaCommandNotice(mediaFormatChan(i + 1, chan));
   }
}

// Print a listing of known media channels to chat.
