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

var mediaChannels = {};        // uuid -> { subsystem, dir, vfo, rig, descr, codec, subscribed }
var mediaReady = false;

function subscribeMediaChannel(uuid) {
   if (!uuid || !window.socket || socket.readyState !== WebSocket.OPEN) {
      return;
   }
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
   if (!mediaReady || !entry || entry.subscribed) {
      return;
   }
   // Only audio channels are auto-subscribed for now
   if (entry.subsystem !== 0x01) {    // RR_BINFRAME_SUBSYS_AUDIO
      return;
   }
   if (entry.vfo !== vfoLetterToId(activeVfoId()) && entry.vfo !== 0xFF) {
      return;
   }
   entry.subscribed = true;
   subscribeMediaChannel(entry.uuid);
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
         mediaChannels[uuid] = {
            uuid: uuid,
            subsystem: m.subsys,
            dir: m.dir,
            vfo: m.vfo,
            rig: m.rig,
            codec: m.codec || null,
            descr: m.descr || "",
            subscribed: false
         };
         console.log("Media channel available:", uuid, mediaChannels[uuid]);
         mediaTryAutosubscribe(mediaChannels[uuid]);
      }
      return true;
   } else if (m.cmd === "subscribed") {
      var u = m["chan-uuid"];

      if (u && mediaChannels[u]) {
         mediaChannels[u].subscribed = true;
         mediaChannels[u].stream = m.stream;
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
         mediaReady = true;
         if (prev) {
            prev();
         }
      };
   } else {
      mediaReady = true;
   }
});
