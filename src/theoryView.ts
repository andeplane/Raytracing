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

function populateSetup(scene: THREE.Scene) {
  // A small sphere in the scene to show the ray hitting something
  const R = 1.3
  addShape(scene, 'sphere', R, 0)

  const { eye, dir, O, D } = makeRay(0.3, 0.2)
  const coeffs = sphereCoeffs(O, D, R)
  const hits = findRoots(coeffs, 0.001, 20).filter(t => t > 0)
  addRaySetup(scene, eye, dir, hits)

  // Highlight a "pixel" on the near plane (a small bright square)
  const pixW = 0.28
  const pixGeo = new THREE.PlaneGeometry(pixW, pixW)
  const pixMat = new THREE.MeshBasicMaterial({ color: 0xffee44, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })
  const pix = new THREE.Mesh(pixGeo, pixMat)
  pix.position.set(0.3, 0.2, NEAR_Z + 0.002)
  scene.add(pix)
  scene.add(new THREE.LineSegments(new THREE.EdgesGeometry(pixGeo).applyMatrix4(new THREE.Matrix4().makeTranslation(0.3, 0.2, NEAR_Z + 0.003)), new THREE.LineBasicMaterial({ color: 0xffdd00 })))
}

function populateSphere(scene: THREE.Scene) {
  const R = 1.5
  addShape(scene, 'sphere', R, 0)
  const { eye, dir, O, D } = makeRay(0.4, 0.3)
  const coeffs = sphereCoeffs(O, D, R)
  const hits = findRoots(coeffs, 0.001, 20).filter(t => t > 0)
  addRaySetup(scene, eye, dir, hits)
}

function populateCylinder(scene: THREE.Scene) {
  const R = 1.0
  addShape(scene, 'cylinder', R, 0)
  const { eye, dir, O, D } = makeRay(0.5, 0.6)
  const hits = cylinderHits(O, D, R, CYLINDER_HEIGHT, 0.001, 20).filter(t => t > 0)
  addRaySetup(scene, eye, dir, hits)
}

function populateTorus(scene: THREE.Scene) {
  const R = 2.0, r = 0.6
  addShape(scene, 'torus', R, r)
  // Use a ray that reliably hits all 4 points on the torus
  const { eye, dir, O, D } = makeRay(0.0, 1.35)
  const coeffs = quarticCoeffs(O, D, R, r)
  const hits = findRoots(coeffs, 0.001, 20).filter(t => t > 0)
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
    // § 1 — Setup
    const setup = root.querySelector<HTMLElement>('#theory-eq-setup')!
    setup.innerHTML = `
      <p class="theory-intro">
        In ray tracing every pixel on the screen spawns a <em>ray</em> — a half-line
        that starts at the camera eye and travels through that pixel into the scene.
        Finding what colour to draw the pixel means finding the <em>first surface the
        ray hits</em>.
      </p>
      <div class="theory-eq-block">
        <div class="theory-eq-label">Ray parameterisation</div>
        <div class="theory-eq-body">${tex('\\mathbf{P}(t) = \\mathbf{O} + t\\,\\mathbf{D} \\qquad t \\ge 0', true)}</div>
        <div class="theory-eq-desc">
          ${tex('\\mathbf{O}')} — eye (origin) &ensp;
          ${tex('\\mathbf{D}')} — unit direction through the pixel &ensp;
          ${tex('t')} — distance along the ray
        </div>
      </div>
      <p class="theory-intro">
        For each surface, we substitute ${tex('\\mathbf{P}(t)')} into the surface's
        implicit equation ${tex('f(x,y,z)=0')} and solve for ${tex('t')}.
        The degree of the resulting polynomial in ${tex('t')} equals the
        <em>degree of the surface</em>.
      </p>
    `

    // § 2 — Sphere
    const sphere = root.querySelector<HTMLElement>('#theory-eq-sphere')!
    sphere.innerHTML = `
      <p class="theory-intro">
        A sphere centred at the origin with radius ${tex('R')} is the zero-set of a
        <strong>degree-2</strong> polynomial — so substituting the ray yields a
        quadratic in ${tex('t')}, with a closed-form solution.
      </p>
      <div class="theory-eq-block">
        <div class="theory-eq-label">Implicit surface (degree 2)</div>
        <div class="theory-eq-body">${tex('x^2 + y^2 + z^2 = R^2', true)}</div>
      </div>
      <div class="theory-eq-block">
        <div class="theory-eq-label">Substitute ${tex('\\mathbf{P}(t)=\\mathbf{O}+t\\mathbf{D}')}</div>
        <div class="theory-eq-body">${tex('(\\mathbf{D}\\cdot\\mathbf{D})\\,t^2 + 2(\\mathbf{O}\\cdot\\mathbf{D})\\,t + (|\\mathbf{O}|^2 - R^2) = 0', true)}</div>
      </div>
      <div class="theory-eq-block">
        <div class="theory-eq-label">Discriminant &amp; roots</div>
        <div class="theory-eq-body">${tex('\\Delta = (\\mathbf{O}\\cdot\\mathbf{D})^2 - (\\mathbf{D}\\cdot\\mathbf{D})(|\\mathbf{O}|^2 - R^2)', true)}</div>
        <div class="theory-eq-body">${tex('t = \\dfrac{-(\\mathbf{O}\\cdot\\mathbf{D}) \\pm \\sqrt{\\Delta}}{\\mathbf{D}\\cdot\\mathbf{D}}', true)}</div>
        <div class="theory-eq-desc">
          ${tex('\\Delta < 0')}: miss &emsp;
          ${tex('\\Delta = 0')}: tangent &emsp;
          ${tex('\\Delta > 0')}: 2 hits
        </div>
      </div>
    `

    // § 3 — Cylinder
    const cyl = root.querySelector<HTMLElement>('#theory-eq-cylinder')!
    cyl.innerHTML = `
      <p class="theory-intro">
        A finite cylinder (axis = ${tex('Y')}, radius ${tex('R')}, height ${tex('h')})
        has two parts: the curved <em>barrel</em> (again degree-2) and two flat
        <em>end caps</em> (trivial disk tests).
      </p>
      <div class="theory-eq-block">
        <div class="theory-eq-label">Barrel surface (ignores ${tex('y')})</div>
        <div class="theory-eq-body">${tex('x^2 + z^2 = R^2', true)}</div>
      </div>
      <div class="theory-eq-block">
        <div class="theory-eq-label">Barrel quadratic in ${tex('t')}</div>
        <div class="theory-eq-body">${tex('(D_x^2+D_z^2)\\,t^2 + 2(O_xD_x+O_zD_z)\\,t + (O_x^2+O_z^2-R^2) = 0', true)}</div>
        <div class="theory-eq-desc">Filter barrel hits to ${tex('|y(t)| \\le h/2')}</div>
      </div>
      <div class="theory-eq-block">
        <div class="theory-eq-label">End-cap disks (${tex('y = \\pm h/2')})</div>
        <div class="theory-eq-body">${tex('t_{\\mathrm{cap}} = \\dfrac{\\pm h/2 - O_y}{D_y} \\qquad \\text{check}\\;x(t)^2+z(t)^2 \\le R^2', true)}</div>
      </div>
      <p class="theory-intro">
        Total: at most <strong>4 intersections</strong> (2 barrel + 2 caps).
      </p>
    `

    // § 4 — Torus
    const torus = root.querySelector<HTMLElement>('#theory-eq-torus')!
    torus.innerHTML = `
      <p class="theory-intro">
        A torus with major radius ${tex('R')} (centre to tube centre) and minor radius
        ${tex('r')} (tube radius) is a <strong>degree-4</strong> surface.
        Substituting the ray yields a quartic — a ray can pierce the torus at
        up to <strong>four</strong> points.
      </p>
      <div class="theory-eq-block">
        <div class="theory-eq-label">Implicit surface (degree 4)</div>
        <div class="theory-eq-body">${tex('\\bigl(x^2+y^2+z^2+R^2-r^2\\bigr)^2 = 4R^2(x^2+y^2)', true)}</div>
      </div>
      <div class="theory-eq-block">
        <div class="theory-eq-label">Auxiliary scalars</div>
        <div class="theory-eq-body">${tex(`
          \\begin{aligned}
            m &= |\\mathbf{D}|^2, \\quad
            n = 2(\\mathbf{O}\\cdot\\mathbf{D}), \\quad
            p = |\\mathbf{O}|^2 + R^2 - r^2 \\\\
            a_2 &= D_x^2+D_y^2, \\quad
            a_1 = 2(O_xD_x+O_yD_y), \\quad
            a_0 = O_x^2+O_y^2
          \\end{aligned}
        `, true)}</div>
      </div>
      <div class="theory-eq-block">
        <div class="theory-eq-label">Quartic in ${tex('t')}</div>
        <div class="theory-eq-body">${tex('c_4 t^4 + c_3 t^3 + c_2 t^2 + c_1 t + c_0 = 0', true)}</div>
        <div class="theory-eq-body">${tex(`
          \\begin{aligned}
            c_4 &= m^2 \\\\
            c_3 &= 2mn \\\\
            c_2 &= n^2 + 2mp - 4R^2 a_2 \\\\
            c_1 &= 2np - 4R^2 a_1 \\\\
            c_0 &= p^2 - 4R^2 a_0
          \\end{aligned}
        `, true)}</div>
        <div class="theory-eq-desc">
          No closed-form quartic formula is used here — roots are found numerically
          via sign-change scan + Newton–Raphson refinement.
        </div>
      </div>
    `
  }

  private buildScenes() {
    new TheoryScene({
      canvas:  document.getElementById('theory-canvas-setup')    as HTMLCanvasElement,
      camPos:  [6, 4, 10],
      populate: populateSetup,
    })
    new TheoryScene({
      canvas:  document.getElementById('theory-canvas-sphere')   as HTMLCanvasElement,
      camPos:  [5, 3, 8],
      populate: populateSphere,
    })
    new TheoryScene({
      canvas:  document.getElementById('theory-canvas-cylinder') as HTMLCanvasElement,
      camPos:  [5, 5, 8],
      populate: populateCylinder,
    })
    new TheoryScene({
      canvas:  document.getElementById('theory-canvas-torus')    as HTMLCanvasElement,
      camPos:  [6, 4, 9],
      populate: populateTorus,
    })
  }
}
