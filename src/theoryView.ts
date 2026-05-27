/**
 * Theory tab — textbook-style walkthrough of ray-casting + intersection math.
 *
 * TheoryScene  : a lightweight read-only Three.js scene (orbit-only, static ray).
 * TheoryView   : orchestrates 4 scenes + KaTeX equation rendering.
 */

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import katex from 'katex'
import 'katex/dist/katex.min.css'

import { buildShapeGeometry, setDefaultRotation, type GeometryMode } from './scene3d'
import { CYLINDER_HEIGHT } from './cylinderMath'
import { sphereCoeffs } from './sphereMath'
import { cylinderHits } from './cylinderMath'
import { quarticCoeffs, findRoots } from './torusMath'
import type { Vec3 } from './torusMath'

// ── Shared scene constants ──────────────────────────────────────────────────

const EYE_Z   = 7.0
const NEAR_Z  = EYE_Z - 1.5

function addSceneLights(scene: THREE.Scene) {
  scene.add(new THREE.AmbientLight(0x1a1a30, 4))
  const key = new THREE.DirectionalLight(0x7ec8e3, 4)
  key.position.set(5, 10, 5)
  scene.add(key)
  const rim = new THREE.DirectionalLight(0xff6b6b, 2)
  rim.position.set(-4, -2, -6)
  scene.add(rim)
  const fill = new THREE.PointLight(0x4ecca3, 1, 20)
  fill.position.set(0, 3, 0)
  scene.add(fill)
}

function addGrid(scene: THREE.Scene) {
  const grid = new THREE.GridHelper(20, 20, 0x1e1e30, 0x161625)
  grid.position.y = -3.5
  scene.add(grid)
}

// ── Hit markers (sphere + ring) ─────────────────────────────────────────────

function addHitMarker(scene: THREE.Scene, pos: THREE.Vector3): void {
  const geo = new THREE.SphereGeometry(0.13, 24, 24)
  const mat = new THREE.MeshStandardMaterial({ color: 0x4ecca3, emissive: 0x1a7a50, roughness: 0.05, metalness: 0.5 })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.copy(pos)
  scene.add(mesh)

  const rGeo = new THREE.RingGeometry(0.17, 0.25, 32)
  const rMat = new THREE.MeshBasicMaterial({ color: 0x4ecca3, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })
  const ring = new THREE.Mesh(rGeo, rMat)
  ring.position.copy(pos)
  ring.userData.isRing = true
  scene.add(ring)
}

// ── TheoryScene ─────────────────────────────────────────────────────────────

interface SceneConfig {
  /** Three.js canvas element */
  canvas: HTMLCanvasElement
  /** Camera start position */
  camPos: [number, number, number]
  /** Called once to populate the scene — receives the bare THREE.Scene */
  populate: (scene: THREE.Scene) => void
}

class TheoryScene {
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private controls: OrbitControls
  private rings: THREE.Mesh[] = []

  constructor(cfg: SceneConfig) {
    const { canvas, camPos, populate } = cfg

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearColor(0x080812)

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200)
    this.camera.position.set(...camPos)
    this.camera.lookAt(0, 0, 0)

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.FogExp2(0x080812, 0.025)

    addSceneLights(this.scene)
    addGrid(this.scene)
    populate(this.scene)

    // Collect billboard rings so we can face them to camera each frame
    this.scene.traverse(obj => {
      if (obj.userData.isRing) this.rings.push(obj as THREE.Mesh)
    })

    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.07
    this.controls.minDistance  = 2
    this.controls.maxDistance  = 40
    this.controls.enablePan    = false  // orbit-only (no pan gizmo confusion)

    this.handleResize()
    new ResizeObserver(() => this.handleResize()).observe(canvas.parentElement!)
    this.animate()
  }

  private handleResize() {
    const c = this.renderer.domElement
    const w = c.parentElement!.clientWidth
    const h = c.parentElement!.clientHeight
    if (w === 0 || h === 0) return
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private animate() {
    requestAnimationFrame(() => this.animate())
    // Skip rendering when canvas is hidden (saves GPU on inactive sections)
    if (!this.renderer.domElement.offsetParent) return
    this.controls.update()
    for (const ring of this.rings) ring.lookAt(this.camera.position)
    this.renderer.render(this.scene, this.camera)
  }
}

// ── Ray utilities ────────────────────────────────────────────────────────────

/** Build eye pos + ray direction from near-plane pick coords. */
function makeRay(rayX: number, rayY: number): { eye: THREE.Vector3; dir: THREE.Vector3; O: Vec3; D: Vec3 } {
  const eye    = new THREE.Vector3(0, 0, EYE_Z)
  const nearPt = new THREE.Vector3(rayX, rayY, NEAR_Z)
  const dir    = nearPt.clone().sub(eye).normalize()
  return { eye, dir, O: { x: eye.x, y: eye.y, z: eye.z }, D: { x: dir.x, y: dir.y, z: dir.z } }
}

/** Add eye sphere + near plane + frustum + ray arrow to scene. */
function addRaySetup(
  scene: THREE.Scene,
  eye: THREE.Vector3,
  dir: THREE.Vector3,
  hits: number[],
) {
  // Eye
  const eyeGeo = new THREE.SphereGeometry(0.14, 20, 20)
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffdd44, emissive: 0x886600, roughness: 0.2, metalness: 0.4 })
  const eyeMesh = new THREE.Mesh(eyeGeo, eyeMat)
  eyeMesh.position.copy(eye)
  scene.add(eyeMesh)

  // Near plane quad
  const planeGeo = new THREE.PlaneGeometry(5.2, 4.2)
  const planeMat = new THREE.MeshBasicMaterial({ color: 0x1a4070, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false })
  const planeMesh = new THREE.Mesh(planeGeo, planeMat)
  planeMesh.position.set(0, 0, NEAR_Z)
  scene.add(planeMesh)
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(planeGeo), new THREE.LineBasicMaterial({ color: 0x2a6aaa, opacity: 0.7, transparent: true }))
  planeMesh.add(edges)

  // Frustum corner lines
  const hw = 2.6, hh = 2.1
  const corners: [number, number][] = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]
  for (const [cx, cy] of corners) {
    const pts = new Float32Array([eye.x, eye.y, eye.z, cx, cy, NEAR_Z])
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3))
    scene.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x336699, opacity: 0.3, transparent: true })))
  }

  // Ray colour: green if hit, red if miss
  const rayColor = hits.length > 0 ? 0x4ecca3 : 0xff6b6b
  const endT = hits.length > 0 ? hits[hits.length - 1] + 1.5 : 14
  const far = eye.clone().addScaledVector(dir, endT)
  const rpts = new Float32Array([eye.x, eye.y, eye.z, far.x, far.y, far.z])
  const rGeo = new THREE.BufferGeometry()
  rGeo.setAttribute('position', new THREE.BufferAttribute(rpts, 3))
  scene.add(new THREE.Line(rGeo, new THREE.LineBasicMaterial({ color: rayColor })))
  scene.add(new THREE.ArrowHelper(dir, eye, 1.4, rayColor, 0.28, 0.13))

  // Hit markers
  for (const t of hits) {
    if (t <= 0) continue
    addHitMarker(scene, eye.clone().addScaledVector(dir, t))
  }
}

/** Add a shape mesh (with wireframe child) and set default rotation. */
function addShape(
  scene: THREE.Scene,
  mode: GeometryMode,
  majorR: number,
  minorR: number,
): void {
  const shapeMat = new THREE.MeshStandardMaterial({ color: 0x5bb8d4, emissive: 0x1a4a5a, roughness: 0.85, metalness: 0.0 })
  const mesh = new THREE.Mesh(buildShapeGeometry(mode, majorR, minorR, 'high'), shapeMat)
  setDefaultRotation(mesh, mode)
  mesh.castShadow = true
  scene.add(mesh)

  const wireMat = new THREE.MeshBasicMaterial({ color: 0x2a6a88, wireframe: true, opacity: 0.07, transparent: true })
  mesh.add(new THREE.Mesh(buildShapeGeometry(mode, majorR, minorR, 'low'), wireMat))
}

// ── Scene populators ────────────────────────────────────────────────────────

/**
 * The torus mesh has rotation.x = π/2 (ring lies flat in world XZ plane),
 * but quarticCoeffs / cylinderBarrelCoeffs expect the ray in LOCAL frame
 * (torus axis = Z, ring in XY plane).
 *
 * Inverse of Rx(π/2)  →  Rx(-π/2):
 *   local.x =  world.x
 *   local.y =  world.z
 *   local.z = -world.y
 */
function worldToLocalTorus(v: Vec3): Vec3 {
  return { x: v.x, y: v.z, z: -v.y }
}

/** Pixel highlight at (x, y) on the near plane — marks the "active pixel". */
function addPixelHighlight(scene: THREE.Scene, x = 0, y = 0) {
  const pixW = 0.28
  const pixGeo = new THREE.PlaneGeometry(pixW, pixW)
  const pixMat = new THREE.MeshBasicMaterial({ color: 0xffee44, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })
  const pix = new THREE.Mesh(pixGeo, pixMat)
  pix.position.set(x, y, NEAR_Z + 0.002)
  scene.add(pix)
  scene.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(pixGeo).applyMatrix4(new THREE.Matrix4().makeTranslation(x, y, NEAR_Z + 0.003)),
    new THREE.LineBasicMaterial({ color: 0xffdd00 }),
  ))
}

// ── Verified ray parameters ──────────────────────────────────────────────────
// Eye is at (0, 0, EYE_Z=7). Geometry centred at origin.
//
// Sphere R=1.3 / R=1.5:  offset < R/eye_dist ≈ 0.19–0.22 keeps discriminant > 0.
//   makeRay(0.2, 0.1) → hits at t≈5.8, t≈8.0   ✓
//
// Cylinder R=1.0 (axis=Y): only the z-component drives barrel; max lateral offset
//   keeping discriminant > 0 is small. makeRay(0.1, 0) → t≈6.1, t≈7.9   ✓
//
// Torus R=2, r=0.6: quarticCoeffs needs ray in LOCAL frame (axis=Z, ring in XY).
//   Centre ray world (0,0,-1) → local D=(0,-1,0), local O=(0,7,0) → 4 hits ✓

function populateSetupSphere(scene: THREE.Scene) {
  const R = 1.3
  addShape(scene, 'sphere', R, 0)
  const { eye, dir, O, D } = makeRay(0.2, 0.1)
  const hits = findRoots(sphereCoeffs(O, D, R), 0.001, 20).filter(t => t > 0)
  addRaySetup(scene, eye, dir, hits)
  addPixelHighlight(scene, 0.2, 0.1)
}

function populateSetupCylinder(scene: THREE.Scene) {
  const R = 1.0
  addShape(scene, 'cylinder', R, 0)
  const { eye, dir, O, D } = makeRay(0.1, 0)
  const hits = cylinderHits(O, D, R, CYLINDER_HEIGHT, 0.001, 20).filter(t => t > 0)
  addRaySetup(scene, eye, dir, hits)
  addPixelHighlight(scene, 0.1, 0)
}

function populateSetupTorus(scene: THREE.Scene) {
  const R = 2.0, r = 0.6
  addShape(scene, 'torus', R, r)
  const { eye, dir, O, D } = makeRay(0, 0)
  const hits = findRoots(quarticCoeffs(worldToLocalTorus(O), worldToLocalTorus(D), R, r), 0.001, 20).filter(t => t > 0)
  addRaySetup(scene, eye, dir, hits)
  addPixelHighlight(scene, 0, 0)
}

function populateSphere(scene: THREE.Scene) {
  const R = 1.5
  addShape(scene, 'sphere', R, 0)
  const { eye, dir, O, D } = makeRay(0.2, 0.1)
  const hits = findRoots(sphereCoeffs(O, D, R), 0.001, 20).filter(t => t > 0)
  addRaySetup(scene, eye, dir, hits)
}

function populateCylinder(scene: THREE.Scene) {
  const R = 1.0
  addShape(scene, 'cylinder', R, 0)
  const { eye, dir, O, D } = makeRay(0.1, 0)
  const hits = cylinderHits(O, D, R, CYLINDER_HEIGHT, 0.001, 20).filter(t => t > 0)
  addRaySetup(scene, eye, dir, hits)
}

function populateTorus(scene: THREE.Scene) {
  const R = 2.0, r = 0.6
  addShape(scene, 'torus', R, r)
  const { eye, dir, O, D } = makeRay(0, 0)
  const hits = findRoots(quarticCoeffs(worldToLocalTorus(O), worldToLocalTorus(D), R, r), 0.001, 20).filter(t => t > 0)
  addRaySetup(scene, eye, dir, hits)
}

// ── KaTeX helpers ────────────────────────────────────────────────────────────

function tex(src: string, display = false): string {
  return katex.renderToString(src, { throwOnError: false, displayMode: display })
}

// ── TheoryView ───────────────────────────────────────────────────────────────

export class TheoryView {
  constructor(root: HTMLElement) {
    this.buildEquations(root)
    this.buildScenes()
  }

  private buildEquations(root: HTMLElement) {
    this.eqSetup(root.querySelector<HTMLElement>('#theory-eq-setup')!)
    this.eqSphere(root.querySelector<HTMLElement>('#theory-eq-sphere')!)
    this.eqCylinder(root.querySelector<HTMLElement>('#theory-eq-cylinder')!)
    this.eqTorus(root.querySelector<HTMLElement>('#theory-eq-torus')!)
  }

  // ── Per-section equation builders ──────────────────────────────────────────

  private degreeTable(highlight: GeometryMode): string {
    const rows: [string, string, string][] = [
      ['Plane',    '1', 'linear'],
      ['Sphere',   '2', 'quadratic'],
      ['Cylinder', '2', 'quadratic'],
      ['Torus',    '4', 'quartic'],
    ]
    return `
      <table class="theory-table">
        <thead><tr><th>Surface</th><th>Implicit degree</th><th>Ray equation</th></tr></thead>
        <tbody>${rows.map(([s, d, r]) => `
          <tr class="${s.toLowerCase() === highlight ? 'hl' : ''}">
            <td>${s}</td><td>${d}</td><td>${r}</td>
          </tr>`).join('')}
        </tbody>
      </table>`
  }

  private eqSetup(el: HTMLElement) {
    el.innerHTML = `
      <p class="theory-intro">
        Ray tracing renders images by asking one question per pixel:
        <em>along the line of sight through this pixel, what surface is first visible?</em>
        The central abstraction is the <strong>ray</strong> — a half-line that turns
        a 3-D visibility problem into a 1-D search over a single parameter&nbsp;${tex('t')}.
      </p>

      <div class="theory-eq-block">
        <div class="theory-eq-label">The ray</div>
        <div class="theory-eq-body">${tex('\\mathbf{P}(t) = \\mathbf{O} + t\\,\\mathbf{D} \\qquad t \\ge 0', true)}</div>
        <div class="theory-eq-desc">
          ${tex('\\mathbf{O}')} — ray origin (camera eye) &ensp;
          ${tex('\\mathbf{D}')} — unit direction through the pixel &ensp;
          ${tex('t')} — distance along the ray.
          The restriction ${tex('t\\ge 0')} ensures the ray only travels <em>forward</em>.
        </div>
      </div>

      <p class="theory-intro">
        The same mathematical object serves every ray type in a renderer:
      </p>
      <table class="theory-table">
        <thead><tr><th>Ray type</th><th>Question it answers</th></tr></thead>
        <tbody>
          <tr><td>Primary</td><td>What surface is visible through this pixel?</td></tr>
          <tr><td>Shadow</td><td>Is a light visible from this surface point?</td></tr>
          <tr><td>Reflection</td><td>What is seen in the mirror direction?</td></tr>
          <tr><td>Refraction</td><td>What passes through a transparent material?</td></tr>
          <tr><td>Diffuse</td><td>What indirect light arrives from surrounding directions?</td></tr>
        </tbody>
      </table>

      <div class="theory-subheading">Why rays are traced backwards</div>
      <p class="theory-intro">
        Light physically travels from emitters to the camera, but a forward simulation
        wastes almost all work — most emitted light never reaches a pixel.
        Ray tracing therefore starts at the camera and traces rays <em>outward</em> into
        the scene, evaluating only paths that actually contribute to the image.
      </p>

      <div class="theory-subheading">Camera and primary rays</div>
      <p class="theory-intro">
        A pinhole camera has an eye point ${tex('\\mathbf{E}')} and an image plane.
        For pixel ${tex('(i,j)')} with centre ${tex('\\mathbf{Q}_{ij}')} on the plane:
      </p>
      <div class="theory-eq-block">
        <div class="theory-eq-label">Primary ray for pixel (i, j)</div>
        <div class="theory-eq-body">${tex('\\mathbf{O} = \\mathbf{E}, \\qquad \\mathbf{D}_{ij} = \\mathrm{normalize}(\\mathbf{Q}_{ij} - \\mathbf{E})', true)}</div>
        <div class="theory-eq-desc">
          The scene renders the yellow pixel in the 3D scene — the ray travels from eye
          through that pixel until it hits the first surface.
        </div>
      </div>

      <div class="theory-subheading">The visibility problem</div>
      <div class="theory-eq-block">
        <div class="theory-eq-label">Nearest intersection</div>
        <div class="theory-eq-body">${tex('t_{\\mathrm{hit}} = \\min\\bigl\\{\\,t \\mid t > 0 \\text{ and } \\mathbf{P}(t) \\text{ on a surface}\\,\\bigr\\}', true)}</div>
        <div class="theory-eq-desc">
          A hit record stores ${tex('(t,\\;\\mathbf{P}(t),\\;\\mathbf{N},\\;\\text{material})')} where
          ${tex('\\mathbf{N}')} is the surface normal — the bridge to shading.
        </div>
      </div>

      <div class="theory-subheading">Implicit surfaces and root finding</div>
      <p class="theory-intro">
        Many surfaces are described implicitly: a point ${tex('\\mathbf{X}')} lies on
        the surface when ${tex('F(\\mathbf{X}) = 0')}.
        Substituting the ray into ${tex('F')} yields a <strong>single-variable equation</strong>:
      </p>
      <div class="theory-eq-block">
        <div class="theory-eq-label">The algebraic reduction</div>
        <div class="theory-eq-body">${tex('F(\\mathbf{P}(t)) = 0 \\quad\\Longrightarrow\\quad f(t) = 0', true)}</div>
        <div class="theory-eq-desc">
          Since ${tex('\\mathbf{P}(t)')} is linear in ${tex('t')}, the degree of ${tex('f')}
          equals the degree of ${tex('F')}.
          A <strong>sphere</strong> (degree 2) gives a quadratic; a <strong>torus</strong>
          (degree 4) gives a quartic.
          The roots of ${tex('f(t)')} are the candidate intersection parameters —
          pick the smallest positive root for the visible hit.
        </div>
      </div>

      <div class="theory-subheading">The conceptual stack</div>
      <table class="theory-table">
        <thead><tr><th>Layer</th><th>Core idea</th></tr></thead>
        <tbody>
          <tr><td>Camera</td><td>Generate primary rays from pixels</td></tr>
          <tr><td>Intersection</td><td>Find nearest positive root along a ray</td></tr>
          <tr><td>Visibility</td><td>Shadow rays test whether light is blocked</td></tr>
          <tr><td>Shading</td><td>Evaluate material response at the hit point</td></tr>
          <tr><td>Recursion</td><td>Spawn reflection and refraction rays</td></tr>
          <tr><td>Integration</td><td>Sample many paths to approximate light transport</td></tr>
          <tr><td>Acceleration</td><td>Reject groups of objects early with bounding volumes</td></tr>
        </tbody>
      </table>
    `
  }

  private eqSphere(el: HTMLElement) {
    el.innerHTML = `
      <p class="theory-intro">
        A sphere with centre ${tex('\\mathbf{C}')} and radius ${tex('R')} is the simplest
        quadric. Its implicit equation is <strong>degree 2</strong>, so substituting the
        ray gives a quadratic in ${tex('t')} — solved in closed form by the familiar
        discriminant formula.
      </p>

      <div class="theory-eq-block">
        <div class="theory-eq-label">Implicit surface (degree 2)</div>
        <div class="theory-eq-body">${tex('F(\\mathbf{X}) = |\\mathbf{X} - \\mathbf{C}|^2 - R^2 = 0', true)}</div>
      </div>

      <div class="theory-subheading">Derivation</div>
      <p class="theory-intro">
        Let ${tex('\\mathbf{L} = \\mathbf{O} - \\mathbf{C}')} (ray origin relative to the
        sphere centre). Substitute ${tex('\\mathbf{X} = \\mathbf{O} + t\\mathbf{D}')},
        expand the dot product, and collect powers of ${tex('t')}:
      </p>
      <div class="theory-eq-block">
        <div class="theory-eq-label">Expand |L + tD|² − R² = 0</div>
        <div class="theory-eq-body">${tex('(\\mathbf{D}\\cdot\\mathbf{D})\\,t^2 + 2(\\mathbf{L}\\cdot\\mathbf{D})\\,t + (\\mathbf{L}\\cdot\\mathbf{L} - R^2) = 0', true)}</div>
      </div>
      <div class="theory-eq-block">
        <div class="theory-eq-label">Quadratic coefficients</div>
        <div class="theory-eq-body">${tex('a = \\mathbf{D}\\cdot\\mathbf{D} \\qquad b = 2(\\mathbf{L}\\cdot\\mathbf{D}) \\qquad c = \\mathbf{L}\\cdot\\mathbf{L} - R^2', true)}</div>
      </div>
      <div class="theory-eq-block">
        <div class="theory-eq-label">Discriminant and roots</div>
        <div class="theory-eq-body">${tex('\\Delta = b^2 - 4ac', true)}</div>
        <div class="theory-eq-body">${tex('t = \\dfrac{-b \\pm \\sqrt{\\Delta}}{2a}', true)}</div>
      </div>

      <table class="theory-table">
        <thead><tr><th>Discriminant</th><th>Geometry</th></tr></thead>
        <tbody>
          <tr><td>${tex('\\Delta < 0')}</td><td>miss — ray does not reach the sphere</td></tr>
          <tr><td>${tex('\\Delta = 0')}</td><td>tangent hit — one grazing intersection</td></tr>
          <tr><td>${tex('\\Delta > 0')}</td><td>two hits — ray enters then exits</td></tr>
        </tbody>
      </table>

      <div class="theory-subheading">Surface normal</div>
      <p class="theory-intro">
        At a hit point ${tex('\\mathbf{P}')}, the outward normal is the gradient of
        ${tex('F')} normalised. For a sphere:
      </p>
      <div class="theory-eq-block">
        <div class="theory-eq-label">Outward unit normal</div>
        <div class="theory-eq-body">${tex('\\nabla F(\\mathbf{X}) = 2(\\mathbf{X} - \\mathbf{C})', true)}</div>
        <div class="theory-eq-body">${tex('\\mathbf{N} = \\mathrm{normalize}(\\mathbf{P}_{\\mathrm{hit}} - \\mathbf{C})', true)}</div>
        <div class="theory-eq-desc">The factor of 2 cancels during normalisation.</div>
      </div>

      <div class="theory-subheading">Polynomial degree and geometry</div>
      ${this.degreeTable('sphere')}
    `
  }

  private eqCylinder(el: HTMLElement) {
    el.innerHTML = `
      <p class="theory-intro">
        A finite cylinder (axis&nbsp;=&nbsp;${tex('Y')}, radius&nbsp;${tex('R')},
        half-height&nbsp;${tex('h/2')}) has two intersection cases: the curved
        <strong>barrel</strong> (algebraic, degree 2) and two flat <strong>end caps</strong>
        (trivial disk tests). Both are needed to get the correct hit count.
      </p>

      <div class="theory-subheading">Barrel intersection</div>
      <p class="theory-intro">
        The infinite barrel ignores the ${tex('y')} component — it is the set of points
        at radius ${tex('R')} from the ${tex('Y')} axis:
      </p>
      <div class="theory-eq-block">
        <div class="theory-eq-label">Barrel implicit (degree 2, ignores y)</div>
        <div class="theory-eq-body">${tex('x^2 + z^2 = R^2', true)}</div>
      </div>
      <p class="theory-intro">
        Substitute ${tex('x(t) = O_x + tD_x')}, ${tex('z(t) = O_z + tD_z')}
        and collect:
      </p>
      <div class="theory-eq-block">
        <div class="theory-eq-label">Barrel quadratic in t</div>
        <div class="theory-eq-body">${tex('(D_x^2+D_z^2)\\,t^2 + 2(O_xD_x+O_zD_z)\\,t + (O_x^2+O_z^2-R^2) = 0', true)}</div>
      </div>
      <div class="theory-eq-block">
        <div class="theory-eq-label">Quadratic coefficients</div>
        <div class="theory-eq-body">${tex('a = D_x^2+D_z^2 \\qquad b = 2(O_xD_x+O_zD_z) \\qquad c = O_x^2+O_z^2-R^2', true)}</div>
        <div class="theory-eq-desc">Accept barrel roots only where ${tex('|y(t)| \\le h/2')}.</div>
      </div>

      <div class="theory-subheading">End cap intersection</div>
      <p class="theory-intro">
        Each cap is a disk lying in the plane ${tex('y = \\pm h/2')}. The ray hits
        that plane at:
      </p>
      <div class="theory-eq-block">
        <div class="theory-eq-label">Cap parameter</div>
        <div class="theory-eq-body">${tex('t_{\\mathrm{cap}} = \\dfrac{\\pm h/2\\; -\\; O_y}{D_y}', true)}</div>
        <div class="theory-eq-desc">
          Accept if ${tex('x(t)^2 + z(t)^2 \\le R^2')}.
          If ${tex('D_y = 0')} the ray is parallel to both caps — no cap intersection.
        </div>
      </div>

      <div class="theory-subheading">Surface normals</div>
      <div class="theory-eq-block">
        <div class="theory-eq-label">Barrel — radial, ignores y</div>
        <div class="theory-eq-body">${tex('\\mathbf{N}_{\\mathrm{barrel}} = \\mathrm{normalize}\\bigl(P_x,\\;0,\\;P_z\\bigr)', true)}</div>
      </div>
      <div class="theory-eq-block">
        <div class="theory-eq-label">Caps — axial</div>
        <div class="theory-eq-body">${tex('\\mathbf{N}_{\\mathrm{cap}} = (0,\\;{\\pm}1,\\;0)', true)}</div>
      </div>
      <p class="theory-intro">
        Total: at most <strong>4 intersections</strong> (2 barrel + 2 caps).
      </p>

      <div class="theory-subheading">Polynomial degree and geometry</div>
      ${this.degreeTable('cylinder')}
    `
  }

  private eqTorus(el: HTMLElement) {
    el.innerHTML = `
      <p class="theory-intro">
        A torus with major radius ${tex('R')} (centre-to-tube-centre) and minor
        radius ${tex('r')} (tube cross-section) is a <strong>degree-4</strong>
        algebraic surface. Because the implicit equation squares a quadratic expression,
        substituting the ray yields a quartic — a ray can pierce the torus at up to
        <strong>four points</strong>.
      </p>

      <div class="theory-eq-block">
        <div class="theory-eq-label">Implicit surface (degree 4)</div>
        <div class="theory-eq-body">${tex('F(x,y,z) = \\bigl(x^2+y^2+z^2+R^2-r^2\\bigr)^2 - 4R^2(x^2+y^2) = 0', true)}</div>
      </div>

      <div class="theory-subheading">Deriving the quartic</div>
      <p class="theory-intro">
        Define auxiliary scalar polynomials in ${tex('t')} that collect the ray
        components cleanly:
      </p>
      <div class="theory-eq-block">
        <div class="theory-eq-label">Scalar substitutions</div>
        <div class="theory-eq-body">${tex(`
          \\begin{aligned}
            \\alpha &= \\mathbf{D}\\cdot\\mathbf{D}, &
            \\beta  &= 2(\\mathbf{O}\\cdot\\mathbf{D}), &
            \\gamma &= \\mathbf{O}\\cdot\\mathbf{O} + R^2 - r^2 \\\\[4pt]
            \\delta &= D_x^2+D_y^2, &
            \\varepsilon &= 2(O_xD_x+O_yD_y), &
            \\zeta &= O_x^2+O_y^2
          \\end{aligned}
        `, true)}</div>
        <div class="theory-eq-desc">
          Then: &ensp; ${tex('x(t)^2+y(t)^2+z(t)^2 + R^2-r^2 \\;=\\; \\alpha t^2+\\beta t+\\gamma')}
          <br>
          And: &emsp; ${tex('x(t)^2+y(t)^2 \\;=\\; \\delta t^2+\\varepsilon t+\\zeta')}
        </div>
      </div>
      <div class="theory-eq-block">
        <div class="theory-eq-label">The torus equation in terms of those polynomials</div>
        <div class="theory-eq-body">${tex('(\\alpha t^2+\\beta t+\\gamma)^2 - 4R^2(\\delta t^2+\\varepsilon t+\\zeta) = 0', true)}</div>
      </div>

      <div class="theory-subheading">Quartic coefficients</div>
      <div class="theory-eq-block">
        <div class="theory-eq-label">Expand and collect — quartic in t</div>
        <div class="theory-eq-body">${tex('At^4 + Bt^3 + Ct^2 + Dt + E = 0', true)}</div>
        <div class="theory-eq-body">${tex(`
          \\begin{aligned}
            A &= \\alpha^2 \\\\
            B &= 2\\alpha\\beta \\\\
            C &= \\beta^2 + 2\\alpha\\gamma - 4R^2\\delta \\\\
            D &= 2\\beta\\gamma - 4R^2\\varepsilon \\\\
            E &= \\gamma^2 - 4R^2\\zeta
          \\end{aligned}
        `, true)}</div>
      </div>

      <div class="theory-subheading">Surface normal</div>
      <p class="theory-intro">
        The normal is the gradient of ${tex('F')} evaluated at the hit point and normalised.
        Since ${tex('F = (|\\mathbf{P}|^2+R^2-r^2)^2 - 4R^2(P_x^2+P_y^2)')},
        differentiating gives:
      </p>
      <div class="theory-eq-block">
        <div class="theory-eq-label">Gradient of the torus implicit</div>
        <div class="theory-eq-body">${tex(`
          \\nabla F(\\mathbf{P}) = 4\\bigl(|\\mathbf{P}|^2+R^2-r^2\\bigr)
          \\begin{pmatrix}P_x\\\\P_y\\\\P_z\\end{pmatrix}
          -\\; 8R^2\\begin{pmatrix}P_x\\\\P_y\\\\0\\end{pmatrix}
        `, true)}</div>
        <div class="theory-eq-body">${tex('\\mathbf{N} = \\mathrm{normalize}\\bigl(\\nabla F(\\mathbf{P}_{\\mathrm{hit}})\\bigr)', true)}</div>
      </div>

      <div class="theory-subheading">Root finding</div>
      <p class="theory-intro">
        No compact closed-form solution is practical for a general quartic.
        Roots are found numerically: scan ${tex('[t_{\\min}, t_{\\max}]')} for sign changes
        in ${tex('f(t)')}, then refine each bracket with
        Newton–Raphson + bisection fallback to tolerance ${tex('< 10^{-10}')}.
        Up to four real roots may be found.
      </p>

      <div class="theory-subheading">Polynomial degree and geometry</div>
      ${this.degreeTable('torus')}
    `
  }

  private buildScenes() {
    // Three setup scenes — one per geometry so § 1 always matches the selector
    new TheoryScene({ canvas: document.getElementById('theory-canvas-setup-sphere')   as HTMLCanvasElement, camPos: [6, 4, 10], populate: populateSetupSphere })
    new TheoryScene({ canvas: document.getElementById('theory-canvas-setup-cylinder') as HTMLCanvasElement, camPos: [6, 4, 10], populate: populateSetupCylinder })
    new TheoryScene({ canvas: document.getElementById('theory-canvas-setup-torus')    as HTMLCanvasElement, camPos: [6, 4, 10], populate: populateSetupTorus })

    // Per-geometry deep-dive scenes
    new TheoryScene({ canvas: document.getElementById('theory-canvas-sphere')   as HTMLCanvasElement, camPos: [5, 3, 8], populate: populateSphere })
    new TheoryScene({ canvas: document.getElementById('theory-canvas-cylinder') as HTMLCanvasElement, camPos: [5, 5, 8], populate: populateCylinder })
    new TheoryScene({ canvas: document.getElementById('theory-canvas-torus')    as HTMLCanvasElement, camPos: [6, 4, 9], populate: populateTorus })
  }

  /** Show the setup canvas + section that matches the active geometry. */
  setGeometry(mode: GeometryMode) {
    // Toggle geometry sections
    const sections = document.querySelectorAll<HTMLElement>('#theory-scroll .theory-section[data-geometry]')
    for (const sec of sections) {
      sec.hidden = sec.dataset.geometry !== mode
    }
    // Toggle setup canvases (each lives in its own .theory-canvas-wrap[data-setup])
    const setups = document.querySelectorAll<HTMLElement>('#theory-section-setup .theory-canvas-wrap[data-setup]')
    for (const wrap of setups) {
      wrap.hidden = wrap.dataset.setup !== mode
    }
  }
}
