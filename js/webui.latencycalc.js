////////////////////////
// Latency calculator //
////////////////////////
let latency_samples = [];
var latency_timer;
const latency_max_samples = 50;

function latency_send_pings() {
   rrSendMessage(socket, {msg: {type: 'ping', ts: Math.floor(Date.now() / 1000)}, ping: {ts: Math.floor(performance.now() * 1000)}});
}

function latency_check_init() {
   socket.addEventListener('message', function(event) {
      if (typeof event.data !== 'string') return;
      const msg = rrWireDecode(event.data);
      if (msg && msg.msg.type === 'pong' && msg.ping && msg.ping.ts) {
         latency_samples.push((performance.now() * 1000 - Number(msg.ping.ts)) / 1000);
         if (latency_samples.length > latency_max_samples) latency_samples.shift();
      }
   });
}

function latency_toggle_check() {
   if (!latency_timer) latency_timer = setInterval(latency_send_pings, 2000);
   else { clearInterval(latency_timer); latency_timer = null; }
}

function latency_get_avg() {
   if (latency_samples.length === 0) {
      return null;
   }

   let sum = latency_samples.reduce((a, b) => a + b, 0);
   return sum / latency_samples.length;
}
