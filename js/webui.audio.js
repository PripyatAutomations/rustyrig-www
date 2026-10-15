if (!window.webui_inits) window.webui_inits = [];

// This is optimized default for our typical use case, remote stations on LTE or starlink where upstream is small-ish
// PARITY: librrprotocol/cli.media.c + librrprotocol/ws.binframe.h
// Keep this capability list and the decoder switch below synchronized.
var audio_codec_rx = "mu08";
var audio_codec_tx = "pc16";
var audio_rate_rx = 16000;
var audio_rate_tx = 16000;
var audio_common_codecs = ["pc16", "mu08"];
var audio_tx_codecs = ["pc16", "mu08"];
var audio_direction_disabled = [false, false];
var tx_mic_stream = null;
var tx_mic_source = null;
var tx_mic_processor = null;
var tx_mic_silence = null;
var tx_pcm_pending = new Int16Array(0);

// Keep the browser capability list deliberately honest.  G.722 is not a
// WebAudio primitive and WebCodecs support is still uncommon; advertise it
// only after a browser reports a decoder for it.  This lets newer browsers
// use it without making older browsers negotiate a codec they cannot play.
var audio_g722_supported = false;
var audio_g722_probe_started = false;
var audio_g722_decoder = null;
var audio_g722_timestamp = 0;
const audioDecodeLatest = {};
const audioDecodeDiscardBefore = {};
var audio_opus_supported = false;
var audio_opus_decoder = null;
var audio_opus_timestamp = 0;
var audio_aac_supported = false;
var audio_aac_decoder = null;
var audio_aac_timestamp = 0;

// RX context
const rxCtx = new AudioContext({ sampleRate: audio_rate_rx });
let rxTime = rxCtx.currentTime;
const rxPlaybackNodes = new Set();

// TX context
const txCtx = new AudioContext({ sampleRate: audio_rate_tx });
let txTime = txCtx.currentTime;

// Support volume control
const rxGainNode = rxCtx.createGain();
rxGainNode.gain.value = $('#rig-rx-vol').val();
rxGainNode.connect(rxCtx.destination);

const txGainNode = txCtx.createGain();
txGainNode.gain.value = $('#rig-tx-vol').val();
txGainNode.connect(txCtx.destination);

// One decoder and gain per channel: tab selection never resets a codec stream.
const rxChannelRoutes = new Map();
// PARITY: rrclient/audio.c audio_room_route/audio_set_room_route.
const rxRoomOutputs = new Map();
function webui_room_audio_route(room) {
   return rxRoomOutputs.get(make_ws_url() + ':' + String(room || '').toLowerCase()) || 'S';
}
function webui_set_room_audio_route(room, output) {
   if (!['L', 'R', 'S', 'M'].includes(output)) return false;
   rxRoomOutputs.set(make_ws_url() + ':' + String(room || '').toLowerCase(), output);
   $('#chat-room-tabs select').each(function() {
      if (String($(this).attr('data-audio-room')).toLowerCase() === String(room).toLowerCase()) $(this).val(output);
   });
   webui_sync_rx_routes();
   return true;
}
function webui_rx_route_audible(channel) {
   return channel && channel.subscribed && !channel.disabled && (!channel.room || channel.joined) &&
      webui_room_audio_route(channel.room) !== 'M';
}
function webui_apply_rx_route(route, channel) {
   route.gain.gain.value = webui_rx_route_audible(channel) ? 1 : 0;
   const output = webui_room_audio_route(channel.room);
   route.pan.pan.value = output === 'L' ? -1 : output === 'R' ? 1 : 0;
}
function webui_reset_rx_route(uuid) {
   const route = rxChannelRoutes.get(uuid);
   if (!route) return;
   route.discardBefore = route.timestamp;
   route.time = rxCtx.currentTime;
   for (const source of rxPlaybackNodes) if (source.rxRoute === route) {
      source.stop(); source.disconnect(); rxPlaybackNodes.delete(source);
   }
}
function webui_sync_rx_routes() {
   for (const [uuid, route] of rxChannelRoutes) {
      const channel = mediaChannels[uuid];
      if (!channel || !channel.subscribed || channel.disabled ||
          (channel.room && !channel.joined) || channel.codec !== route.codec) {
         webui_reset_rx_route(uuid);
         if (route.decoder) route.decoder.close();
         route.closed = true;
         route.gain.disconnect();
         route.pan.disconnect();
         rxChannelRoutes.delete(uuid);
      } else webui_apply_rx_route(route, channel);
   }
}
function webui_play_channel_packet(buffer, codec, channel) {
   if (!channel.subscribed || channel.disabled || (channel.room && !channel.joined)) return;
   webui_sync_rx_routes();
   let route = rxChannelRoutes.get(channel.uuid);
   if (!route) {
      route = {codec, gain: rxCtx.createGain(), pan: rxCtx.createStereoPanner(), time: rxCtx.currentTime, timestamp: 0, discardBefore: 0};
      webui_apply_rx_route(route, channel);
      route.gain.connect(route.pan);
      route.pan.connect(rxGainNode);
      rxChannelRoutes.set(channel.uuid, route);
   }
   const formats = {g722: 'g722', opus: 'opus', aacv: 'mp4a.40.2'};
   if (formats[codec]) {
      if (typeof AudioDecoder === 'undefined' || typeof EncodedAudioChunk === 'undefined') return;
      if (!route.decoder) {
         route.decoder = new AudioDecoder({
            output(audio) {
               try {
                  if (route.closed || audio.timestamp < route.discardBefore || route.timestamp - audio.timestamp > 250000) return;
                  const samples = new Float32Array(audio.numberOfFrames);
                  audio.copyTo(samples, {planeIndex: 0, format: 'f32-planar'});
                  playFloat32Samples(samples, audio.sampleRate || 16000, route);
               } finally { audio.close(); }
            },
            error(error) { console.warn('RX channel decoder failed', channel.uuid, error); route.decoder = null; }
         });
         route.decoder.configure({codec: formats[codec], sampleRate: 16000, numberOfChannels: 1});
      }
      if (route.decoder.decodeQueueSize < 8) route.decoder.decode(new EncodedAudioChunk({
         type: 'key', timestamp: route.timestamp, data: new Uint8Array(buffer)
      }));
      route.timestamp += codec === 'g722' ? Math.floor(buffer.byteLength * 2 * 1000000 / 16000) : codec === 'opus' ? 20000 : 64000;
      return;
   }
   const rates = {mu08: 8000, mu16: 16000, pc16: 16000, pc44: 44100};
   if (!rates[codec]) return;
   const samples = codec.startsWith('mu') ? decodeMulawToFloat32(buffer) : decodePCM16ToFloat32(buffer);
   playFloat32Samples(samples, rates[codec], route);
}

// Halt playback
function stopPlayback() {
   for (const route of rxChannelRoutes.values()) {
      route.discardBefore = route.timestamp;
      route.time = rxCtx.currentTime;
   }
   // Invalidate queued decoder output as well as already scheduled sources.
   audioDecodeDiscardBefore['G.722'] = audio_g722_timestamp;
   audioDecodeDiscardBefore.Opus = audio_opus_timestamp;
   audioDecodeDiscardBefore.AAC = audio_aac_timestamp;
   for (const source of rxPlaybackNodes) {
      try { source.stop(); } catch (_) {}
      source.disconnect();
   }
   rxPlaybackNodes.clear();
   rxTime = rxCtx.currentTime;
}

// Halt transmit
function stopTransmit() {
   txTime = txCtx.currentTime;
}

function webui_tx_channel() {
   if (typeof mediaChannels === 'undefined') return null;
   var active = typeof activeVfoId === 'function' ? activeVfoId() :
      (typeof active_vfo !== 'undefined' ? active_vfo : 'A');
   var activeId = typeof vfoLetterToId === 'function' ? vfoLetterToId(active) : 0;
   var wildcard = null;
   Object.keys(mediaChannels).some(function(uuid) {
      var chan = mediaChannels[uuid];
      if (!chan || chan.subsystem !== 0x01 || chan.dir !== 1 ||
          !chan.subscribed || !mediaRoomMatches(chan) || typeof chan.stream !== 'number') {
         return false;
      }
      if (chan.vfo === activeId) {
         wildcard = chan;
         return true;
      }
      if (chan.vfo === 0xFF && !wildcard) wildcard = chan;
      return false;
   });
   return wildcard;
}

function webui_encode_mulaw(sample) {
   var sign = sample < 0 ? 0x80 : 0;
   var value = Math.min(32635, Math.abs(sample)) + 132;
   var exponent = 7;
   for (var mask = 0x4000; (value & mask) === 0 && exponent > 0; mask >>= 1) exponent--;
   return ~(sign | (exponent << 4) | ((value >> (exponent + 3)) & 0x0F)) & 0xFF;
}

function webui_resample_to_16k(input, sourceRate) {
   if (sourceRate === 16000) return input;
   var output = new Float32Array(Math.max(1, Math.floor(input.length * 16000 / sourceRate)));
   var step = sourceRate / 16000;
   for (var i = 0; i < output.length; i++) {
      var position = i * step;
      var left = Math.min(input.length - 1, Math.floor(position));
      var right = Math.min(input.length - 1, left + 1);
      output[i] = input[left] + (input[right] - input[left]) * (position - left);
   }
   return output;
}

function webui_append_tx_samples(samples) {
   var joined = new Int16Array(tx_pcm_pending.length + samples.length);
   joined.set(tx_pcm_pending);
   joined.set(samples, tx_pcm_pending.length);
   tx_pcm_pending = joined;
   var chan = webui_tx_channel();
   if (!chan || !window.socket || socket.readyState !== WebSocket.OPEN) return;
   var codec = audio_codec_tx;
   if (audio_tx_codecs.indexOf(codec) < 0) return;
   while (tx_pcm_pending.length >= 320) {
      var frameSamples = tx_pcm_pending.slice(0, 320);
      tx_pcm_pending = tx_pcm_pending.slice(320);
      var payload = codec === 'mu08' ? new Uint8Array(320) : new Uint8Array(frameSamples.buffer);
      if (codec === 'mu08') {
         for (var i = 0; i < frameSamples.length; i++) payload[i] = webui_encode_mulaw(frameSamples[i]);
      }
      var frame = binframe_build_audio(codec, 1, chan.vfo, chan.rig, chan.stream, payload);
      if (frame) rrSendBinary(socket, frame);
   }
}

async function webui_start_microphone() {
   if (tx_mic_stream) return true;
   if (audio_tx_codecs.indexOf(audio_codec_tx) < 0 || !navigator.mediaDevices ||
       !navigator.mediaDevices.getUserMedia) return false;
   try {
      tx_mic_stream = await navigator.mediaDevices.getUserMedia({ audio: {
         channelCount: 1, echoCancellation: false, noiseSuppression: false,
         autoGainControl: false
      }});
      await txCtx.resume();
      tx_mic_source = txCtx.createMediaStreamSource(tx_mic_stream);
      tx_mic_processor = txCtx.createScriptProcessor(4096, 1, 1);
      tx_mic_silence = txCtx.createGain();
      tx_mic_silence.gain.value = 0;
      tx_mic_processor.onaudioprocess = function(event) {
         if (!tx_mic_stream) return;
         var input = webui_resample_to_16k(event.inputBuffer.getChannelData(0),
            event.inputBuffer.sampleRate);
         var pcm = new Int16Array(input.length);
         for (var i = 0; i < input.length; i++) {
            var value = Math.max(-1, Math.min(1, input[i]));
            pcm[i] = value < 0 ? value * 32768 : value * 32767;
         }
         webui_append_tx_samples(pcm);
      };
      tx_mic_source.connect(tx_mic_processor);
      tx_mic_processor.connect(tx_mic_silence);
      tx_mic_silence.connect(txCtx.destination);
      tx_pcm_pending = new Int16Array(0);
      return true;
   } catch (error) {
      console.warn("Unable to start microphone capture:", error);
      webui_stop_microphone();
      return false;
   }
}

function webui_stop_microphone() {
   if (tx_mic_processor) tx_mic_processor.disconnect();
   if (tx_mic_source) tx_mic_source.disconnect();
   if (tx_mic_silence) tx_mic_silence.disconnect();
   if (tx_mic_stream) tx_mic_stream.getTracks().forEach(function(track) { track.stop(); });
   tx_mic_processor = null;
   tx_mic_source = null;
   tx_mic_silence = null;
   tx_mic_stream = null;
   tx_pcm_pending = new Int16Array(0);
}

// Flush the playback buffer then insert silence
function flushPlayback() {
   const sampleRate = rxCtx.sampleRate;
   const silence = new Float32Array(sampleRate / 10); // 100ms silence

   const audioBuffer = rxCtx.createBuffer(1, silence.length, sampleRate);
   audioBuffer.copyToChannel(silence, 0);

   const source = rxCtx.createBufferSource();
   source.buffer = audioBuffer;
   source.connect(rxCtx.destination);

   const rxNow = rxCtx.currentTime;
   if (rxTime < rxNow) {
      rxTime = rxNow;
   }

   source.start(rxTime);
   rxTime += silence.length / sampleRate;
}

function decodeMulawToFloat32(buffer) {
   const mulaw = new Uint8Array(buffer);
   const float32 = new Float32Array(mulaw.length);

   for (let i = 0; i < mulaw.length; i++) {
      float32[i] = mulawDecode8(mulaw[i]) / 32768; // Normalize to [-1, 1]
   }

   return float32;
}

function mulawDecode8(u_val) {
   // ITU-T G.711 μ-law: complement the codeword, restore its exponent and
   // remove the 0x84 bias.  The old bias of 33 produced a badly distorted
   // waveform from otherwise valid mu08 frames.
   const BIAS = 0x84;

   u_val = ~u_val;

   let t = ((u_val & 0x0F) << 3) + BIAS;
   t <<= ((u_val & 0x70) >> 4);
   t -= BIAS;
   return (u_val & 0x80) ? -t : t;
}

function playAudioPacket(buffer, codec = 'mu16', channel = null) {
   if (channel) {
      try { webui_play_channel_packet(buffer, codec, channel); }
      catch (error) { console.warn('Unable to decode RX channel', channel.uuid, error); }
      return;
   }
   let float32Data;
   let sampleRate;

   switch (codec) {
      case 'mu08':
         float32Data = decodeMulawToFloat32(buffer);
         sampleRate = 8000;
         break;
      case 'mu16':
         float32Data = decodeMulawToFloat32(buffer);
         sampleRate = 16000;
         break;
      case 'pc16':
         float32Data = decodePCM16ToFloat32(buffer);
         sampleRate = 16000;
         break;
      case 'pc44':
         float32Data = decodePCM16ToFloat32(buffer);
         sampleRate = 44100;
         break;
      case 'g722':
         // G.722 is handled by WebCodecs when the browser exposes it.  The
         // capability probe below prevents this path from being selected on
         // browsers that only provide PCM/Opus/AAC decoders.
         if (!audio_g722_supported || typeof AudioDecoder === 'undefined') {
            console.warn("G.722 audio is not supported by this browser");
            return;
         }
         decodeG722Packet(buffer);
         return;
      case 'opus':
         if (!audio_opus_supported || typeof AudioDecoder === 'undefined') {
            console.warn("Opus audio is not supported by this browser");
            return;
         }
         decodeOpusPacket(buffer);
         return;
      case 'aacv':
         if (!audio_aac_supported || typeof AudioDecoder === 'undefined') {
            console.warn("AAC audio is not supported by this browser");
            return;
         }
         decodeAacPacket(buffer);
         return;
      default:
         console.warn("Unknown codec:", codec);
         return;
   }

   playFloat32Samples(float32Data, sampleRate);
}

function decodeG722Packet(buffer) {
   if (!audio_g722_decoder || typeof EncodedAudioChunk === 'undefined') {
      console.warn("G.722 decoder is unavailable");
      return;
   }
   try {
      audioDecodeLatest['G.722'] = audio_g722_timestamp;
      if (audio_g722_decoder.decodeQueueSize >= 8) {
         audio_g722_timestamp += Math.floor(buffer.byteLength * 2 * 1000000 / 16000);
         return;
      }
      audio_g722_decoder.decode(new EncodedAudioChunk({
         type: 'key',
         timestamp: audio_g722_timestamp,
         data: new Uint8Array(buffer)
      }));
      // G.722 timestamps are expressed in microseconds and each byte
      // represents two 16 kHz output samples at the 64 kbit/s profile.
      audio_g722_timestamp += Math.floor(buffer.byteLength * 2 * 1000000 / 16000);
   } catch (e) {
      console.warn("Unable to decode G.722 packet:", e);
   }
}

function decodeOpusPacket(buffer) {
   if (!audio_opus_decoder || typeof EncodedAudioChunk === 'undefined') {
      console.warn("Opus decoder is unavailable");
      return;
   }
   try {
      audioDecodeLatest['Opus'] = audio_opus_timestamp;
      if (audio_opus_decoder.decodeQueueSize >= 8) {
         audio_opus_timestamp += 20000;
         return;
      }
      audio_opus_decoder.decode(new EncodedAudioChunk({
         type: 'key', timestamp: audio_opus_timestamp,
         data: new Uint8Array(buffer)
      }));
      // RustyRig's Opus pipeline emits the usual 20 ms packets.  The
      // timestamp only needs to be monotonic; the decoder derives duration
      // from the packet itself.
      audio_opus_timestamp += 20000;
   } catch (e) {
      console.warn("Unable to decode Opus packet:", e);
   }
}

function decodeAacPacket(buffer) {
   if (!audio_aac_decoder || typeof EncodedAudioChunk === 'undefined') {
      console.warn("AAC decoder is unavailable");
      return;
   }
   try {
      audioDecodeLatest['AAC'] = audio_aac_timestamp;
      if (audio_aac_decoder.decodeQueueSize >= 8) {
         audio_aac_timestamp += 64000;
         return;
      }
      audio_aac_decoder.decode(new EncodedAudioChunk({
         type: 'key', timestamp: audio_aac_timestamp,
         data: new Uint8Array(buffer)
      }));
      // AAC-LC frames contain 1024 samples at 16 kHz.
      audio_aac_timestamp += 64000;
   } catch (e) {
      console.warn("Unable to decode AAC packet:", e);
   }
}

function decodePCM16ToFloat32(buffer) {
   if (buffer.byteLength % 2 !== 0) {
      console.warn("PCM16 payload with odd length:", buffer.byteLength);
      buffer = buffer.slice(0, buffer.byteLength - 1);
   }
   const pcmData = new Int16Array(buffer);
   const float32Data = new Float32Array(pcmData.length);

   for (let i = 0; i < pcmData.length; i++) {
      float32Data[i] = pcmData[i] / 32768;
   }

   return float32Data;
}

function playFloat32Samples(float32Data, sampleRate, route = null) {
   const samplesPerPacket = float32Data.length;
   const duration = samplesPerPacket / sampleRate;
   if (typeof socket !== 'undefined' && socket && socket.readyState !== 1) return;
   if (!Number.isFinite(duration) || duration <= 0 || duration > 0.25) return;
   // Replace stale scheduled audio rather than accumulating a delayed station.
   if ((route ? route.time : rxTime) - rxCtx.currentTime > 0.25) {
      if (route) {
         for (const source of rxPlaybackNodes) if (source.rxRoute === route) {
            source.stop(); source.disconnect(); rxPlaybackNodes.delete(source);
         }
         route.time = rxCtx.currentTime;
      } else stopPlayback();
   }

   const audioBuffer = rxCtx.createBuffer(1, samplesPerPacket, sampleRate);
   audioBuffer.copyToChannel(float32Data, 0);

   const source = rxCtx.createBufferSource();
   source.buffer = audioBuffer;
   source.rxRoute = route;
   source.connect(route ? route.gain : rxGainNode);

   const rxNow = rxCtx.currentTime;
   // Keep a modest queue ahead of the hardware clock.  Starting exactly at
   // `currentTime` makes normal WebSocket jitter audible as periodic gaps.
   const rxLead = 0.075;
   let scheduled = Math.max(route ? route.time : rxTime, rxNow + rxLead);

   rxPlaybackNodes.add(source);
   source.onended = () => { rxPlaybackNodes.delete(source); source.disconnect(); };
   source.start(scheduled);
   if (route) route.time = scheduled + duration;
   else rxTime = scheduled + duration;
}

function ws_send_capab_msg() {
   var codecs = audio_common_codecs.slice();
   if (audio_opus_supported) {
      codecs.push("opus");
   }
   if (audio_aac_supported) {
      codecs.push("aacv");
   }
   if (audio_g722_supported) {
      codecs.push("g722");
   }
   var capab_msg = {
      "msg": {
         "type": "media"
      },
      "media": {
         "cmd": "capab",
         "codecs": codecs.join(" ")
      }
   }
   rrSendMessage(socket, capab_msg);
}

function webui_audio_codec_list() {
   var codecs = audio_common_codecs.slice();
   if (audio_opus_supported) codecs.push("opus");
   if (audio_aac_supported) codecs.push("aacv");
   if (audio_g722_supported) codecs.push("g722");
   return codecs;
}

function webui_audio_set_codec(codec, isTx, target) {
   codec = String(codec || '').toLowerCase();
   var direction = isTx ? 1 : 0;
   // PARITY: rrclient/media.c media_select_codec. Invalid/ambiguous symbols
   // must not silently become a selection for every channel in a direction.
   const selected = target && typeof mediaChanLookup === 'function' ? mediaChanLookup(target) : null;
   if (target && (!selected || selected.subsystem !== 1 || selected.dir !== direction ||
       (!selected.subscribed && !selected.disabled))) return false;
   if (codec === 'none') {
      if (!target) audio_direction_disabled[direction] = true;
      ws_send_codec_for_direction(codec, direction, selected);
      return true;
   }
   if (audio_common_codecs.indexOf(codec) < 0 &&
       !(codec === 'g722' && audio_g722_supported) &&
       !(codec === 'opus' && audio_opus_supported) &&
       !(codec === 'aacv' && audio_aac_supported)) {
      console.warn("Unsupported browser audio codec:", codec);
      return false;
   }
   if (isTx) {
      if (audio_tx_codecs.indexOf(codec) < 0) {
         console.warn("This browser cannot encode TX codec:", codec);
         return false;
      }
      ws_send_codec_for_direction(codec, direction, selected);
   } else {
      ws_send_codec_for_direction(codec, direction, selected);
   }
   audio_direction_disabled[direction] = false;
   return true;
}

async function webui_probe_codecs() {
   if (audio_g722_probe_started || typeof AudioDecoder === 'undefined' ||
       typeof AudioDecoder.isConfigSupported !== 'function') {
      return audio_g722_supported;
   }
   audio_g722_probe_started = true;
   try {
      var result = await AudioDecoder.isConfigSupported({
         codec: 'g722', sampleRate: 16000, numberOfChannels: 1
      });
      audio_g722_supported = !!(result && result.supported);
      if (audio_g722_supported) {
         audio_g722_decoder = webui_make_audio_decoder('G.722', function() {
            audio_g722_supported = false;
         });
         audio_g722_decoder.configure({ codec: 'g722', sampleRate: 16000, numberOfChannels: 1 });
      }
      var opus_result = await AudioDecoder.isConfigSupported({
         codec: 'opus', sampleRate: 16000, numberOfChannels: 1
      });
      audio_opus_supported = !!(opus_result && opus_result.supported);
      if (audio_opus_supported) {
         audio_opus_decoder = webui_make_audio_decoder('Opus', function() {
            audio_opus_supported = false;
         });
         audio_opus_decoder.configure({ codec: 'opus', sampleRate: 16000, numberOfChannels: 1 });
      }
      var aac_result = await AudioDecoder.isConfigSupported({
         codec: 'mp4a.40.2', sampleRate: 16000, numberOfChannels: 1
      });
      audio_aac_supported = !!(aac_result && aac_result.supported);
      if (audio_aac_supported) {
         audio_aac_decoder = webui_make_audio_decoder('AAC', function() {
            audio_aac_supported = false;
         });
         audio_aac_decoder.configure({ codec: 'mp4a.40.2', sampleRate: 16000, numberOfChannels: 1 });
      }
   } catch (e) {
      audio_g722_supported = false;
   }
   return audio_g722_supported;
}

function webui_make_audio_decoder(label, onError) {
   return new AudioDecoder({
      output: function(audioData) {
         try {
            if (audioData.timestamp < (audioDecodeDiscardBefore[label] || 0)) return;
            if (audioDecodeLatest[label] !== undefined && audioDecodeLatest[label] - audioData.timestamp > 250000) return;
            var samples = new Float32Array(audioData.numberOfFrames);
            audioData.copyTo(samples, { planeIndex: 0, format: 'f32-planar' });
            playFloat32Samples(samples, audioData.sampleRate || 16000);
         } finally {
            audioData.close();
         }
      },
      error: function(error) {
         console.warn(label + " WebCodecs decoder error:", error);
         onError();
      }
   });
}

function ws_send_rx_codec(codec) {
   ws_send_codec_for_direction(codec || "pc16", 0);
}

function ws_send_tx_codec(codec) {
   ws_send_codec_for_direction(codec || "pc16", 1);
}

// Codec selection is per concrete media-channel UUID.  Send the selection to
// every subscribed audio channel in that direction, matching rrclient's
// behavior for multi-VFO rigs.
function ws_send_codec_for_direction(codec, direction, onlyUuid) {
   if (onlyUuid && typeof onlyUuid !== 'string') onlyUuid = onlyUuid.uuid;
   if (typeof mediaChannels !== 'undefined') {
      Object.keys(mediaChannels).forEach(function(uuid) {
         var chan = mediaChannels[uuid];
         if (!chan || chan.subsystem !== 0x01 || chan.dir !== direction ||
             (!chan.subscribed && !chan.disabled) || (onlyUuid && uuid !== onlyUuid) ||
             (chan.codec === codec && chan.subscribed) ||
             !window.socket || socket.readyState !== WebSocket.OPEN) {
            return;
         }
         if (codec === 'none') {
            if (chan.subscribed) {
               rrSendMessage(socket, {
                  "msg": { "type": "media" },
                  "media": { "cmd": "unsubscribe", "chan-uuid": uuid }
               });
            }
            chan.subscribed = false;
            chan.disabled = true;
            chan.pendingCodec = '';
            return;
         }
         rrSendMessage(socket, {
            "msg": { "type": "media" },
            "media": {
               "cmd": "codec",
               "codec": codec,
               "chan-uuid": uuid
            }
         });
         if (chan.disabled && !chan.subscribed) {
            chan.pendingCodec = codec;
            chan.subscribed = true;
            subscribeMediaChannel(uuid);
         }
      });
   }
   if (typeof webui_sync_rx_routes === 'function') webui_sync_rx_routes();
   // There may be no matching channel yet during authentication.  The
   // subscribed callback will retry the selection once the UUID is known.
}

$('#rig-rx-vol').change(function() {
   rxGainNode.gain.value = parseFloat($(this).val());
   console.log("RX vol:", rxGainNode.gain.value);
});

$('#rig-tx-vol').change(function() {
   txGainNode.gain.value = parseFloat($(this).val());
   console.log("TX vol:", txGainNode.gain.value);
});

// Browsers start AudioContexts suspended until a user gesture; resume on
// the first click/keypress anywhere so playback is actually audible.
function webui_audio_resume() {
   if (rxCtx.state === 'suspended') {
      rxCtx.resume();
   }
   if (txCtx.state === 'suspended') {
      txCtx.resume();
   }
}

document.addEventListener('click', webui_audio_resume);
document.addEventListener('keydown', webui_audio_resume);

window.webui_inits.push(function webui_audio_init() {
   $('button#use-audio').click();
   webui_probe_codecs().then(function() {
      if ((audio_opus_supported || audio_g722_supported || audio_aac_supported) &&
          window.socket && socket.readyState === WebSocket.OPEN) {
         // Re-advertise after the asynchronous WebCodecs capability probe.
         ws_send_capab_msg();
      }
   });

   // Wait for socket to exist before allowing audio init
   if (!window.socket) {
      console.warn("Audio init delayed: socket not yet available");
      console.log("click start audio button in rig tab to start audio");
      return;
   }
});
