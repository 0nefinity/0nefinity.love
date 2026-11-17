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
    const prog = (this.prog = gl.createProgram());
    gl.attachShader(prog, shader(gl, gl.VERTEX_SHADER, ECKE));
    gl.attachShader(prog, shader(gl, gl.FRAGMENT_SHADER, FLAECHE));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('Faltung: Programm ' + gl.getProgramInfoLog(prog));
    this.u = {};
    for (const n of ['u_flaeche', 'u_rand', 'u_start', 'u_p', 'u_g', 'u_t']) this.u[n] = gl.getUniformLocation(prog, n);
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
      if (!this.weg) el._faltFehler(new Error('B1bli0thek: WebGL-Kontext verloren, DOM-Weg'));
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

  // orte: x, y, Drehung (rad), Größe je Kopie; P Formen; gezeichnet werden P..n-1.
  zeichne(orte, P, n, W, H, smax) {
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
    if (!this.tex || this.texP !== P) return;
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.puffer);
    gl.bufferData(gl.ARRAY_BUFFER, orte.subarray(P * 4, n * 4), gl.DYNAMIC_DRAW);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex);
    gl.uniform1i(this.u.u_t, 0);
    gl.uniform2f(this.u.u_flaeche, W, H);
    gl.uniform1f(this.u.u_rand, this.rand);
    gl.uniform1i(this.u.u_start, P);
    gl.uniform1i(this.u.u_p, P);
    gl.uniform4fv(this.u.u_g, this.g);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n - P);
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
      if (!this.weg) el._faltFehler(e);
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
