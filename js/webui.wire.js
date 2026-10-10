/* Compact object/property codec foundation; not yet used by live transport.
 * PARITY: rustyrig-fw/librrprotocol/wire.c. No legacy wire decoder. */
'use strict';
const rrWireOperations = new Set([
   'object.snapshot', 'object.unsubscribe', 'object.inventory', 'object.begin',
   'object.descriptor', 'object.added', 'object.removed', 'object.end',
   'object.result', 'object.inventory-entry', 'object.inventory-end',
   'property.set', 'property.descriptor', 'property.state', 'property.changed', 'property.result'
]);
const rrWireFields = {
   object: new Set(['uuid', 'type', 'owner', 'alias', 'name', 'lifecycle', 'backend', 'room']),
   property: new Set(['name', 'type', 'readable', 'writable', 'unit', 'minimum', 'maximum',
      'step', 'enum', 'observed', 'known', 'available', 'version', 'value'])
};
const rrWireMetadata = new Set([
   'target', 'request.id', 'request.room', 'stream.epoch', 'stream.seq', 'result.code',
   'inventory.kind', 'inventory.name', 'inventory.depth', 'inventory.uuid', 'inventory.room',
   'inventory.backend', 'inventory.frequency', 'inventory.codec', 'inventory.direction',
   'inventory.subsystem', 'inventory.coordinates', 'inventory.source', 'inventory.service',
   'inventory.state', 'inventory.access', 'inventory.action'
]);

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
   const family = encode ? flat['msg.type'] : typeof flat.op === 'string' ? flat.op.split('.')[0] : null;
   const op = encode ? family + '.' + flat[family + '.cmd'] : flat.op;
   if (!rrWireOperations.has(op)) throw new Error('Unsupported wire operation');
   const out = encode ? {op} : {msg: {type: family}, [family]: {cmd: op.slice(family.length + 1)}};
   for (const [key, value] of Object.entries(flat)) {
      if (encode ? key === 'msg.type' || key === family + '.cmd' : key === 'op') continue;
      let destination = key;
      if (!rrWireMetadata.has(key)) {
         const field = encode && key.startsWith(family + '.') ? key.slice(family.length + 1) : key;
         if ((encode && !key.startsWith(family + '.')) || !rrWireFields[family].has(field))
            throw new Error('Unknown wire field');
         destination = encode ? field : family + '.' + field;
      }
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

if (typeof module !== 'undefined') module.exports = {rrWireEncode, rrWireDecode};
