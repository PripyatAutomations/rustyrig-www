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
   socket.send(JSON.stringify({msg: {type: 'object'}, object: {cmd: 'snapshot'}, request: {id: 'initial-objects'}}));
}
// Browser-console diagnostic: rrObjectsDump().
function rrObjectsDump() { const objects = rrObjectCache.dump(); console.log(objects); return objects; }
if (typeof module !== 'undefined') module.exports = { RRObjectCache };
