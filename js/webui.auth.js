////////////////////////////
// Authentication/Session //
////////////////////////////
var logged_in;			// Did we get an AUTHORIZED response?
var auth_user;			// Username the server sent us
var auth_token;			// Session token the server gave us during LOGIN
var auth_privs;			// Privileges the server has granted us
var remote_nonce;		// The login nonce, which is used to derive a replay protected password response
var login_user;			// Username we send to the server

if (!window.webui_inits) window.webui_inits = [];
window.webui_inits.push(function webui_auth_init() {
   $('input#user').change(function() {
      // Cache the username and force to upper case
      login_user = $('input#user').val().toUpperCase();
      $('input#user').val = login_user;
   });

   // When the form is submitted, we need to send the username and wait for a nonce to come back
   $('form#login').submit(function(evt) {
      // Stop HTML form submission
      evt.preventDefault();

      // disable the button
      $('button#login-submit-btn').prop('disabled', true);

      let user = $("input#user");
      let pass = $("input#pass");

      // A username is *required*
      if (user.val().trim() === "") {
         flash_red(user);
         user.focus();
         event.preventDefault();
         return;
      }

      // A password is *required*
      if (pass.val().trim() === "") {
         flash_red(pass);
         pass.focus();
         event.preventDefault();
         return;
      }

      // Since this is a manual reconnect attempt, unset ws_kicked which would block it
      ws_kicked = false;
      logged_in = false;
      ws_connect();
   });
// If we can fix the positioning, this is nice to have... but disabled for now
//      var chroma_hash = $("input:password").chromaHash({ bars: 4, minimum: 3, salt:"63d38fe86e1ea020d1dc945a10664d80" });
   $('#auth-change-form').on('submit', auth_change_password_submit);
   $('#win-login input#user').focus();

   $(window).on('beforeunload', function() {
       // Prevent auto-reconnect from firing a ghost connection while the page is going away
       stop_reconnecting();
   });
});

////////////////////////////
// Send initial Login Cmd //
////////////////////////////
function try_login() {
   // Save the login user
   login_user = $('input#user').val().toUpperCase();

   console.log("Logging in as " + login_user + "...");

   var msgObj = {
      "msg": {
         "type": "auth"
      },
      "auth": {
         "cmd": "login",
         "user": login_user
      }
   };

   socket.send(JSON.stringify(msgObj));
}

function show_connecting(state) {
   if (state == true) {
      $('#connecting').show();
   } else {
      $('#connecting').hide();
   }
}

// Passwords are sent only through a TLS-protected WebSocket.
function auth_secure_socket() {
   return location.protocol === 'https:' && typeof socket !== 'undefined' &&
      socket.readyState === WebSocket.OPEN && socket.url.startsWith('wss://');
}
function authenticate(user, password, token) {
   if (!auth_secure_socket()) throw new Error('HTTPS/WSS required for password login');
   return { msg: { type:'auth' },
      auth: { cmd:'pass', method:'tls-password-v1', user:user, pass:password, token:token } };
}
function auth_change_password_submit(event) {
   event.preventDefault();
   const one = $('#auth-new-password').val();
   const two = $('#auth-confirm-password').val();
   const status = $('#auth-password-status');
   if (!logged_in || !auth_secure_socket()) {
      status.text('Secure connection required.'); return;
   }
   if (one.length < 8 || one.length > 256 || one !== two) {
      status.text('Use matching passwords of 8–256 characters.'); return;
   }
   if (!/^[a-z0-9_-]+$/i.test(auth_user || '')) {
      status.text('Invalid account name.'); return;
   }
   socket.send(JSON.stringify({
      msg: { type: 'auth' },
      auth: { cmd: 'change-password', method: 'tls-password-v1',
         user: auth_user, token: auth_token, 'new-password': one }
   }));
   $('#auth-new-password, #auth-confirm-password').val('');
   status.text('Password change requested; awaiting server confirmation.');
}

function logout() {
   var msgObj = {
      "msg": {
         "type": "auth"
      },
      "auth": {
         "cmd": "logout",
         "user": auth_user,
         "token": auth_token
      }
   };
   // Flag that we're logging out BEFORE sending, so the server's close
   // can't trip the auto-reconnect in socket.onclose/onerror
   ws_kicked = true;

   if (typeof socket !== 'undefined' && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msgObj));
   }
   stop_reconnecting();

   if (typeof chatbox_clear === "function") {
      chatbox_clear();
   }

   if (typeof syslog_clear === "function") {
      syslog_clear();
   }

   $('#auth-change-password').hide();
   wm_switch_tab('login');
   // Force a reload 1.5 sec after logout so they might see the logged out notice
   setTimeout(function() { location.reload(); }, 1500);
}

////////////////////////
////////////////////////
////////////////////////
function webui_parse_auth_msg(msgObj) {
   var cmd = msgObj.auth.cmd;
   var error = msgObj.auth.error;

   if (error) {
      var error = msgObj.auth.error;
      stop_reconnecting();			// disable auto-reconnects

      console.log("auth.error:", error);
      var my_ts = msg_timestamp(Math.floor(Date.now() / 1000));
      ChatBox.Append('<div><span class="error">' + my_ts + '&nbsp;Error: ' + error + '!</span></div>');
      wm_switch_tab('login');
      $('span#sub-login-error-msg').empty();
      $('span#sub-login-error-msg').append("<span>", error, "</span>");
      form_disable(true);

      // Get rid of message after about 30 seconds XXX: disabled for now, add a check if /kicked and dont timeout
   //   setTimeout(function() { $('div#sub-login-error').hide(); }, 30000);

      $('div#sub-login-error').show();
      $('button#login-err-ok').click(function() {
         form_disable(false);
         $('div#sub-login-error').hide();
         $('span#sub-login-error-msg').empty();
         $('input#user').focus();
      });
      $('button#login-err-ok').focus();
      return false;
   }

   switch (cmd) {
      case 'password-changed':
         $('#auth-change-password').hide();
         $('#auth-password-status').text('');
         ChatBox.Append('<div><span class="notice">Your password was changed successfully.</span></div>');
         break;
      case 'authorized':
         // Save the auth_user as it's the only reputable source of truth for user's name
         if (msgObj.auth.user) {
            auth_user = msgObj.auth.user;
         }

         if (msgObj.auth.token) {
            auth_token = msgObj.auth.token;
         }

         if (msgObj.auth.privs) {
            auth_privs = msgObj.auth.privs;
         }

         // Clear the chat window if changing users
         if (login_user !== "GUEST" && auth_user !== login_user.toUpperCase()) {
            chatbox_clear();
         }

         logged_in = true;
         $('#pass').val('');
         $('#auth-change-password').toggle(Boolean(msgObj.auth['password-change-required']));

         // The browser advertises the codecs it can decode.  RX and TX are
         // negotiated independently, as in rrclient.
         ws_send_capab_msg();
         ws_send_rx_codec('mu08');
         ws_send_tx_codec('pc16');

         wm_switch_tab(active_tab);
         var my_ts = msg_timestamp(Math.floor(Date.now() / 1000));
         ChatBox.Append('<div><span class="msg-connected">' + my_ts + '&nbsp;***&nbspWelcome back, ' + auth_user + ', You have ' + auth_privs + ' privileges</span></div>');
//         webui_audio_start();
//         setupAudio();
         break;
      case 'challenge':
         var nonce = msgObj.auth.nonce;
         var token = msgObj.auth.token;

         if (token) {
            auth_token = token;
         }

         if (msgObj.auth.method !== 'tls-password-v1' || !auth_secure_socket()) {
            webui_parse_auth_msg({auth:{error:'TLS-only authentication is required'}});
            return;
         }
         try {
            socket.send(JSON.stringify(authenticate(login_user, $('input#pass').val(), auth_token)));
         } catch (e) {
            webui_parse_auth_msg({auth:{error:e.message}});
         }
         break;
      case 'expired':
         console.log("Session expired!");
         ChatBox.Append('<div><span class="error">Session expired, logging out</span></div>');
         wm_switch_tab('login');
         break;
      default:
         console.log("Unknown auth command:", cmd);
         break;
   }
}
