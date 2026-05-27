/**
 * CodeView — Shadertoy-style split pane.
 *
 * Left:  raw WebGL2 canvas driven by a user-editable fragment shader.
 * Right: GLSL code editor with syntax highlighting and a "▶ Run" compile button.
 *
 * Editor technique: transparent <textarea> overlaid on a syntax-highlighted <pre>.
 * Both share identical font / padding / white-space so they stay pixel-aligned.
 *
 * The default shader uses a clean, extensible interface:
 *   ObjectImplicit(p)  — implicit surface F(p) = 0
 *   RayObject(ro, rd)  — first positive t of ray–surface intersection, or -1
 *   ObjectNormal(p)    — analytic surface normal
 *
 * Constants (MAJOR_R, MINOR_R) live at the top of the shader so future
 * sphere / cylinder variants only need to touch those three functions.
 */

export type ShaderGeometry = 'sphere' | 'cylinder' | 'torus'

// ─────────────────────────────────────────────────────────────────────────────
// WebGL boilerplate
// ─────────────────────────────────────────────────────────────────────────────

/** Full-screen triangle — covers clip space with 3 verts, no buffer needed. */
const VERT_SRC = `#version 300 es
void main() {
  const vec2 p[3] = vec2[3](vec2(-1,-1), vec2(3,-1), vec2(-1,3));
  gl_Position = vec4(p[gl_VertexID], 0.0, 1.0);
}`;

/** Prepended to the user shader: version, precision, Shadertoy uniforms, output. */
const FRAG_PREFIX = `#version 300 es
precision highp float;
uniform vec2  iResolution;
uniform float iTime;
uniform vec4  iMouse;
out vec4 outColor;
`;

/** Bridges mainImage → the required main(). */
const FRAG_SUFFIX = `
void main() { mainImage(outColor, gl_FragCoord.xy); }
`;

// ─────────────────────────────────────────────────────────────────────────────
// Default GLSL shader
// ─────────────────────────────────────────────────────────────────────────────

// ── Shared camera + shading tail (appended after the object functions) ─────────
const SHADER_TAIL = `
// ══════════════════════════════════════════════════════
//  Camera & shading — generic, no need to edit these
// ══════════════════════════════════════════════════════

mat2 Rot(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
}

vec3 GetRayDir(vec2 uv, vec3 ro, vec3 target) {
    vec3 f = normalize(target - ro);
    vec3 r = normalize(cross(vec3(0.0, 1.0, 0.0), f));
    vec3 u = cross(f, r);
    return normalize(f * 3.0 + uv.x * r + uv.y * u);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    vec2 m  = iMouse.xy / iResolution.xy;

    // Hold mouse button and drag to orbit.
    vec3 ro = vec3(0.0, 2.5, 8.0);
    if (iMouse.z > 0.0) {
        ro.yz *= Rot(-m.y * 3.14159 + 0.8);
        ro.xz *= Rot(-m.x * 6.28318);
    }

    vec3 rd  = GetRayDir(uv, ro, vec3(0.0));
    vec3 col = vec3(0.018, 0.022, 0.030);   // background

    float hit = RayObject(ro, rd);
    if (hit > 0.0) {
        vec3 p = ro + rd * hit;
        vec3 n = ObjectNormal(p);

        vec3  lightDir = normalize(vec3(1.0, 2.0, 3.0));
        float diffuse  = max(dot(n, lightDir), 0.0);
        vec3  halfDir  = normalize(lightDir - rd);
        float spec     = pow(max(dot(n, halfDir), 0.0), 64.0);
        float fresnel  = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);

        vec3  base = shadeSurface(p);
        col  = base * (0.2 + 0.8 * diffuse);
        col += vec3(1.0) * spec * 0.45;
        col += vec3(0.35, 0.45, 0.60) * fresnel;
    }

    fragColor = vec4(pow(col, vec3(0.4545)), 1.0);   // gamma
}
`;

// ─────────────────────────────────────────────────────────────────────────────
// Per-geometry shaders
// ─────────────────────────────────────────────────────────────────────────────

const SPHERE_SHADER = `// ══════════════════════════════════════════════════════
//  Object — Sphere (radius R, centred at origin)
// ══════════════════════════════════════════════════════

const float R = 0.5;   // sphere radius

// F(p) = 0 on the sphere surface, < 0 inside, > 0 outside.
float ObjectImplicit(vec3 p) {
    return dot(p, p) - R * R;
}

// Outward unit normal at surface point p (gradient of ObjectImplicit).
vec3 ObjectNormal(vec3 p) {
    return normalize(p);
}

// Analytic quadratic solve:  (D·D)t² + 2(O·D)t + (|O|²−R²) = 0
// Returns the first positive t, or -1.0 on miss.
float RayObject(vec3 ro, vec3 rd) {
    float a     = dot(rd, rd);
    float halfB = dot(ro, rd);          // = b/2
    float c     = dot(ro, ro) - R * R;
    float disc  = halfB * halfB - a * c;
    if (disc < 0.0) return -1.0;        // ray misses
    float sqD   = sqrt(disc);
    float t0    = (-halfB - sqD) / a;   // near root
    float t1    = (-halfB + sqD) / a;   // far  root
    if (t0 > 0.0001) return t0;
    if (t1 > 0.0001) return t1;
    return -1.0;
}

// Surface colour — clean solid white/blue tint.
vec3 shadeSurface(vec3 p) {
    return vec3(0.85, 0.90, 1.0);
}
` + SHADER_TAIL;

// ─────────────────────────────────────────────────────────────────────────────

const CYLINDER_SHADER = `// ══════════════════════════════════════════════════════
//  Object — Cylinder (radius R, axis = Y, infinite barrel)
// ══════════════════════════════════════════════════════

const float R = 1.5;   // cylinder radius

// TODO: implement cylinder implicit equation.
// Hint: a point p is on the barrel when  px² + pz² = R²
//       ⟹  F(p) = px² + pz² - R²
float ObjectImplicit(vec3 p) {
    // TODO: replace with barrel equation
    return 1.0;   // placeholder — always "outside"
}

// TODO: implement cylinder surface normal.
// Hint: the outward normal on the barrel is  normalize(vec3(p.x, 0, p.z))
vec3 ObjectNormal(vec3 p) {
    // TODO: replace with correct normal
    return vec3(0.0, 1.0, 0.0);   // placeholder
}

// TODO: implement ray–cylinder intersection.
// Hint: substitute ray P(t) = ro + t·rd into ObjectImplicit:
//   (Dx²+Dz²)t² + 2(OxDx+OzDz)t + (Ox²+Oz²−R²) = 0
// Solve the quadratic; then optionally add cap discs at y = ±H/2.
float RayObject(vec3 ro, vec3 rd) {
    // TODO: solve quadratic and handle caps
    return -1.0;   // placeholder — never intersects
}

// Surface colour — vertical + azimuth stripe pattern.
vec3 shadeSurface(vec3 p) {
    float az  = atan(p.z, p.x);
    float pat = 0.5 + 0.5 * cos(12.0 * az + 6.0 * p.y);
    return vec3(0.80, 0.88, 1.0) * mix(0.65, 1.15, pat);
}
` + SHADER_TAIL;

// ─────────────────────────────────────────────────────────────────────────────

const TORUS_SHADER = `// ══════════════════════════════════════════════════════
//  Object — Torus (major radius R, minor radius r)
// ══════════════════════════════════════════════════════

const float MAJOR_R = 1.35;   // torus: major radius (centre → tube centre)
const float MINOR_R = 0.42;   // torus: minor radius (tube cross-section)

// TODO: implement torus implicit equation.
// Hint: F(p) = (|p|² + R² - r²)² - 4R²(px² + pz²)
float ObjectImplicit(vec3 p) {
    // TODO: replace with torus implicit equation
    return 1.0;   // placeholder — always "outside"
}

// TODO: implement torus surface normal.
// Hint: analytic gradient of ObjectImplicit — see Theory tab for derivation.
vec3 ObjectNormal(vec3 p) {
    // TODO: replace with correct normal
    return vec3(0.0, 1.0, 0.0);   // placeholder
}

// TODO: implement ray–torus intersection.
// Hint: substituting ray P(t) = ro + t·rd into ObjectImplicit gives a
// degree-4 (quartic) polynomial. Options:
//   • Ferrari's / Neumark's analytic quartic solver
//   • Scan for sign changes + bisection (simpler, but slower)
float RayObject(vec3 ro, vec3 rd) {
    // TODO: solve quartic or use scan + bisect
    return -1.0;   // placeholder — never intersects
}

// Surface colour — ring + tube stripe pattern.
vec3 shadeSurface(vec3 p) {
    float ring = atan(p.z, p.x);
    float tube = atan(p.y, length(p.xz) - MAJOR_R);
    float pat  = 0.5 + 0.5 * cos(18.0 * ring + 8.0 * tube);
    return vec3(0.80, 0.88, 1.0) * mix(0.65, 1.15, pat);
}
` + SHADER_TAIL;

// ─────────────────────────────────────────────────────────────────────────────

function shaderForGeometry(mode: ShaderGeometry): string {
  if (mode === 'sphere')   return SPHERE_SHADER
  if (mode === 'cylinder') return CYLINDER_SHADER
  return TORUS_SHADER
}

// ─────────────────────────────────────────────────────────────────────────────
// GLSL syntax highlighter  (tokenises left-to-right, highest priority first)
// ─────────────────────────────────────────────────────────────────────────────

const GLSL_KEYWORDS = new Set([
  'if','else','for','while','do','return','break','continue','discard','struct',
  'const','in','out','inout','uniform','attribute','varying','precision',
  'highp','mediump','lowp','void','true','false',
]);

const GLSL_TYPES = new Set([
  'float','int','uint','bool',
  'vec2','vec3','vec4','ivec2','ivec3','ivec4','uvec2','uvec3','uvec4',
  'bvec2','bvec3','bvec4',
  'mat2','mat3','mat4',
  'mat2x2','mat2x3','mat2x4','mat3x2','mat3x3','mat3x4','mat4x2','mat4x3','mat4x4',
  'sampler2D','samplerCube','sampler3D',
]);

const GLSL_BUILTINS = new Set([
  'abs','acos','acosh','asin','asinh','atan','atanh',
  'ceil','clamp','cos','cosh','cross',
  'degrees','determinant','distance','dot','equal','exp','exp2',
  'faceforward','floor','fract',
  'greaterThan','greaterThanEqual',
  'inversesqrt','isinf','isnan',
  'length','lessThan','lessThanEqual','log','log2',
  'matrixCompMult','max','min','mix','mod','modf',
  'normalize','not','notEqual','outerProduct',
  'pow','radians','reflect','refract','round','roundEven',
  'sign','sin','sinh','smoothstep','sqrt','step',
  'tan','tanh','transpose','trunc',
  'texture','texture2D','textureCube',
]);

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Tokenise GLSL source and return an HTML string with syntax-highlight spans.
 * Appends a trailing newline so the last line stays visible when cursor is there.
 */
export function highlightGLSL(code: string): string {
  const out: string[] = [];
  let i = 0;

  while (i < code.length) {
    const c = code[i];

    // ── Line comment  //...
    if (c === '/' && code[i + 1] === '/') {
      const end = code.indexOf('\n', i);
      const text = end === -1 ? code.slice(i) : code.slice(i, end);
      out.push(`<span class="hl-comment">${escHtml(text)}</span>`);
      i += text.length;
      continue;
    }

    // ── Block comment  /* ... */
    if (c === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2);
      const text = end === -1 ? code.slice(i) : code.slice(i, end + 2);
      out.push(`<span class="hl-comment">${escHtml(text)}</span>`);
      i += text.length;
      continue;
    }

    // ── Preprocessor directive  #define / #ifdef / etc.
    if (c === '#') {
      const end = code.indexOf('\n', i);
      const text = end === -1 ? code.slice(i) : code.slice(i, end);
      out.push(`<span class="hl-preprocessor">${escHtml(text)}</span>`);
      i += text.length;
      continue;
    }

    // ── Numeric literal  (guard: not preceded by an ident char)
    const prevIsIdent = i > 0 && /[\w]/.test(code[i - 1]);
    if (!prevIsIdent && (c >= '0' && c <= '9' || (c === '.' && code[i + 1] >= '0' && code[i + 1] <= '9'))) {
      const m = code.slice(i).match(/^(\d+\.\d*|\.\d+|\d+)[fFuU]?/);
      if (m) {
        out.push(`<span class="hl-number">${escHtml(m[0])}</span>`);
        i += m[0].length;
        continue;
      }
    }

    // ── Identifier → keyword | type | builtin | plain name
    if (/[a-zA-Z_]/.test(c)) {
      const m = code.slice(i).match(/^[a-zA-Z_]\w*/);
      if (m) {
        const word = m[0];
        let cls = '';
        if (GLSL_KEYWORDS.has(word))  cls = 'hl-keyword';
        else if (GLSL_TYPES.has(word))    cls = 'hl-type';
        else if (GLSL_BUILTINS.has(word)) cls = 'hl-builtin';
        out.push(cls ? `<span class="${cls}">${escHtml(word)}</span>` : escHtml(word));
        i += word.length;
        continue;
      }
    }

    // ── Everything else (operators, punctuation, whitespace, newlines)
    out.push(escHtml(c));
    i++;
  }

  out.push('\n');   // sentinel: keeps last line visible when cursor is at end
  return out.join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// Uniform location cache
// ─────────────────────────────────────────────────────────────────────────────

interface UniformLocs {
  iResolution: WebGLUniformLocation | null;
  iTime:       WebGLUniformLocation | null;
  iMouse:      WebGLUniformLocation | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// CodeView
// ─────────────────────────────────────────────────────────────────────────────

// ── localStorage helpers ──────────────────────────────────────────────────────

const LS_KEY = (geo: ShaderGeometry) => `glsl-shader-${geo}`

function lsLoad(geo: ShaderGeometry): string | null {
  try { return localStorage.getItem(LS_KEY(geo)) } catch { return null }
}

function lsSave(geo: ShaderGeometry, src: string): void {
  try { localStorage.setItem(LS_KEY(geo), src) } catch { /* quota exceeded, ignore */ }
}

function lsClear(geo: ShaderGeometry): void {
  try { localStorage.removeItem(LS_KEY(geo)) } catch { /* ignore */ }
}

// ─────────────────────────────────────────────────────────────────────────────

export class CodeView {
  private canvas:          HTMLCanvasElement;
  private textarea:        HTMLTextAreaElement;
  private highlight:       HTMLPreElement;
  private lineNumbers:     HTMLDivElement;
  private errorOverlay:    HTMLDivElement;
  private editorWrap:      HTMLDivElement;
  private gl:              WebGL2RenderingContext;
  private vao:             WebGLVertexArrayObject;
  private program:         WebGLProgram | null = null;
  private locs:            UniformLocs = { iResolution: null, iTime: null, iMouse: null };
  private startTime = Date.now();
  /** [mouseX, mouseY, buttonDown, 0] — Shadertoy iMouse convention */
  private mouse = new Float32Array(4);
  private animId = 0;
  private currentGeometry: ShaderGeometry = 'sphere';

  constructor(container: HTMLElement, initialGeometry: ShaderGeometry = 'sphere') {
    this.currentGeometry = initialGeometry;

    // ── Build DOM ────────────────────────────────────────────────────────
    container.innerHTML = /* html */ `
      <div id="glsl-canvas-wrap">
        <canvas id="glsl-canvas"></canvas>
        <div id="error-overlay"></div>
      </div>
      <div id="glsl-resize-handle" title="Drag to resize"></div>
      <div id="glsl-editor-wrap">
        <div id="glsl-toolbar">
          <button id="glsl-run-btn">▶ Run</button>
          <button id="glsl-reset-btn" title="Discard edits and restore the default shader">↺ Reset</button>
          <span class="glsl-toolbar-label">GLSL · fragment shader</span>
          <span id="glsl-saved-indicator" class="glsl-saved-indicator" aria-live="polite"></span>
        </div>
        <div id="glsl-editor-container">
          <div id="glsl-line-numbers" aria-hidden="true"></div>
          <pre  id="glsl-highlight" aria-hidden="true"></pre>
          <textarea id="glsl-editor"
            spellcheck="false" autocomplete="off"
            autocorrect="off" autocapitalize="off"
            wrap="off"></textarea>
        </div>
      </div>
    `;

    this.canvas       = container.querySelector('#glsl-canvas')!      as HTMLCanvasElement;
    this.textarea     = container.querySelector('#glsl-editor')!      as HTMLTextAreaElement;
    this.highlight    = container.querySelector('#glsl-highlight')!    as HTMLPreElement;
    this.lineNumbers  = container.querySelector('#glsl-line-numbers')! as HTMLDivElement;
    this.errorOverlay = container.querySelector('#error-overlay')!     as HTMLDivElement;
    this.editorWrap   = container.querySelector('#glsl-editor-wrap')!  as HTMLDivElement;

    // ── Resize handle ────────────────────────────────────────────────────
    const handle = container.querySelector('#glsl-resize-handle')! as HTMLDivElement;
    let resizing = false;
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      resizing = true;
      handle.classList.add('dragging');
    });
    window.addEventListener('mousemove', (e) => {
      if (!resizing) return;
      const rect = container.getBoundingClientRect();
      const newW = Math.round(Math.max(160, Math.min(rect.width - 160, rect.right - e.clientX)));
      this.editorWrap.style.width = `${newW}px`;
    });
    window.addEventListener('mouseup', () => {
      if (!resizing) return;
      resizing = false;
      handle.classList.remove('dragging');
    });

    // ── Syntax highlighting + localStorage ──────────────────────────────
    const savedShader   = lsLoad(initialGeometry);
    const initialShader = savedShader ?? shaderForGeometry(initialGeometry);
    this.textarea.value = initialShader;
    this.syncHighlight();

    const savedIndicator = container.querySelector('#glsl-saved-indicator')! as HTMLSpanElement;
    let saveTimer = 0;
    const flashSaved = () => {
      savedIndicator.textContent = '● saved';
      clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => { savedIndicator.textContent = '' }, 1800);
    };

    let compileTimer = 0;
    this.textarea.addEventListener('input', () => {
      this.syncHighlight();
      lsSave(this.currentGeometry, this.textarea.value);
      flashSaved();
      // Recompile ~400 ms after the user stops typing
      clearTimeout(compileTimer);
      compileTimer = window.setTimeout(() => this.compile(this.textarea.value), 400);
    });

    // Keep pre + line numbers scrolled in sync with textarea
    this.textarea.addEventListener('scroll', () => {
      this.highlight.scrollTop   = this.textarea.scrollTop;
      this.highlight.scrollLeft  = this.textarea.scrollLeft;
      this.lineNumbers.scrollTop = this.textarea.scrollTop;
    });

    // ── WebGL2 ───────────────────────────────────────────────────────────
    const gl = this.canvas.getContext('webgl2', { antialias: false });
    if (!gl) {
      this.showError('WebGL2 is not available in this browser.');
      throw new Error('WebGL2 not available');
    }
    this.gl = gl;

    // Empty VAO — we draw without attributes, using only gl_VertexID.
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);

    // ── Mouse — delta-based orbit (no absolute-position jump, correct Y) ──
    // accX / accY are normalised angles [0,1] fed as iMouse.xy / iResolution.xy
    // Initial accY = 0.8/π so the shader's (-m.y*π + 0.8) starts at 0 → identity rotation.
    let dragging = false;
    let lastDragX = 0, lastDragY = 0;
    let accX = 0.0;
    let accY = 0.8 / Math.PI;   // ~0.255 → rotation identity on first drag

    const syncMouse = () => {
      this.mouse[0] = accX * this.canvas.width;
      this.mouse[1] = accY * this.canvas.height;
    };
    syncMouse();

    this.canvas.addEventListener('mousedown', (e) => {
      dragging = true;
      lastDragX = e.clientX;
      lastDragY = e.clientY;
      this.mouse[2] = 1;
      // Do NOT update mouse[0/1] here — prevents position jump on click
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const r = this.canvas.getBoundingClientRect();
      const dx =  (e.clientX - lastDragX) / r.width;
      const dy =  (e.clientY - lastDragY) / r.height;  // positive = drag down
      lastDragX = e.clientX;
      lastDragY = e.clientY;
      accX = ((accX + dx) % 1.0 + 1.0) % 1.0;        // wrap horizontal
      accY = Math.max(0.01, Math.min(0.99, accY + dy)); // drag down → lower camera (looks up)
      syncMouse();
    });
    window.addEventListener('mouseup', () => {
      dragging = false;
      this.mouse[2] = 0;
    });

    // ── Run button ───────────────────────────────────────────────────────
    container.querySelector('#glsl-run-btn')!.addEventListener('click', () => {
      this.compile(this.textarea.value);
    });

    // ── Reset button — restore default, clear localStorage ───────────────
    container.querySelector('#glsl-reset-btn')!.addEventListener('click', () => {
      if (!confirm('Discard your edits and restore the default shader?')) return;
      lsClear(this.currentGeometry);
      const def = shaderForGeometry(this.currentGeometry);
      this.textarea.value = def;
      this.syncHighlight();
      this.compile(def);
      savedIndicator.textContent = '';
    });

    // ── Keyboard shortcut: Ctrl/Cmd+Enter compiles ───────────────────────
    this.textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.compile(this.textarea.value);
      }
    });

    // ── Initial compile + render loop ────────────────────────────────────
    this.compile(initialShader);
    this.startLoop();
  }

  // ── Syntax highlight sync ──────────────────────────────────────────────

  private syncHighlight(): void {
    this.highlight.innerHTML = highlightGLSL(this.textarea.value);
    this.syncLineNumbers();
  }

  private syncLineNumbers(): void {
    const lineCount = (this.textarea.value.match(/\n/g) ?? []).length + 1;
    // Only rebuild DOM when the count changes (cheap fast-path on normal edits)
    if (this.lineNumbers.childElementCount === lineCount) return;
    let html = '';
    for (let i = 1; i <= lineCount; i++) html += `<div>${i}</div>`;
    this.lineNumbers.innerHTML = html;
  }

  // ── Shader compilation ─────────────────────────────────────────────────

  private compile(userCode: string): boolean {
    const gl = this.gl;
    const fragSrc = FRAG_PREFIX + userCode + FRAG_SUFFIX;

    const vert = this.makeShader(gl.VERTEX_SHADER, VERT_SRC);
    if (!vert) return false;

    const frag = this.makeShader(gl.FRAGMENT_SHADER, fragSrc);
    if (!frag) { gl.deleteShader(vert); return false; }

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.linkProgram(prog);
    gl.deleteShader(vert);
    gl.deleteShader(frag);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      this.showError(gl.getProgramInfoLog(prog) ?? 'Link error');
      gl.deleteProgram(prog);
      return false;
    }

    if (this.program) gl.deleteProgram(this.program);
    this.program = prog;

    // Cache uniform locations — only lookup once per compile.
    this.locs = {
      iResolution: gl.getUniformLocation(prog, 'iResolution'),
      iTime:       gl.getUniformLocation(prog, 'iTime'),
      iMouse:      gl.getUniformLocation(prog, 'iMouse'),
    };

    this.hideError();
    return true;
  }

  private makeShader(type: number, src: string): WebGLShader | null {
    const gl = this.gl;
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      this.showError(this.adjustErrorLines(gl.getShaderInfoLog(sh) ?? 'Compile error'));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  // ── Error display ──────────────────────────────────────────────────────

  /** Offset GLSL error line numbers by the number of lines FRAG_PREFIX adds. */
  private adjustErrorLines(msg: string): string {
    const offset = FRAG_PREFIX.split('\n').length - 1;
    return msg.replace(/:(\d+):/g, (_, ln) => `:${Math.max(1, parseInt(ln) - offset)}:`);
  }

  private showError(msg: string) {
    this.errorOverlay.textContent = msg;
    this.errorOverlay.style.display = 'block';
  }

  private hideError() {
    this.errorOverlay.style.display = 'none';
  }

  // ── Render loop ────────────────────────────────────────────────────────

  private startLoop() {
    const tick = () => {
      this.render();
      this.animId = requestAnimationFrame(tick);
    };
    this.animId = requestAnimationFrame(tick);
  }

  private render() {
    if (!this.program) return;
    const gl = this.gl;
    const canvas = this.canvas;

    // Keep canvas pixels matched to CSS display size (handles window resize & HiDPI).
    const dpr = window.devicePixelRatio ?? 1;
    const w = Math.floor(canvas.clientWidth  * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width  = w;
      canvas.height = h;
    }

    gl.viewport(0, 0, w, h);
    gl.useProgram(this.program);

    const t = (Date.now() - this.startTime) / 1000;
    gl.uniform2f(this.locs.iResolution, w, h);
    gl.uniform1f(this.locs.iTime, t);
    gl.uniform4fv(this.locs.iMouse, this.mouse);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /**
   * Switch the editor to the given geometry's shader.
   * Restores that geometry's localStorage save if one exists,
   * otherwise falls back to the built-in default.
   */
  setGeometry(mode: ShaderGeometry): void {
    if (mode === this.currentGeometry) return;
    this.currentGeometry = mode;
    const shader = lsLoad(mode) ?? shaderForGeometry(mode);
    this.textarea.value = shader;
    this.syncHighlight();
    this.compile(shader);
  }

  /** Stop the animation loop and release GPU resources. */
  destroy() {
    cancelAnimationFrame(this.animId);
    const gl = this.gl;
    if (this.program) gl.deleteProgram(this.program);
    gl.deleteVertexArray(this.vao);
  }
}
