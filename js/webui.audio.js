if (!window.webui_inits) window.webui_inits = [];

// This is optimized default for our typical use case, remote stations on LTE or starlink where upstream is small-ish
// PARITY: librrprotocol/cli.media.c + librrprotocol/ws.binframe.h
// Keep this capability list and the decoder switch below synchronized.
var audio_codec_rx = "mu08";
var audio_codec_tx = "pc16";
var audio_rate_rx = 16000;
var audio_rate_tx = 16000;
var audio_common_codecs = ["pc16", "mu08"];

// Keep the browser capability list deliberately honest.  G.722 is not a
// WebAudio primitive and WebCodecs support is still uncommon; advertise it
// only after a browser reports a decoder for it.  This lets newer browsers
// use it without making older browsers negotiate a codec they cannot play.
var audio_g722_supported = false;
var audio_g722_probe_started = false;
var audio_g722_decoder = null;
var audio_g722_timestamp = 0;
var audio_opus_supported = false;
var audio_opus_decoder = null;
var audio_opus_timestamp = 0;
var audio_aac_supported = false;
var audio_aac_decoder = null;
var audio_aac_timestamp = 0;

// RX context
const rxCtx = new AudioContext({ sampleRate: audio_rate_rx });
let rxTime = rxCtx.currentTime;

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

// Halt playback
function stopPlayback() {
   rxTime = rxCtx.currentTime;
}

// Halt transmit
function stopTransmit() {
   txTime = txCtx.currentTime;
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

function playAudioPacket(buffer, codec = 'mu16') {
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

function playFloat32Samples(float32Data, sampleRate) {
   const samplesPerPacket = float32Data.length;
   const duration = samplesPerPacket / sampleRate;

   const audioBuffer = rxCtx.createBuffer(1, samplesPerPacket, sampleRate);
   audioBuffer.copyToChannel(float32Data, 0);

   const source = rxCtx.createBufferSource();
   source.buffer = audioBuffer;
   source.connect(rxGainNode);

   const rxNow = rxCtx.currentTime;
   // Keep a modest queue ahead of the hardware clock.  Starting exactly at
   // `currentTime` makes normal WebSocket jitter audible as periodic gaps.
   const rxLead = 0.075;
   if (rxTime < rxNow + rxLead) {
      rxTime = rxNow + rxLead;
   }

   source.start(rxTime);
   rxTime += duration;
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
   socket.send(JSON.stringify(capab_msg));
}

function webui_audio_set_codec(codec, isTx) {
   codec = String(codec || '').toLowerCase();
   if (audio_common_codecs.indexOf(codec) < 0 &&
       !(codec === 'g722' && audio_g722_supported) &&
       !(codec === 'opus' && audio_opus_supported) &&
       !(codec === 'aacv' && audio_aac_supported)) {
      console.warn("Unsupported browser audio codec:", codec);
      return false;
   }
   if (isTx) {
      audio_codec_tx = codec;
      ws_send_tx_codec(codec);
   } else {
      audio_codec_rx = codec;
      ws_send_rx_codec(codec);
   }
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
   if (typeof mediaChannels !== 'undefined') {
      Object.keys(mediaChannels).forEach(function(uuid) {
         var chan = mediaChannels[uuid];
         if (!chan || chan.subsystem !== 0x01 || chan.dir !== direction ||
             !chan.subscribed || (onlyUuid && uuid !== onlyUuid) ||
             chan.codec === codec || !window.socket || socket.readyState !== WebSocket.OPEN) {
            return;
         }
         socket.send(JSON.stringify({
            "msg": { "type": "media" },
            "media": {
               "cmd": "codec",
               "codec": codec,
               "chan-uuid": uuid
            }
         }));
      });
   }
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
