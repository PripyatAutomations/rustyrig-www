/* PARITY: rustyrig-fw/librrprotocol/media.health.c.
 * Transport-neutral observations; clocks are compared by elapsed differences. */
'use strict';
function rrMediaObserve(state, frame, at) {
   if (!state.flows) state.flows = new Map();
   const key = `${frame.stream}/${frame.dir}/${frame.codec}`;
   let flow = state.flows.get(key);
   if (!flow) {
      if (state.flows.size >= 8) state.flows.delete(state.flows.keys().next().value);
      flow = {sequence: 0, source: frame.ts, arrival: at, last: 0, lastSource: 0, report: 0, gaps: 0, bad: 0, lastBad: 0};
      state.flows.set(key, flow);
   }
   // Refresh insertion order so the fixed observation cache evicts the least recently used stream.
   state.flows.delete(key); state.flows.set(key, flow);
   let discontinuity = false;
   if (flow.last && at >= flow.last) {
      const advance = (frame.seq - flow.sequence) >>> 0;
      if (!advance || advance > 0x7fffffff) return {accept: false};
   }
   const reset = !flow.last || at < flow.last || (frame.ts && frame.ts < flow.lastSource);
   if (!reset) {
      const advance = (frame.seq - flow.sequence) >>> 0;
      if (!advance || advance > 0x7fffffff) return {accept: false};
      if (advance > 1) {
         flow.gaps = Math.min(10000, flow.gaps + advance - 1);
         flow.lastBad = at;
         discontinuity = true;
      }
   } else {
      discontinuity = !!flow.last;
      flow.source = frame.ts; flow.arrival = at; flow.bad = flow.lastBad = 0;
   }
   let excess = 0;
   if (frame.ts && frame.ts >= flow.source && at >= flow.arrival) {
      const sent = frame.ts - flow.source, elapsed = at - flow.arrival;
      if (elapsed < sent) { flow.source = frame.ts; flow.arrival = at; }
      else excess = elapsed - sent;
   }
   if (excess >= 50000) {
      if (!flow.bad) flow.bad = at;
      flow.lastBad = at;
      if (excess >= 250000) discontinuity = true;
   } else flow.bad = 0;
   flow.sequence = frame.seq; flow.last = at; flow.lastSource = frame.ts;
   let feedback = null;
   if (!flow.report || at < flow.report || at - flow.report >= 1000000) {
      let quality = flow.lastBad && at - flow.lastBad < 1000000 ? 75 : 100;
      if (flow.bad && at - flow.bad >= 500000 && excess >= 150000) quality = 50;
      feedback = {msg: {type: 'media'}, media: {cmd: 'feedback', stream: frame.stream, dir: frame.dir,
         codec: frame.codec, quality, 'late-us': Math.min(60000000, excess), gaps: flow.gaps}};
      flow.report = at; flow.gaps = 0;
   }
   return {accept: true, discontinuity, feedback};
}
function webui_observe_audio(frame) {
   if (!frame.stream || frame.dir !== 0 || !window.socket) return false;
   if (typeof mediaChannels !== 'undefined' && !Object.values(mediaChannels).some(channel =>
      channel.stream === frame.stream && channel.codec === frame.codec && channel.subscribed &&
      channel.subsystem === 1 && channel.dir === 0 && mediaRoomMatches(channel))) return false;
   const state = socket.rrMediaHealth || (socket.rrMediaHealth = {});
   const observed = rrMediaObserve(state, frame, Math.floor(performance.now() * 1000));
   if (!observed.accept) return false;
   if (observed.discontinuity) stopPlayback();
   if (observed.feedback) rrSendMessage(socket, observed.feedback);
   return true;
}
if (typeof module !== 'undefined') module.exports = {rrMediaObserve};
