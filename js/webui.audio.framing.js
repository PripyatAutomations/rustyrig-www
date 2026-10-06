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

// PARITY: rrclient/media.c gps_frame/gps_sentence; MODEM/gpsp carries a position record.
function binframe_gps_position(frame, date) {
   if (!frame || frame.subsystem !== 4 || frame.codec !== 'gpsp' ||
       frame.dir !== 0 || frame.vfo !== 255 || !frame.stream || frame.payload.length !== 9) return null;
   var view = new DataView(frame.payload.buffer, frame.payload.byteOffset, frame.payload.byteLength);
   var lat = view.getInt32(0, false), lon = view.getInt32(4, false), flags = frame.payload[8];
   if (lat < -900000000 || lat > 900000000 || lon < -1800000000 || lon > 1800000000 || (flags & ~3)) return null;
   date = date || new Date();
   var pad = function (n, width) { return String(n).padStart(width, '0'); };
   var utc = pad(date.getUTCHours(), 2) + pad(date.getUTCMinutes(), 2) + pad(date.getUTCSeconds(), 2);
   var day = pad(date.getUTCDate(), 2) + pad(date.getUTCMonth() + 1, 2) + pad(date.getUTCFullYear() % 100, 2);
   var angle = function (value, width) {
      var absolute = Math.abs(value), degrees = Math.floor(absolute / 10000000);
      var minutes = Math.floor(((absolute % 10000000) * 60 + 5) / 10);
      if (minutes === 60000000) { degrees++; minutes = 0; }
      return pad(degrees, width) + pad(Math.floor(minutes / 1000000), 2) + '.' + pad(minutes % 1000000, 6);
   };
   var body;
   if (flags & 1) {
      body = 'GPRMC,' + utc + ',A,' + angle(lat, 2) + ',' + (lat < 0 ? 'S' : 'N') + ',' +
         angle(lon, 3) + ',' + (lon < 0 ? 'W' : 'E') + ',0.0,,' + day + ',,,' + ((flags & 2) ? 'M' : 'A');
   } else {
      body = 'GPRMC,' + utc + ',V,,,,,0.0,,' + day + ',,,N';
   }
   var checksum = 0;
   for (var i = 0; i < body.length; i++) checksum ^= body.charCodeAt(i);
   return '$' + body + '*' + checksum.toString(16).toUpperCase().padStart(2, '0');
}

// PARITY: rrclient/media.c gps_frame; explicit MODEM/nmea subscriptions only.
function binframe_gps_nmea(frame) {
   if (!frame || frame.subsystem !== 4 || frame.codec !== 'nmea' || frame.dir !== 0 ||
       frame.vfo !== 255 || !frame.stream || !frame.payload.length || frame.payload.length > 509) return null;
   let text = '';
   for (const byte of frame.payload) {
      if (byte < 32 || byte > 126) return null;
      text += String.fromCharCode(byte);
   }
   if (!/^[!$][^*]+\*[0-9a-fA-F]{2}$/.test(text)) return null;
   const end = text.indexOf('*');
   let checksum = 0;
   for (let i = 1; i < end; i++) checksum ^= text.charCodeAt(i);
   return checksum === parseInt(text.slice(end + 1), 16) ? text : null;
}
