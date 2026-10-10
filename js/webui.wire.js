/* Compact RustyRig wire codec and bounded send helpers.
 * PARITY: rustyrig-fw/librrprotocol/wire.c. No legacy wire decoder. */
'use strict';
const rrWireRegistry = typeof module !== 'undefined' ? require('./webui.wire.registry.js') : rrWireSchema;

function rrWireScalar(value) {
   if (typeof value === 'number') return Number.isFinite(value) &&
      (!Number.isInteger(value) || Number.isSafeInteger(value));
   if (typeof value === 'string') {
      if (value.includes('\0')) return false;
      for (let i = 0; i < value.length; i++) {
         const c = value.charCodeAt(i);
         if (c >= 0xd800 && c <= 0xdbff) {
            const next = value.charCodeAt(++i);
            if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
         } else if (c >= 0xdc00 && c <= 0xdfff) return false;
      }
      return true;
   }
   return value === null || typeof value === 'boolean';
}

function rrWireFlatten(value, path = '', out = {}) {
   if (rrWireScalar(value)) {
      out[path] = value;
      return out;
   }
   if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.keys(value).length)
      throw new Error('Invalid wire value');
   for (const key of Object.keys(value)) {
      if (value[key] === undefined) continue;
      if (!/^[a-z][a-z0-9_-]{0,62}$/.test(key)) throw new Error('Invalid field name');
      rrWireFlatten(value[key], path ? path + '.' + key : key, out);
   }
   return out;
}

function rrWireAssign(out, path, value) {
   const keys = path.split('.');
   let at = out;
   for (let i = 0; i < keys.length - 1; i++) {
      if (!Object.hasOwn(at, keys[i])) at[keys[i]] = {};
      if (!at[keys[i]] || typeof at[keys[i]] !== 'object') throw new Error('Field collision');
      at = at[keys[i]];
   }
   const key = keys[keys.length - 1];
   if (Object.hasOwn(at, key)) throw new Error('Field collision');
   at[key] = value;
}

function rrWireTransform(message, encode) {
   const flat = rrWireFlatten(message);
   const rule = rrWireRegistry.groups.find(group => encode ? group.type === flat['msg.type'] &&
      Object.entries(group.operations).some(([op, command]) => command === (group.command_key ? flat[group.command_key] ?? null : null)) :
      Object.hasOwn(group.operations, flat.op));
   if (!rule) throw new Error('Unsupported wire operation');
   const op = encode ? Object.keys(rule.operations).find(key => rule.operations[key] === (rule.command_key ? flat[rule.command_key] ?? null : null)) : flat.op;
   const out = encode ? {op} : {msg: {type: rule.type}};
   if (!encode && rule.operations[op]) rrWireAssign(out, rule.command_key, rule.operations[op]);
   for (const [key, value] of Object.entries(flat)) {
      if (encode ? key === 'msg.type' || key === rule.command_key : key === 'op') continue;
      let destination = null;
      for (const [internal, wire] of Object.entries(rule.fields)) {
         const from = encode ? internal : wire, to = encode ? wire : internal;
         if (from === key) { destination = to; break; }
         if (from.endsWith('*') && key.startsWith(from.slice(0, -1))) {
            const suffix = key.slice(from.length - 1);
            if (suffix && !suffix.includes('.')) { destination = to.slice(0, -1) + suffix; break; }
         }
      }
      if (!destination) throw new Error('Unknown wire field');
      rrWireAssign(out, destination, value);
   }
   return out;
}

/* JSON.parse alone loses duplicate keys. Scan object keys before parsing so
 * ambiguous envelopes are rejected, matching the C JSON parser. Arrays and
 * empty containers are not part of this initial scalar schema. */
function rrWireParse(text) {
   let i = 0;
   const ws = () => { while (/[\x20\t\r\n]/.test(text[i] || '') && i < text.length) i++; };
   function string() {
      const start = i++;
      while (i < text.length) {
         if (text[i] === '\\') { i += 2; continue; }
         if (text[i++] === '"') return text.slice(start, i);
      }
      throw new Error('Truncated string');
   }
   function value(depth) {
      ws();
      if (depth > 64) throw new Error('Nesting limit');
      if (text[i] === '{') {
         i++; ws();
         const keys = new Set();
         if (text[i] === '}') throw new Error('Empty container');
         for (;;) {
            ws();
            if (text[i] !== '"') throw new Error('Missing key');
            const token = string();
            if (!/^"[a-z][a-z0-9_-]{0,62}"$/.test(token)) throw new Error('Invalid field name');
            const key = JSON.parse(token);
            if (keys.has(key)) throw new Error('Duplicate field');
            keys.add(key); ws();
            if (text[i++] !== ':') throw new Error('Missing colon');
            value(depth + 1); ws();
            if (text[i] === '}') { i++; return; }
            if (text[i++] !== ',') throw new Error('Missing comma');
         }
      } else if (text[i] === '"') {
         string();
      } else {
         const start = i;
         while (i < text.length && !/[\x20\t\r\n,}]/.test(text[i])) i++;
         if (i === start || !rrWireScalar(JSON.parse(text.slice(start, i)))) throw new Error('Invalid scalar');
      }
   }
   value(0); ws();
   if (i !== text.length) throw new Error('Trailing data');
   return JSON.parse(text);
}

function rrWireEncode(message) {
   try {
      const text = JSON.stringify(rrWireTransform(message, true));
      return new TextEncoder().encode(text).length <= 65535 ? text : null;
   } catch (_) { return null; }
}

function rrWireDecode(text) {
   try {
      if (typeof text !== 'string' || new TextEncoder().encode(text).length > 65535 ||
          !text.trimStart().startsWith('{')) return null;
      return rrWireTransform(rrWireParse(text), false);
   } catch (_) { return null; }
}

if (typeof module !== 'undefined') module.exports = {rrWireEncode, rrWireDecode, rrSendMessage, rrSendBinary, rrObserveAck};

// All application messages pass through the same strict codec and queue guard.
// No commands are retained for replay across reconnects.
const rrLatencySamples = new WeakMap();
function rrObserveAck(sock, message) {
   const pending = sock && rrLatencySamples.get(sock);
   if (!pending || message.request?.id !== pending.id || typeof performance === 'undefined') return null;
   const rtt = Math.max(0, performance.now() - pending.sent);
   rrLatencySamples.delete(sock);
   return rtt;
}

function rrSendMessage(sock, message) {
   const text = rrWireEncode(message);
   if (text === null) {
      console.error('Rejected outgoing RustyRig message', message && message.msg && message.msg.type);
      return false;
   }
   const sent = rrSendFrame(sock, text, new TextEncoder().encode(text).length, 1048576);
   if (sent && message.request?.id && typeof performance !== 'undefined') {
      const previous = rrLatencySamples.get(sock), time = performance.now();
      if (!previous || time - previous.sent >= 5000) rrLatencySamples.set(sock, {id: message.request.id, sent: time});
   }
   if (!sent && typeof ChatBox !== 'undefined') ChatBox.Append('<div class="chat-status error">Command was not sent: connection unavailable or outgoing queue full.</div>');
   return sent;
}

function rrSendBinary(sock, frame) {
   return rrSendFrame(sock, frame, frame.byteLength, 8192);
}

function rrSendFrame(sock, frame, size, limit) {
   if (!sock || sock.readyState !== 1) return false;
   if (size > limit || (sock.bufferedAmount || 0) > limit - size) {
      console.warn('RustyRig outgoing queue full; frame not queued');
      return false;
   }
   try {
      sock.send(frame);
      const traffic = sock.rrTraffic || (sock.rrTraffic = {}), kind = typeof frame === 'string' ? 'text' : 'binary';
      traffic['tx-' + kind + '-bytes'] = (traffic['tx-' + kind + '-bytes'] || 0n) + BigInt(size);
      traffic['tx-' + kind + '-frames'] = (traffic['tx-' + kind + '-frames'] || 0n) + 1n;
      return true;
   }
   catch (error) { console.error('RustyRig send failed', error); sock.close(); return false; }
}
