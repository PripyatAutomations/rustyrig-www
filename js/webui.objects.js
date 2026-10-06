// PARITY: rrclient/objects.c. Generic cache only; legacy widgets remain separate.
class RRObjectCache {
   constructor() { this.clear(); }
   clear() { this.objects = new Map(); this.epoch = null; this.request = null; this.ready = false; }
   static uuid(s) { return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s); }
   static seq(s) {
      if (typeof s !== 'string' || !/^(0|[1-9][0-9]*)$/.test(s)) throw Error('Invalid sequence');
      const n = BigInt(s);
      if (n > 18446744073709551615n) throw Error('Sequence overflow');
      return n;
   }
   find(id) {
      if (!this.objects.has(id)) {
         if (this.objects.size >= 4096) throw Error('Object limit');
         this.objects.set(id, { descriptor: null, properties: new Map(), seq: 0n, removed: false });
      }
      return this.objects.get(id);
   }
   remove(o, seq) {
      o.removed = true; o.seq = seq; o.properties.clear();
      let changed;
      do {
         changed = false;
         for (const child of this.objects.values()) {
            const parent = this.objects.get(child.descriptor?.owner);
            if (!child.removed && parent?.removed && child.seq <= parent.seq) {
               child.removed = true; child.seq = parent.seq; child.properties.clear(); changed = true;
            }
         }
      } while (changed);
   }
   apply(m) {
      try {
         const object = m.msg?.type === 'object';
         if (!object && m.msg?.type !== 'property') return false;
         const body = object ? m.object : m.property;
         if (!body) return false;
         if (body.cmd === 'result') return true;
         if (!RRObjectCache.uuid(m.stream?.epoch)) return false;
         const seq = RRObjectCache.seq(m.stream.seq);
         if (object && body.cmd === 'begin') {
            if (typeof m.request?.id !== 'string' || !m.request.id || m.request.id.length > 64) return false;
            this.clear(); this.epoch = m.stream.epoch; this.request = m.request.id; return true;
         }
         if (this.epoch !== m.stream.epoch || (m.request && m.request.id !== this.request)) return false;
         if (object && body.cmd === 'end') {
            if (!m.request) return false;
            this.ready = true; return true;
         }
         const id = object ? body.uuid : m.target;
         if (!RRObjectCache.uuid(id)) return false;
         if (object) {
            if (!['descriptor', 'added', 'removed'].includes(body.cmd)) return false;
            if (body.cmd !== 'removed' && (!['node', 'rig', 'vfo'].includes(body.type) ||
                (body.type !== 'node' && !RRObjectCache.uuid(body.owner)))) return false;
            const o = this.find(id);
            if (seq < o.seq || (o.removed && seq <= o.seq)) return true;
            if (body.cmd === 'removed') { this.remove(o, seq); return true; }
            const parent = this.objects.get(body.owner);
            if (parent?.removed && seq <= parent.seq) { this.remove(o, parent.seq); return true; }
            o.descriptor = JSON.parse(JSON.stringify(body)); o.seq = seq; o.removed = false;
            return true;
         }
         const descriptor = body.cmd === 'descriptor';
         if (!descriptor && !['state', 'changed'].includes(body.cmd)) return false;
         if (typeof body.name !== 'string' || !/^[a-zA-Z0-9_.-]{1,63}$/.test(body.name) ||
             !['string', 'boolean', 'integer', 'number'].includes(body.type)) return false;
         let version = 0n;
         if (descriptor) {
            if (typeof body.readable !== 'boolean' || typeof body.writable !== 'boolean') return false;
         } else {
            version = RRObjectCache.seq(body.version);
            if (typeof body.known !== 'boolean' || typeof body.available !== 'boolean' ||
                typeof body.observed !== 'boolean' || (body.available && !body.known) ||
                (!body.observed && (body.known || body.available))) return false;
            if (body.known) {
               const valid = body.type === 'integer' ? Number.isSafeInteger(body.value) :
                  body.type === 'number' ? typeof body.value === 'number' && Number.isFinite(body.value) :
                  typeof body.value === body.type;
               if (!valid) return false;
            } else if ('value' in body) return false;
         }
         const o = this.find(id);
         if (o.removed || seq < o.seq) return true;
         let p = o.properties.get(body.name);
         if (!p) {
            if (o.properties.size >= 256) return false;
            p = {}; o.properties.set(body.name, p);
         }
         if (descriptor ? p.descriptor && seq < p.descriptorSeq : p.state && (version <= p.version || seq < p.stateSeq)) return true;
         const copy = JSON.parse(JSON.stringify(body));
         if (descriptor) { p.descriptor = copy; p.descriptorSeq = seq; }
         else { p.state = copy; p.stateSeq = seq; p.version = version; }
         return true;
      } catch (_) { return false; }
   }
   dump() {
      return [...this.objects.entries()].filter(([, o]) => !o.removed && o.descriptor).map(([uuid, o]) =>
         ({ uuid, ...o.descriptor, properties: [...o.properties].map(([name, p]) => ({ name, descriptor: p.descriptor, state: p.state })) }));
   }
}
var rrObjectCache = new RRObjectCache();
function rrObjectsSubscribe() {
   rrObjectCache.clear();
   rrInventoryRequests.clear();
   socket.send(JSON.stringify({msg: {type: 'object'}, object: {cmd: 'snapshot'}, request: {id: 'initial-objects'}}));
}
// Browser-console diagnostic: rrObjectsDump().
function rrObjectsDump() { const objects = rrObjectCache.dump(); console.log(objects); return objects; }
if (typeof module !== 'undefined') module.exports = { RRObjectCache };

// PARITY: rrclient/objects.events.c. Inventory is a one-shot view; it does
// not replace, clear, or subscribe the UUID property cache.
var rrInventoryRequest = 0, rrInventoryId = '';
var rrInventoryRequests = new Map();
function rrInventoryLine(entry) {
   const depth = Number(entry.depth);
   if (!Number.isInteger(depth) || depth < 0 || depth > 4) return null;
   const fields = ['uuid', 'room', 'backend', 'frequency', 'codec', 'direction', 'subsystem', 'coordinates', 'source', 'service', 'state', 'access', 'action'];
   return (depth ? '   '.repeat(depth - 1) + '+- ' : '') +
      (entry.kind || 'resource') + ' ' + (entry.name || '') +
      fields.filter(key => entry[key] !== undefined && entry[key] !== '').map(key => '  ' + key + '=' + entry[key]).join('');
}
function rrInventoryMessage(message) {
   const cmd = message.object?.cmd;
   if (cmd !== 'inventory-entry' && cmd !== 'inventory-end') return false;
   const id = message.request?.id;
   if (!rrInventoryRequests.has(id)) return true;
   const pending = rrInventoryRequests.get(id);
   const room = pending.room;
   if (cmd === 'inventory-entry') {
      const entry = message.inventory || {}, depth = Number(entry.depth);
      if (!Number.isInteger(depth) || depth < 0 || depth > 4) return true;
      pending.visible[depth] = pending.kind === 'serial' || !room || room[0] !== '#' ||
         (['site','rig'].includes(entry.kind) ? mediaResourceMatches(room,entry.room) :
          depth > 0 && pending.visible[depth - 1]);
      if (!pending.visible[depth]) return true;
      if (!(pending.kind === 'rig' ? ['rig','vfo'].includes(entry.kind) : entry.kind === pending.kind)) return true;
      if (pending.kind === 'serial' && entry.service !== 'serial') return true;
      pending.count++;
   }
   const line = cmd === 'inventory-end' ? 'End of ' + pending.kind + ' list (' + pending.count + ' entries).' :
      rrInventoryLine({...message.inventory, depth: pending.kind === 'rig' ? message.inventory.depth : 0});
   if (line !== null) ChatBox.Append($('<div class="notice" style="white-space:pre-wrap"></div>').text(line), room);
   if (cmd === 'inventory-end') rrInventoryRequests.delete(id);
   return true;
}
function rrRigCommand(args) {
   const verb = (args[1] || 'list').toLowerCase();
   const cmd = {list: 'inventory', subscribe: 'snapshot', unsubscribe: 'unsubscribe'}[verb];
   if (!cmd || args.length > 2) { ChatBox.Append($('<div class="notice"></div>').text('Usage: /rig list|subscribe|unsubscribe'),ChatBox.current_room); return; }
   if (!window.socket || socket.readyState !== WebSocket.OPEN) return;
   const id = 'rig-' + (++rrInventoryRequest);
   if (cmd === 'inventory') {
      if (rrInventoryRequests.size >= 32) {
         ChatBox.Append($('<div class="notice"></div>').text('Wait for an outstanding resource listing to finish'),ChatBox.current_room);
         return;
      }
      rrInventoryId = id;
      rrInventoryRequests.set(id,{room: ChatBox.current_room || (typeof webui_authoritative_room !== 'undefined' ? webui_authoritative_room : '#rig'), visible: [], kind: ['gps','serial'].includes(args[0]) ? args[0] : 'rig', count: 0});
   }
   socket.send(JSON.stringify({msg: {type: 'object'}, object: {cmd}, request: {id}}));
}
function rrGpsCommand(args) {
   const verb = (args[1] || 'list').toLowerCase();
   if (verb === 'list' && args.length <= 2) { rrRigCommand(['gps', 'list']); return; }
   if (args.length === 3 && ['subscribe', 'unsubscribe'].includes(verb)) {
      const entry = Object.values(mediaChannels).find(ch => ch.name === args[2] + '.gps.rx' && ch.codec === 'gpsp');
      if (entry) {
         entry.disabled = verb === 'unsubscribe';
         if (entry.disabled) unsubscribeMediaChannel(entry.uuid); else subscribeMediaChannel(entry.uuid, false);
         return;
      }
   }
   ChatBox.Append($('<div class="notice"></div>').text('Usage: /gps list|subscribe|unsubscribe <rig-alias|station>; use /gps list to discover outputs'),ChatBox.current_room);
}
if (typeof module !== 'undefined') Object.assign(module.exports, {rrInventoryLine});

function rrObjectReferences() {
   const objects = rrObjectCache.dump();
   return objects.map(o => {
      const owner = objects.find(parent => parent.uuid === o.owner);
      return {...o, symbol: o.type === 'vfo' && owner ? (owner.alias || owner.uuid) + '.' + o.alias : (o.alias || o.uuid)};
   });
}
// PARITY: rrclient/objects.c object_in_context.
function rrObjectInContext(object, objects, room) {
   let owner = object;
   for (let depth = 0; owner && depth < 3; depth++) {
      if (owner.room) return mediaResourceMatches(room,owner.room);
      owner = objects.find(parent => parent.uuid === owner.owner);
   }
   return mediaResourceMatches(room,null);
}
// PARITY: rrclient/objects.c rr_object_cache_dump_selected.
function rrObjectsList(reference) {
   const room = ChatBox.current_room;
   const objects = rrObjectReferences();
   const symbols = new Map(objects.map(o => [o.uuid,o.symbol]));
   let selected;
   if (reference) {
      const exact = objects.find(o => o.uuid.toLowerCase() === reference.toLowerCase());
      const matches = exact ? [exact] : objects.filter(o => symbols.get(o.uuid).toLowerCase() === reference.toLowerCase());
      if (matches.length !== 1) {
         ChatBox.Append($('<div class="notice"></div>').text('Unknown or ambiguous object ' + reference + '; use /object to choose a qualified symbol or UUID'),room);
         return false;
      }
      selected = matches[0];
   }
   const emit = line => ChatBox.Append($('<div class="notice" style="white-space:pre-wrap"></div>').text(line),room);
   emit(rrObjectCache.ready ? 'Object snapshot complete' : 'Object snapshot incomplete');
   for (const o of objects) {
      if (!reference && !rrObjectInContext(o,objects,room)) continue;
      if (selected && o !== selected && o.owner !== selected.uuid) continue;
      emit(o.type + ' ' + symbols.get(o.uuid) + ' — ' + (o.name || symbols.get(o.uuid)) +
         (o.backend ? ' / ' + o.backend : '') + ' (uuid=' + o.uuid + ')');
      for (const p of o.properties) {
         emit('  ' + p.name + ': ' + (p.state?.known ? String(p.state.value) : 'unknown') +
            (p.descriptor?.unit ? ' ' + p.descriptor.unit : '') +
            (p.state && !p.state.available ? ' (unavailable)' : '') +
            (p.descriptor?.writable ? ' [writable]' : ''));
      }
   }
   return true;
}
