// Categorized help data and rendering. See native rrclient/cmd.help.c.
// Loaded after webui.chat.js; globals retain their existing public names.

const webui_help_sections = ['Connection', 'Chat and rooms', 'Radio and discovery',
   'Media', 'Serial', 'Client settings', 'Administration'];
const webui_command_help = [
   {
      "cmd": "help",
      "help_section": "Connection",
      "desc": "Show help message",
      "admin": false
   },
   {
      "cmd": "quit",
      "help_section": "Connection",
      "desc": "Exit (/quit [-yes|-y|y|yes] skips confirm)",
      "admin": false
   },
   {
      "cmd": "j",
      "help_section": "Chat and rooms",
      "desc": "Alias for /join",
      "admin": false
   },
   {
      "cmd": "join",
      "help_section": "Chat and rooms",
      "desc": "Join a channel",
      "admin": false
   },
   {
      "cmd": "list",
      "help_section": "Chat and rooms",
      "desc": "List available rooms",
      "admin": false
   },
   {
      "cmd": "me",
      "help_section": "Chat and rooms",
      "desc": "Send an action to the current channel",
      "admin": false
   },
   {
      "cmd": "msg",
      "help_section": "Chat and rooms",
      "desc": "Send a private message",
      "admin": false
   },
   {
      "cmd": "users",
      "help_section": "Chat and rooms",
      "desc": "List online users and their owning servers",
      "admin": false
   },
   {
      "cmd": "names",
      "help_section": "Chat and rooms",
      "desc": "List users with privilege flags",
      "admin": false
   },
   {
      "cmd": "part",
      "help_section": "Chat and rooms",
      "desc": "Leave a channel",
      "admin": false
   },
   {
      "cmd": "query",
      "help_section": "Chat and rooms",
      "desc": "/query user [message]: open a private tab and optionally send text",
      "admin": false
   },
   {
      "cmd": "room",
      "help_section": "Chat and rooms",
      "desc": "/room list; add #room; remove #room [-f [-h]] [token]; #room vfo ...",
      "admin": false
   },
   {
      "cmd": "topic",
      "help_section": "Chat and rooms",
      "desc": "Get or set the current room topic",
      "admin": false
   },
   {
      "cmd": "whois",
      "help_section": "Chat and rooms",
      "desc": "Show client information",
      "admin": false
   },
   { "cmd": "webcam", "help_section": "Media", "desc": "Show/hide webcam viewer", "admin": false },
   {
      "cmd": "gps",
      "help_section": "Radio and discovery",
      "desc": "GPS services: LIST | SUBSCRIBE <rig|station> | UNSUBSCRIBE <rig|station>",
      "admin": false
   },
   {
      "cmd": "grid",
      "help_section": "Radio and discovery",
      "desc": "Look up a grid square or coordinates",
      "admin": false
   },
   {
      "cmd": "object",
      "help_section": "Radio and discovery",
      "desc": "Resource tree; /object <rig0|rig0.A|uuid> inspects cached properties",
      "admin": false
   },
   {
      "cmd": "receivers",
      "help_section": "Radio and discovery",
      "desc": "Request a receiver through this server: /receivers connect|add <URL>",
      "admin": false
   },
   {
      "cmd": "qrz",
      "help_section": "Radio and discovery",
      "desc": "Look up a callsign",
      "admin": false
   },
   {
      "cmd": "rig",
      "help_section": "Radio and discovery",
      "desc": "Radios and VFOs: LIST | SUBSCRIBE | UNSUBSCRIBE property updates",
      "admin": false
   },
   {
      "cmd": "media",
      "help_section": "Media",
      "desc": "Media channels: LIST | SUBSCRIBE [-proxy] <name|uuid|#> | UNSUBSCRIBE <name|uuid|#>",
      "admin": false
   },
   {
      "cmd": "rxcodec",
      "help_section": "Media",
      "desc": "RX codecs: [LIST | <codec>|NONE [uuid|#number]]",
      "admin": false
   },
   {
      "cmd": "rxroute",
      "help_section": "Media",
      "desc": "Route room RX audio: L | R | S (both ears) | M",
      "admin": false
   },
   {
      "cmd": "rxvol",
      "help_section": "Media",
      "desc": "Set receive volume level",
      "admin": false
   },
   {
      "cmd": "txcodec",
      "help_section": "Media",
      "desc": "TX codecs: [LIST | <codec>|NONE [uuid|#number]]",
      "admin": false
   },
   {
      "cmd": "sercom",
      "help_section": "Serial",
      "desc": "LIST | REMOTE: discover permitted server serial exports; local attachments need the native client",
      "admin": false
   },
   {
      "cmd": "clear",
      "help_section": "Client settings",
      "desc": "Clear the scrollback",
      "admin": false
   },
   {
      "cmd": "config",
      "help_section": "Client settings",
      "desc": "Focus the configuration tab",
      "admin": false
   },
   {
      "cmd": "log",
      "help_section": "Client settings",
      "desc": "Switch to log tab",
      "admin": false
   },
   {
      "cmd": "die",
      "help_section": "Administration",
      "desc": "Shutdown the server",
      "admin": true
   },
   {
      "cmd": "kick",
      "help_section": "Administration",
      "desc": "Kick a user from the rig",
      "admin": true
   },
   {
      "cmd": "mute",
      "help_section": "Administration",
      "desc": "Mute a user",
      "admin": true
   },
   {
      "cmd": "quota",
      "help_section": "Administration",
      "desc": "TX/BW quota admin ([TX|BW] LIST|SHOW|ADD|RESET|SET)",
      "admin": true
   },
   {
      "cmd": "rehash",
      "help_section": "Administration",
      "desc": "Ask server to reload config & users",
      "admin": true
   },
   {
      "cmd": "restart",
      "help_section": "Administration",
      "desc": "Restart the server",
      "admin": true
   },
   {
      "cmd": "syslog",
      "help_section": "Administration",
      "desc": "Toggle server host log stream (/syslog on|off)",
      "admin": true
   },
   {
      "cmd": "unmute",
      "help_section": "Administration",
      "desc": "Unmute a user",
      "admin": true
   },
   {
      "cmd": "supervise", "help_section": "Radio", "desc": "ACCEPT|DECLINE <request-id> <rig-room>; accepting assumes control-operator responsibility", "admin": false
   }, {
      "cmd": "link", "help_section": "Administration", "desc": "LIST | OPEN <stored-peer> | CLOSE <stored-peer>", "admin": true
   },
   {
      "cmd": "admin", "help_section": "Administration", "desc": "USERS | ROOMS | QUOTAS | AUDIT | PTT [before-id]", "admin": true
   },
   {
      "cmd": "user",
      "help_section": "Administration",
      "desc": "PASS <your-user> <password>; admin/owner: manage accounts",
      "admin": false
   },
   {
      "cmd": "chat",
      "help_section": "Client settings",
      "desc": "Focus chat",
      "admin": false
   },
   {
      "cmd": "cfg",
      "help_section": "Client settings",
      "desc": "Focus configuration",
      "admin": false
   },
   {
      "cmd": "logout",
      "help_section": "Connection",
      "desc": "End session",
      "admin": false
   },
   {
      "cmd": "clearlog",
      "help_section": "Client settings",
      "desc": "Clear the log window",
      "admin": false
   },
   {
      "cmd": "clxfr",
      "help_section": "Client settings",
      "desc": "Clear file-transfer cache",
      "admin": false
   },
   {
      "cmd": "menu",
      "help_section": "Chat and rooms",
      "desc": "Show user menu",
      "admin": false
   },
   {
      "cmd": "reloadcss",
      "help_section": "Client settings",
      "desc": "Reload stylesheet",
      "admin": false
   },
   {
      "cmd": "rxmute",
      "help_section": "Media",
      "desc": "Mute receive audio",
      "admin": false
   },
   {
      "cmd": "rxunmute",
      "help_section": "Media",
      "desc": "Unmute receive audio",
      "admin": false
   }
];

// Match exact admin/owner privilege tokens for help visibility.
function webui_is_staff(privileges) {
   return String(privileges || '').split(',').some(priv => ['admin', 'owner'].includes(priv.trim()));
}

// Render categorized commands permitted by the current account.
function webui_show_help() {
   const staff = webui_is_staff(auth_privs);
   webui_help_sections.forEach(section => {
      const entries = webui_command_help.filter(entry => entry.help_section === section && (!entry.admin || staff))
         .sort((a, b) => a.cmd.localeCompare(b.cmd));
      if (!entries.length) return;
      ChatBox.Append('<div class="chat-status notice" style="color: #ff0000"><b>' + webui_escape_html(section) + '</b></div>');
      entries.forEach(entry => ChatBox.Append('<div class="chat-status notice">/' +
         webui_escape_html(entry.cmd) + ' — ' + webui_escape_html(entry.desc) + '</div>'));
   });
   ChatBox.Append('<div class="chat-status notice">Undashed rooms may be created by any authenticated account. Dashed station rooms, restoration, removal and VFO mappings require admin/owner. Removal needs a confirmation token: -f deletes metadata/bindings; -f -h also deletes chat history. Rig PTT logs and recordings remain.</div>');
   ChatBox.Append('<div class="chat-status notice">Codec changes require matching rx/tx account privileges and VFO room membership. Chain rig commands: !mode lsb freq 7200. Use Tab for command/resource completion.</div>');
}
