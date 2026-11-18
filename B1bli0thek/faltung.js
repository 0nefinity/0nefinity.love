// Faltung: ein Element, beliebig oft gespiegelt.
// Kopie 0 (bei Text: eine je Form) bleibt echtes DOM und bedienbar. Von ihr wird ein Bild genommen (SVG-foreignObject),
// das die Grafikkarte so oft zeichnet, wie der Pfad Orte hat: je Ort nur x, y, Drehung, Größe. Wie bei Fractal0ne:
// nicht tausend Knöpfe, sondern einer, und der Raum faltet ihn.

const RAND = 8;
// Mehr Bildpunkte legt ein Schnappschuss nie an (alle Formen zusammen), sonst frisst der Atlas den Grafikspeicher.
const PIXEL_MAX = 1 << 24;
export const FORMEN_MAX = 64;

const ECKE = `#version 300 es
layout(location = 0) in vec4 a_o;
uniform vec2 u_flaeche;
uniform float u_rand;
uniform int u_start;
uniform int u_p;
uniform vec4 u_g[${FORMEN_MAX}];
out vec3 v_uv;
void main() {
  int id = gl_VertexID;
  vec2 ecke = vec2((id == 1 || id == 2 || id == 4) ? 1.0 : 0.0, (id == 2 || id == 4 || id == 5) ? 1.0 : 0.0);
  int v = (gl_InstanceID + u_start) % u_p;
  vec4 g = u_g[v];
  vec2 p = ecke * (g.xy + 2.0 * u_rand) - u_rand - g.xy * 0.5;
  float c = cos(a_o.z), s = sin(a_o.z);
  vec2 w = a_o.xy + a_o.w * vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  vec2 clip = w / u_flaeche * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_uv = vec3(ecke * g.zw, float(v));
}`;

const FLAECHE = `#version 300 es
precision mediump float;
precision mediump sampler2DArray;
uniform sampler2DArray u_t;
in vec3 v_uv;
out vec4 o;
void main() { o = texture(u_t, v_uv); }`;

// Die Bahn: Orte rechnet die Grafikkarte selbst. Kopie j = q*P + v liegt bei z_v + D_v * (W^q - 1)/(W - 1),
// W = scale^P * e^(i*P*bend), eine komplexe Zahl je Periode. Die CPU schickt nur den Anfang (q0), nie Millionen Orte.
const BAHN = `#version 300 es
uniform vec2 u_flaeche;
uniform float u_rand;
uniform int u_p;
uniform int u_r0;
uniform int u_eins;
uniform int u_rot;
uniform vec4 u_g[${FORMEN_MAX}];
uniform vec4 u_b[${FORMEN_MAX}];
uniform vec4 u_c[${FORMEN_MAX / 2}];
uniform vec2 u_inv;
uniform float u_a;
uniform vec3 u_bt;
uniform vec3 u_sicht;
uniform float u_px;
out vec3 v_uv;
out float v_k;
const float TAU = 6.283185307179586;
float mitte(float x) { return x - TAU * floor(x / TAU + 0.5); }
float expm1_(float x) { return abs(x) < 0.01 ? x * (1.0 + x * (0.5 + x * (1.0 / 6.0 + x / 24.0))) : exp(x) - 1.0; }
// sin der Grafikkarte ist nur absolut genau (~1e-7): bei winziger Krümmung wäre jeder Schritt null. Nahe 0 die Reihe.
float sin_(float x) { return abs(x) < 0.01 ? x * (1.0 - x * x * (1.0 / 6.0 - x * x / 120.0)) : sin(x); }
void main() {
  int id = gl_VertexID;
  vec2 ecke = vec2((id == 1 || id == 2 || id == 4) ? 1.0 : 0.0, (id == 2 || id == 4 || id == 5) ? 1.0 : 0.0);
  int j = gl_InstanceID + u_r0;
  int v = j % u_p, k = j / u_p;
  float fk = float(k);
  // Der Winkel k*arg(W) in drei Byte-Stufen, jede schon auf den Kreis gefaltet: float reicht so für Millionen Runden.
  float th = mitte(mitte(float(k >> 16) * u_bt.z + float((k >> 8) & 255) * u_bt.y) + float(k & 255) * u_bt.x);
  vec2 G;
  if (u_eins == 1) G = vec2(fk, 0.0);
  else {
    float ka = fk * u_a, sh = sin_(0.5 * th);
    vec2 w = vec2(expm1_(ka) * cos(th) - 2.0 * sh * sh, exp(ka) * sin_(th));
    G = vec2(w.x * u_inv.x - w.y * u_inv.y, w.x * u_inv.y + w.y * u_inv.x);
  }
  vec4 b = u_b[v];
  vec2 pos = b.xy + vec2(b.z * G.x - b.w * G.y, b.z * G.y + b.w * G.x);
  vec4 cc = u_c[v >> 1];
  vec2 rl = (v & 1) == 0 ? cc.xy : cc.zw;
  float rot = rl.x + float(u_rot) * th;
  float s = exp(rl.y + fk * u_a);
  vec4 g = u_g[v];
  if (length(pos - u_sicht.xy) > u_sicht.z + s * 0.5 * length(g.xy + 2.0 * u_rand)) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    v_uv = vec3(0.0);
    v_k = 0.0;
    return;
  }
  // Unter u_px träfe die Kopie kaum einen Bildpunkt: sie wird ein Fleck von u_px, gedimmt auf ihre echte Fläche.
  // Die gröbste Mipmap-Stufe liefert dazu ihre mittlere Farbe; so summieren unendlich viele Winzlinge richtig.
  vec2 kante = g.xy + 2.0 * u_rand;
  float s2 = max(s, u_px / max(kante.x, kante.y));
  v_k = (s / s2) * (s / s2);
  vec2 p = ecke * kante - u_rand - g.xy * 0.5;
  float c = cos(rot), sn = sin(rot);
  vec2 w2 = pos + s2 * vec2(c * p.x - sn * p.y, sn * p.x + c * p.y);
  vec2 clip = w2 / u_flaeche * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_uv = vec3(ecke * g.zw, float(v));
}`;

const BAHN_FLAECHE = `#version 300 es
precision highp float;
precision mediump sampler2DArray;
uniform sampler2DArray u_t;
in vec3 v_uv;
in float v_k;
out vec4 o;
void main() { o = texture(u_t, v_uv) * v_k; }`;

// Der Stapel: liegen alle Kopien einer Form genau aufeinander, rechnet jeder Bildpunkt die m Schichten auf einmal.
// m Schichten mit Deckkraft a decken 1 - (1 - a)^m: für m = ∞ ist das 1, so viele wie gemeint, keine gezeichnet.
const STAPEL_ECKE = `#version 300 es
uniform vec2 u_flaeche;
uniform vec4 u_kasten;
out vec2 v_p;
void main() {
  int id = gl_VertexID;
  vec2 ecke = vec2((id == 1 || id == 2 || id == 4) ? 1.0 : 0.0, (id == 2 || id == 4 || id == 5) ? 1.0 : 0.0);
  v_p = mix(u_kasten.xy, u_kasten.zw, ecke);
  vec2 clip = v_p / u_flaeche * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const STAPEL_FLAECHE = `#version 300 es
precision highp float;
precision mediump sampler2DArray;
uniform sampler2DArray u_t;
uniform float u_rand;
uniform int u_p;
uniform int u_rest;
uniform float u_m;
uniform vec4 u_g[${FORMEN_MAX}];
uniform vec4 u_b[${FORMEN_MAX}];
in vec2 v_p;
out vec4 o;
void main() {
  vec4 B = vec4(0.0), R = vec4(0.0);
  for (int r = 0; r < ${FORMEN_MAX}; r++) {
    if (r >= u_p) break;
    vec4 b = u_b[r], g = u_g[r];
    vec2 d = v_p - b.xy;
    vec2 l = vec2(b.z * d.x + b.w * d.y, -b.w * d.x + b.z * d.y);
    vec2 q = (l + g.xy * 0.5 + u_rand) / (g.xy + 2.0 * u_rand);
    vec4 f = texture(u_t, vec3(q * g.zw, float(r)));
    f *= step(0.0, q.x) * step(0.0, q.y) * step(q.x, 1.0) * step(q.y, 1.0);
    B = f + B * (1.0 - f.a);
    if (r == u_rest - 1) R = B;
  }
  float A = u_m < 0.0 ? 1.0 : (u_m == 0.0 ? 0.0 : 1.0 - pow(max(0.0, 1.0 - B.a), u_m));
  vec4 F = B.a > 0.0 ? B * (A / B.a) : vec4(0.0);
  o = R + F * (1.0 - R.a);
}`;

// Die Runde: schließt sich die Bahn nach einer Runde, liegt der Rest des Unendlichen Runde auf Runde darüber.
// Eine Runde deckt (F, A); unendlich viele x = F + x(1 - A) haben den Fixpunkt F / A. Gezeichnet wird eine, gemeint sind alle.
const RUNDE_ECKE = `#version 300 es
out vec2 v_p;
void main() {
  int id = gl_VertexID;
  v_p = vec2((id == 1 || id == 2 || id == 4) ? 1.0 : 0.0, (id == 2 || id == 4 || id == 5) ? 1.0 : 0.0);
  gl_Position = vec4(v_p * 2.0 - 1.0, 0.0, 1.0);
}`;

const RUNDE_FLAECHE = `#version 300 es
precision highp float;
uniform sampler2D u_r;
in vec2 v_p;
out vec4 o;
void main() {
  vec4 f = texture(u_r, v_p);
  // Unter einem Byte-Schritt (1/255) ist A kein Stoff, nur Abtast-Staub vom Filtern: der bleibt, was er ist.
  o = f.a >= 1.0 / 255.0 ? f / f.a : f;
}`;

// Was der Host an seine Kopien vererbt; im Bild gibt es keinen Host, also steht es dort ausdrücklich.
const ERBE = ['color', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'word-spacing',
  'text-shadow', 'text-transform', 'font-variant', 'font-stretch', '-webkit-font-smoothing'];

function shader(gl, art, quelle) {
  const s = gl.createShader(art);
  gl.shaderSource(s, quelle);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Faltung: Shader ' + gl.getShaderInfoLog(s));
  return s;
}

function programm(gl, ecke, flaeche, namen) {
  const prog = gl.createProgram();
  gl.attachShader(prog, shader(gl, gl.VERTEX_SHADER, ecke));
  gl.attachShader(prog, shader(gl, gl.FRAGMENT_SHADER, flaeche));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('Faltung: Programm ' + gl.getProgramInfoLog(prog));
  const u = {};
  for (const n of namen) u[n] = gl.getUniformLocation(prog, n);
  return { prog, u };
}

const zweierpotenz = (x) => 2 ** Math.ceil(Math.log2(Math.max(1, x)));
// Bei ungeraden Kantenlängen dürfen Treiber die Mipmap-Stufen mit Punktabtastung bauen: dünne Linien bleiben dann
// in jeder Verkleinerung voll deckend und leuchten. Glatt halbierbar bis Stufe 6 hält sie so dünn wie im DOM.
const halbierbar = (x) => { const q = Math.min(64, zweierpotenz(x)); return Math.ceil(x / q) * q; };

export class Faltung {
  constructor(el) {
    this.el = el;
    const c = (this.leinwand = document.createElement('canvas'));
    c.className = 'faltung';
    c.setAttribute('aria-hidden', 'true');
    const gl = (this.gl = c.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false }));
    if (!gl) throw new Error('B1bli0thek: kein WebGL2, Faltung aus, DOM-Weg');
    ({ prog: this.prog, u: this.u } = programm(gl, ECKE, FLAECHE, ['u_flaeche', 'u_rand', 'u_start', 'u_p', 'u_g', 'u_t']));
    this.pb = programm(gl, BAHN, BAHN_FLAECHE, ['u_flaeche', 'u_rand', 'u_p', 'u_r0', 'u_eins', 'u_rot', 'u_g', 'u_b', 'u_c', 'u_inv', 'u_a', 'u_bt', 'u_sicht', 'u_px', 'u_t']);
    this.ps = programm(gl, STAPEL_ECKE, STAPEL_FLAECHE, ['u_flaeche', 'u_kasten', 'u_t', 'u_rand', 'u_p', 'u_rest', 'u_m', 'u_g', 'u_b']);
    this.pr = programm(gl, RUNDE_ECKE, RUNDE_FLAECHE, ['u_r']);
    this.halbfloat = !!gl.getExtension('EXT_color_buffer_float');
    this.leerVao = gl.createVertexArray();
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.puffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.puffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0);
    gl.vertexAttribDivisor(0, 1);
    gl.bindVertexArray(null);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    c.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      // Handys nehmen den Kontext oft weg (Hintergrund, Speicher): neu aufbauen statt für immer auf DOM.
      if (!this.weg) el._faltVerlust();
    });
    this.g = new Float32Array(FORMEN_MAX * 4);
    this.tex = null;
    this.texP = 0;
    this.sig = '';
    this.f = 0;
    this.pruefen = true;
    this.laeuft = false;
    this.leer_ = true;
    el._buehne.append(c);
    this.mo = new MutationObserver(() => { this.pruefen = true; });
    this.mo.observe(el._buehne, { subtree: true, attributes: true, childList: true, characterData: true });
  }

  veraltet() { this.pruefen = true; }

  weg_() {
    this.weg = true;
    this.mo.disconnect();
    this.leinwand.remove();
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  // Woran man sieht, dass das Bild neu muss: Markup ohne Ort, Werte der Felder, Farbe (Thema), fertig geladene Bilder.
  signatur(P) {
    const el = this.el;
    let s = getComputedStyle(el).color;
    for (let i = 0; i < P; i++) {
      const k = el._kopien[i];
      if (!k) return null;
      s += '\u0001' + k.outerHTML.replace(/transform:[^;"]*;?/g, '');
      for (const f of [k, ...k.querySelectorAll('input, textarea, img')]) {
        if (f.tagName === 'IMG') { if (!f.complete || !f.naturalWidth) return null; } else if (f.tagName === 'INPUT' || f.tagName === 'TEXTAREA') s += '\u0000' + f.value + f.checked;
      }
    }
    return s;
  }

  // Leinwand, Bild und leeres Blatt: was jedem Zeichnen vorausgeht. false, solange das Bild der Formen fehlt.
  _ruesten(P, W, H, smax) {
    const gl = this.gl, c = this.leinwand;
    const dpr = devicePixelRatio || 1;
    const bw = Math.max(1, Math.round(W * dpr)), bh = Math.max(1, Math.round(H * dpr));
    if (c.width !== bw) c.width = bw;
    if (c.height !== bh) c.height = bh;
    // Doppelt so fein wie nötig: gedreht und verkleinert bleiben dünne Linien so dünn wie im DOM.
    const f = dpr * Math.min(8, 2 * zweierpotenz(smax));
    if (this.pruefen || f !== this.f) {
      const sig = this.signatur(P);
      this.pruefen = false;
      if (sig !== null && (sig !== this.sig || f !== this.f)) {
        if (this.laeuft) this.nochmal = true;
        else { this.sig = sig; this.f = f; this.schnappe(P, f); }
      }
    }
    gl.viewport(0, 0, bw, bh);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.leer_ = false;
    if (!this.tex || this.texP !== P) return false;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex);
    return true;
  }

  // orte: x, y, Drehung (rad), Größe je Kopie; P Formen; gezeichnet werden P..n-1.
  zeichne(orte, P, n, W, H, smax) {
    const gl = this.gl;
    if (!this._ruesten(P, W, H, smax)) return;
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.puffer);
    gl.bufferData(gl.ARRAY_BUFFER, orte.subarray(P * 4, n * 4), gl.DYNAMIC_DRAW);
    gl.uniform1i(this.u.u_t, 0);
    gl.uniform2f(this.u.u_flaeche, W, H);
    gl.uniform1f(this.u.u_rand, this.rand);
    gl.uniform1i(this.u.u_start, P);
    gl.uniform1i(this.u.u_p, P);
    gl.uniform4fv(this.u.u_g, this.g);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n - P);
    gl.bindVertexArray(null);
  }

  // d.teile: Stücke der Bahn, je ab Kopie r0 (in der ersten Periode des Stücks), anzahl Stück.
  // b = je Form (x, y, Dx, Dy) am Anfang des Stücks, c = je Form (Drehung, ln Größe).
  bahn(d, W, H, smax) {
    const gl = this.gl, u = this.pb.u;
    if (!this._ruesten(d.P, W, H, smax)) return;
    gl.useProgram(this.pb.prog);
    gl.bindVertexArray(this.leerVao);
    gl.uniform1i(u.u_t, 0);
    gl.uniform2f(u.u_flaeche, W, H);
    gl.uniform1f(u.u_rand, this.rand);
    gl.uniform1i(u.u_p, d.P);
    gl.uniform1i(u.u_eins, d.eins ? 1 : 0);
    gl.uniform1i(u.u_rot, d.rotate ? 1 : 0);
    gl.uniform4fv(u.u_g, this.g);
    gl.uniform2f(u.u_inv, d.ix, d.iy);
    gl.uniform1f(u.u_a, d.a);
    gl.uniform3f(u.u_bt, d.bt[0], d.bt[1], d.bt[2]);
    gl.uniform3f(u.u_sicht, W / 2, H / 2, Math.hypot(W, H) / 2);
    gl.uniform1f(u.u_px, 2 / (devicePixelRatio || 1));
    if (d.runde) {
      const bw = this.leinwand.width, bh = this.leinwand.height;
      if (!this.rf || this.rw !== bw || this.rh !== bh) this._rundeRuesten(bw, bh);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.rf);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    for (const t of d.teile) {
      gl.uniform1i(u.u_r0, t.r0);
      gl.uniform4fv(u.u_b, t.b);
      gl.uniform4fv(u.u_c, t.c);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, t.anzahl);
    }
    if (d.runde) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.useProgram(this.pr.prog);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.rt);
      gl.uniform1i(this.pr.u.u_r, 1);
      gl.disable(gl.BLEND);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.enable(gl.BLEND);
      gl.activeTexture(gl.TEXTURE0);
    }
    gl.bindVertexArray(null);
  }

  // Ablage für eine Runde, halbe Gleitkommazahl, wo es geht: F / A teilt durch kleine Deckkräfte.
  _rundeRuesten(bw, bh) {
    const gl = this.gl;
    if (this.rt) gl.deleteTexture(this.rt);
    this.rt = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.rt);
    if (this.halbfloat) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, bw, bh, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, bw, bh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE0);
    this.rf ||= gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.rf);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.rt, 0);
    const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (st !== gl.FRAMEBUFFER_COMPLETE) throw new Error('B1bli0thek: Ablage für die Runde unvollständig (' + st + ')');
    this.rw = bw; this.rh = bh;
  }

  // d.b = je Form (x, y, cos, sin), d.kasten = was alle Formen zusammen bedecken, d.m volle Schichten (-1 = ∞), d.rest.
  stapel(d, W, H) {
    const gl = this.gl, u = this.ps.u;
    if (!this._ruesten(d.P, W, H, 1)) return;
    gl.useProgram(this.ps.prog);
    gl.bindVertexArray(this.leerVao);
    gl.uniform1i(u.u_t, 0);
    gl.uniform2f(u.u_flaeche, W, H);
    gl.uniform4f(u.u_kasten, d.kasten[0], d.kasten[1], d.kasten[2], d.kasten[3]);
    gl.uniform1f(u.u_rand, this.rand);
    gl.uniform1i(u.u_p, d.P);
    gl.uniform1i(u.u_rest, d.rest);
    gl.uniform1f(u.u_m, d.m);
    gl.uniform4fv(u.u_g, this.g);
    gl.uniform4fv(u.u_b, d.b);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  leer() {
    if (this.leer_) return;
    this.leer_ = true;
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  async schnappe(P, f) {
    const el = this.el, gl = this.gl;
    this.laeuft = true;
    try {
      const masse = [];
      let rand = RAND;
      for (let i = 0; i < P; i++) {
        const m = el._masse[i];
        if (!m) { this.sig = ''; return; }
        masse.push(m);
        const k = el._kopien[i];
        const cs = getComputedStyle(k);
        // Schatten und Leuchten ragen über die Kante: so viel Rand bekommt das Bild.
        const ueber = `${cs.boxShadow} ${cs.textShadow} ${cs.outlineWidth}`.match(/-?[\d.]+px/g) || [];
        rand = Math.max(rand, RAND + ueber.reduce((a, x) => a + Math.abs(parseFloat(x)), 0));
      }
      rand = Math.ceil(rand);
      let vw = 0, vh = 0;
      for (const m of masse) { vw = Math.max(vw, m.w + 2 * rand); vh = Math.max(vh, m.h + 2 * rand); }
      const ff = Math.min(f, Math.sqrt(PIXEL_MAX / (vw * vh * P)), this.maxTex / vw, this.maxTex / vh);
      const LW = halbierbar(Math.ceil(vw * ff)), LH = halbierbar(Math.ceil(vh * ff));
      const bilder = await Promise.all(masse.map((m, i) => this.bild(el._kopien[i], m, rand, ff)));
      if (this.weg) return;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
      const stufen = Math.floor(Math.log2(Math.max(LW, LH))) + 1;
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY, stufen, gl.RGBA8, LW, LH, P);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      for (let i = 0; i < P; i++) {
        const b = bilder[i];
        gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, b.breite, b.hoehe, 1, gl.RGBA, gl.UNSIGNED_BYTE, b.bild);
        this.g.set([masse[i].w, masse[i].h, b.breite / LW, b.hoehe / LH], i * 4);
      }
      gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const err = gl.getError();
      if (err) throw new Error('Faltung: WebGL-Fehler ' + err);
      if (this.tex) gl.deleteTexture(this.tex);
      this.tex = tex;
      this.texP = P;
      this.rand = rand;
    } catch (e) {
      // Mitten im Bild verlorener Kontext ist kein Fehler: webglcontextlost baut neu auf.
      if (!this.weg && !gl.isContextLost()) el._faltFehler(e);
      return;
    } finally {
      this.laeuft = false;
    }
    if (this.nochmal) { this.nochmal = false; this.pruefen = true; }
    el.zeichne();
  }

  // Eine DOM-Kopie als Bild: das Shadow-CSS (:host wird .host), der Host als div, die Kopie ohne Ort.
  async bild(k, m, rand, f) {
    const el = this.el;
    const hs = getComputedStyle(el);
    const vw = m.w + 2 * rand, vh = m.h + 2 * rand;
    const breite = Math.max(1, Math.ceil(vw * f)), hoehe = Math.max(1, Math.ceil(vh * f));
    const css = (el._root.querySelector('style')?.textContent || '')
      .replace(/:host\(([^()]*)\)/g, '.host$1').replace(/:host\b/g, '.host')
      + `.host{position:absolute!important;left:${rand}px!important;top:${rand}px!important;width:${m.w}px!important;height:${m.h}px!important;overflow:visible!important;display:block!important}`;

    const klon = k.cloneNode(true);
    klon.style.removeProperty('transform');
    klon.hidden = false;
    const alt = [k, ...k.querySelectorAll('*')], neu = [klon, ...klon.querySelectorAll('*')];
    for (let i = 0; i < alt.length; i++) {
      const o = alt[i], c = neu[i];
      const s = getComputedStyle(o);
      // vmin und % beziehen sich im Bild auf das Bild, nicht auf den Bildschirm: Maße fest in px.
      if (s.display !== 'inline' && s.display !== 'none') { c.style.width = s.width; c.style.height = s.height; }
      c.style.fontSize = s.fontSize;
      if (o.tagName === 'INPUT') { c.setAttribute('value', o.value); if (o.checked) c.setAttribute('checked', ''); }
      else if (o.tagName === 'TEXTAREA') c.textContent = o.value;
      else if (o.tagName === 'IMG') {
        // Ein Bild im Bild darf nichts nachladen: es reist als data:-URL mit.
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.ceil(o.offsetWidth * f));
        cv.height = Math.max(1, Math.ceil(o.offsetHeight * f));
        cv.getContext('2d').drawImage(o, 0, 0, cv.width, cv.height);
        c.setAttribute('src', cv.toDataURL());
        c.removeAttribute('srcset');
      }
    }

    const host = document.createElement('div');
    host.className = 'host';
    for (const a of el.attributes) if (!['class', 'style', 'id', 'tabindex'].includes(a.name)) host.setAttribute(a.name, a.value);
    const namen = new Set();
    for (const t of [css, klon.outerHTML]) for (const x of t.matchAll(/var\((--[\w-]+)/g)) namen.add(x[1]);
    let stil = ERBE.map((p) => `${p}:${hs.getPropertyValue(p)}`).join(';');
    for (const n of namen) { const v = hs.getPropertyValue(n); if (v) stil += `;${n}:${v}`; }
    host.setAttribute('style', stil);
    host.append(klon);
    const huelle = document.createElement('div');
    const style = document.createElement('style');
    style.textContent = css;
    huelle.append(style, host);
    const xml = new XMLSerializer().serializeToString(huelle);
    const wurzel = getComputedStyle(document.documentElement).fontSize;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${breite}" height="${hoehe}" viewBox="0 0 ${vw} ${vh}" style="font-size:${wurzel}">`
      + `<foreignObject x="0" y="0" width="${vw}" height="${vh}">${xml}</foreignObject></svg>`;
    const bild = new Image();
    bild.width = breite;
    bild.height = hoehe;
    bild.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await bild.decode();
    return { bild, breite, hoehe };
  }
}
