// Handle unpacking and packing audio frames

function parseAudioFrame(buffer) {
    const view = new DataView(buffer);
    const chan_id = view.getUint16(0, false); // big-endian
    const seq     = view.getUint16(2, false); // big-endian
    const payload = buffer.slice(4);
    return { chan_id, seq, payload };
}

function makeAudioFrame(chan_id, seq, payload) {
    const buf = new ArrayBuffer(4 + payload.byteLength);
    const view = new DataView(buf);
    view.setUint16(0, chan_id, false); // big-endian
    view.setUint16(2, seq, false);
    new Uint8Array(buf, 4).set(new Uint8Array(payload));
    return buf;
}

// PARITY: rrclient/media.c gps_frame; MODEM/nmea is a read-only GPS channel.
function binframe_nmea_sentence(frame) {
   if (!frame || frame.subsystem !== 4 || frame.codec !== 'nmea' ||
       frame.dir !== 0 || frame.vfo !== 255 ||
       !frame.stream || !frame.payload.length || frame.payload.length > 511) return null;
   var text = '';
   for (var i = 0; i < frame.payload.length; i++) {
      var byte = frame.payload[i];
      if (!byte || byte > 126) return null;
      text += String.fromCharCode(byte);
   }
   text = text.replace(/[\r\n]+$/, '');
   if (!/^[!$][^*\r\n]+\*[0-9a-fA-F]{2}$/.test(text)) return null;
   var star = text.length - 3, checksum = 0;
   for (var j = 1; j < star; j++) checksum ^= text.charCodeAt(j);
   return checksum === parseInt(text.slice(star + 1), 16) ? text : null;
}
