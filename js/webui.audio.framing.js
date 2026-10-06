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
   if (lat < -900000 || lat > 900000 || lon < -1800000 || lon > 1800000 || (flags & ~3)) return null;
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
