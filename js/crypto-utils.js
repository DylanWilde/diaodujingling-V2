/* ═══════════════════════════════════════════════════
   调度精灵 — 安全加密工具模块
   SHA-256 密码哈希 + AES-GCM localStorage 加密
   ═══════════════════════════════════════════════════ */

/* ─── SHA-256 实现（同步，纯JS） ─── */
var SHA256 = (function() {
  var K = [1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298];

  function rotr(x,n) { return (x>>>n)|(x<<(32-n)); }
  function ch(x,y,z) { return (x&y)^(~x&z); }
  function maj(x,y,z) { return (x&y)^(x&z)^(y&z); }
  function bsig0(x) { return rotr(x,2)^rotr(x,13)^rotr(x,22); }
  function bsig1(x) { return rotr(x,6)^rotr(x,11)^rotr(x,25); }
  function ssig0(x) { return rotr(x,7)^rotr(x,18)^(x>>>3); }
  function ssig1(x) { return rotr(x,17)^rotr(x,19)^(x>>>10); }

  function hash(msg) {
    var msgbits = msg.length*8;
    var blocks = [];
    for (var i=0;i<msg.length;i+=4) {
      blocks.push((msg.charCodeAt(i)<<24)|(msg.charCodeAt(i+1)<<16)|(msg.charCodeAt(i+2)<<8)|msg.charCodeAt(i+3));
    }
    var remaining = msg.length%4;
    if (remaining===1) blocks.push(msg.charCodeAt(msg.length-1)<<24);
    else if (remaining===2) blocks.push((msg.charCodeAt(msg.length-2)<<24)|(msg.charCodeAt(msg.length-1)<<16));
    else if (remaining===3) blocks.push((msg.charCodeAt(msg.length-3)<<24)|(msg.charCodeAt(msg.length-2)<<16)|(msg.charCodeAt(msg.length-1)<<8));

    blocks.push(0x80);
    while ((blocks.length*32)%512 !== 448) blocks.push(0);
    var hi=Math.floor(msgbits/4294967296), lo=msgbits>>>0;
    blocks.push(hi>>>0, lo>>>0);

    var H=[1779033703,3144134277,1013904242,2773480762,1359893119,2600822924,528734635,1541459225];

    for (var b=0;b<blocks.length;b+=16) {
      var w=new Array(64);
      for (var t=0;t<16;t++) w[t]=blocks[b+t]|0;
      for (t=16;t<64;t++) w[t]=(ssig1(w[t-2])+w[t-7]+ssig0(w[t-15])+w[t-16])|0;
      var a=H[0],bb=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
      for (t=0;t<64;t++) {
        var T1=(h+bsig1(e)+ch(e,f,g)+K[t]+w[t])|0;
        var T2=(bsig0(a)+maj(a,bb,c))|0;
        h=g;g=f;f=e;e=(d+T1)|0;d=c;c=bb;bb=a;a=(T1+T2)|0;
      }
      H[0]=(H[0]+a)|0;H[1]=(H[1]+bb)|0;H[2]=(H[2]+c)|0;H[3]=(H[3]+d)|0;
      H[4]=(H[4]+e)|0;H[5]=(H[5]+f)|0;H[6]=(H[6]+g)|0;H[7]=(H[7]+h)|0;
    }

    var hex='';
    for (var i=0;i<8;i++) {
      var hh=H[i]>>>0;
      for (var j=7;j>=0;j--) hex+='0123456789abcdef'.charAt((hh>>>(j*4))&0xF);
    }
    return hex;
  }

  function hmac(key, msg) {
    var blockSize=64;
    if (key.length>blockSize) key=hash(key);
    var iKey='',oKey='';
    for (var i=0;i<key.length;i++) {
      iKey+=String.fromCharCode(key.charCodeAt(i)^0x36);
      oKey+=String.fromCharCode(key.charCodeAt(i)^0x5C);
    }
    for (i=key.length;i<blockSize;i++) {
      iKey+=String.fromCharCode(0x36);
      oKey+=String.fromCharCode(0x5C);
    }
    return hash(oKey+hash(iKey+msg));
  }

  return { hash:hash, hmac:hmac };
})();

/* ─── 密码哈希 ─── */
var APP_SALT = 'DispatchHubV6_SecureHashSalt_2026';

function secureHash(password) {
  return 'sha256$' + SHA256.hmac(APP_SALT, password);
}

function verifyHash(password, storedHash) {
  if (!storedHash) return false;
  if (storedHash.indexOf('sha256$') === 0) {
    return storedHash === secureHash(password);
  }
  /* 兼容旧 simpleHash 格式（h_xxxxx）自动升级 */
  var h = 0;
  for (var i = 0; i < password.length; i++) { h = ((h << 5) - h) + password.charCodeAt(i); h |= 0; }
  var oldHash = 'h_' + Math.abs(h).toString(36);
  if (oldHash === storedHash) {
    window._upgradeHash = { password: password };
    return true;
  }
  return false;
}

async function upgradeStoredHash(db, username) {
  if (!window._upgradeHash) return;
  var newHash = secureHash(window._upgradeHash.password);
  try {
    var tx = db.transaction('accounts', 'readwrite');
    var st = tx.objectStore('accounts');
    var r = st.get(username);
    await new Promise(function(ok) { r.onsuccess = ok; r.onerror = ok; });
    if (r.result) {
      r.result.password = newHash;
      st.put(r.result);
      await new Promise(function(ok) { tx.oncomplete = function() { ok(); }; });
    }
  } catch(e) {}
  delete window._upgradeHash;
}

/* ─── 随机密码生成 ─── */
function generatePassword(len) {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  var arr = new Uint32Array(len||12);
  crypto.getRandomValues(arr);
  var pwd = '';
  for (var i=0;i<arr.length;i++) pwd += chars[arr[i]%chars.length];
  return pwd;
}

/* ─── localStorage AES-GCM 加密存储 ─── */
var SECURE_PREFIX = 'enc:';

function _getEncKey() {
  return crypto.subtle.importKey('raw',
    new TextEncoder().encode('DspHubEncKey_v6_2026Secure!'),
    { name: 'AES-GCM' }, false, ['encrypt','decrypt']
  );
}

async function secureStore(key, value) {
  try {
    var encKey = await _getEncKey();
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var encoded = new TextEncoder().encode(value);
    var ciphertext = await crypto.subtle.encrypt({ name:'AES-GCM', iv:iv }, encKey, encoded);
    var combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);
    var b64 = btoa(String.fromCharCode.apply(null, combined));
    localStorage.setItem(SECURE_PREFIX + key, b64);
    return true;
  } catch(e) { return false; }
}

async function secureLoad(key) {
  try {
    var b64 = localStorage.getItem(SECURE_PREFIX + key);
    if (!b64) return null;
    var combined = new Uint8Array(atob(b64).split('').map(function(c){return c.charCodeAt(0);}));
    var iv = combined.slice(0,12);
    var ciphertext = combined.slice(12);
    var encKey = await _getEncKey();
    var decrypted = await crypto.subtle.decrypt({ name:'AES-GCM', iv:iv }, encKey, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch(e) { return null; }
}

/* ─── 向后兼容：迁移 btoa 旧数据 ─── */
async function migrateToken(key) {
  var oldRaw = localStorage.getItem(key);
  if (oldRaw && oldRaw.indexOf(SECURE_PREFIX)!==0) {
    try {
      var decoded = oldRaw;
      /* 尝试 btoa 解码 */
      try { decoded = atob(oldRaw); } catch(e) {}
      await secureStore(key.replace(SECURE_PREFIX,''), decoded);
      localStorage.removeItem(key);
      return true;
    } catch(e) {}
  }
  return false;
}
