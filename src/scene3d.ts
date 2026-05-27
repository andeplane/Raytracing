/**
 * Three.js 3D scene for ray-torus intersection visualization.
 *
 * Coordinate convention:
 *   - Torus centred at origin, axis along Y, in XZ plane.
 *   - Eye at (0, 0, eyeZ) looking toward -Z.
 *   - Near plane at z = eyeZ - nearDist.
 *   - Ray goes from eye through (rayX, rayY) on near plane.
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import type { Vec3 } from './torusMath'

export interface SceneParams {
  majorR: number
  minorR: number
  eyeZ: number
  nearDist: number
  rayX: number
  rayY: number
}

export class Scene3D {
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private controls: OrbitControls

  private torusMesh!: THREE.Mesh
  private torusWire!: THREE.Mesh
  private eyeSphere!: THREE.Mesh
  private nearPlaneMesh!: THREE.Mesh
  private frustumLines!: THREE.Line
  private rayLine!: THREE.Line
  private rayArrow!: THREE.ArrowHelper
  private hitGroup!: THREE.Group

  private tcTranslate!: TransformControls
  private tcRotate!: TransformControls
  private onGizmoChangeCallback: (() => void) | null = null
  private _gizmoDragging = false
  private _torusSelected = false
  private _lastMajorR = NaN
  private _lastMinorR = NaN

  private params: SceneParams

  constructor(canvas: HTMLCanvasElement, params: SceneParams) {
    this.params = { ...params }

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.setClearColor(0x0d0d0d)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200)
    this.camera.position.set(7, 5, 10)
    this.camera.lookAt(0, 0, 0)

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.FogExp2(0x0d0d0d, 0.03)

    this.setupLights()
    this.setupHelpers()
    this.buildObjects()

    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.07
    this.controls.minDistance = 2
    this.controls.maxDistance = 50
    this.controls.target.set(0, 0, 0)

    // ── Transform Controls (gizmo) ────────────────────────────────
    const makeTC = (mode: 'translate' | 'rotate') => {
      const tc = new TransformControls(this.camera, canvas)
      tc.setMode(mode)
      tc.size = 0.75
      tc.addEventListener('mouseDown', () => {
        this._gizmoDragging = true
        this.controls.enabled = false
      })
      tc.addEventListener('mouseUp', () => {
        this.controls.enabled = true
        // Delay so the click event that fires after mouseUp doesn't immediately deselect
        setTimeout(() => { this._gizmoDragging = false }, 0)
      })
      tc.addEventListener('objectChange', () => { this.onGizmoChangeCallback?.() })
      this.scene.add(tc.getHelper())
      return tc
    }
    this.tcTranslate = makeTC('translate')
    this.tcRotate    = makeTC('rotate')

    canvas.addEventListener('click', (e) => this._handleCanvasClick(e))

    this.handleResize()
    window.addEventListener('resize', () => this.handleResize())
    this.animate()
  }

  private setupLights() {
    this.scene.add(new THREE.AmbientLight(0x1a1a30, 4))

    const key = new THREE.DirectionalLight(0x7ec8e3, 4)
    key.position.set(5, 10, 5)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    this.scene.add(key)

    const rim = new THREE.DirectionalLight(0xff6b6b, 2)
    rim.position.set(-4, -2, -6)
    this.scene.add(rim)

    const fill = new THREE.PointLight(0x4ecca3, 1, 20)
    fill.position.set(0, 3, 0)
    this.scene.add(fill)
  }

  private setupHelpers() {
    const grid = new THREE.GridHelper(24, 24, 0x1e1e30, 0x161625)
    grid.position.y = -3
    this.scene.add(grid)
    this.scene.add(new THREE.AxesHelper(1.5))
  }

  private buildObjects() {
    const p = this.params

    // ── Torus (axis=Y, XZ plane) ─────────────────────────────────
    // Three.js TorusGeometry default: in XY plane, axis=Z
    // Rotate X by +PI/2 → axis=Y, XZ plane
    const torusGeo = new THREE.TorusGeometry(p.majorR, p.minorR, 80, 160)
    const torusMat = new THREE.MeshStandardMaterial({
      color: 0x5bb8d4,
      emissive: 0x1a4a5a,
      roughness: 0.85,
      metalness: 0.0,
    })
    this.torusMesh = new THREE.Mesh(torusGeo, torusMat)
    this.torusMesh.castShadow = true
    this.torusMesh.receiveShadow = true
    this.torusMesh.rotation.x = Math.PI / 2  // torus lies flat (axis=Y) by default
    this.scene.add(this.torusMesh)

    const wireGeo = new THREE.TorusGeometry(p.majorR, p.minorR, 16, 48)
    const wireMat = new THREE.MeshBasicMaterial({ color: 0x2a6a88, wireframe: true, opacity: 0.08, transparent: true })
    this.torusWire = new THREE.Mesh(wireGeo, wireMat)
    this.torusMesh.add(this.torusWire)  // child of torusMesh — inherits all transforms

    // ── Eye sphere ────────────────────────────────────────────────
    const eyeGeo = new THREE.SphereGeometry(0.14, 20, 20)
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffdd44, emissive: 0x886600, roughness: 0.2, metalness: 0.4 })
    this.eyeSphere = new THREE.Mesh(eyeGeo, eyeMat)
    this.eyeSphere.castShadow = true
    this.scene.add(this.eyeSphere)

    // ── Near plane ────────────────────────────────────────────────
    const planeGeo = new THREE.PlaneGeometry(5.2, 4.2)
    const planeMat = new THREE.MeshBasicMaterial({
      color: 0x1a4070,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    this.nearPlaneMesh = new THREE.Mesh(planeGeo, planeMat)
    this.scene.add(this.nearPlaneMesh)

    // Near plane border
    const edgesGeo = new THREE.EdgesGeometry(planeGeo)
    const edgesMat = new THREE.LineBasicMaterial({ color: 0x2a6aaa, opacity: 0.7, transparent: true })
    this.nearPlaneMesh.add(new THREE.LineSegments(edgesGeo, edgesMat))

    // ── Frustum corner lines ───────────────────────────────────────
    const frustumPts = new Float32Array(24) // 4 lines × 2 pts × 3 coords
    const frustumGeo = new THREE.BufferGeometry()
    frustumGeo.setAttribute('position', new THREE.BufferAttribute(frustumPts, 3))
    const frustumMat = new THREE.LineBasicMaterial({ color: 0x336699, opacity: 0.35, transparent: true })
    this.frustumLines = new THREE.Line(frustumGeo, frustumMat)
    this.scene.add(this.frustumLines)

    // ── Ray ───────────────────────────────────────────────────────
    const rayPts = new Float32Array(6)
    const rayGeo = new THREE.BufferGeometry()
    rayGeo.setAttribute('position', new THREE.BufferAttribute(rayPts, 3))
    const rayMat = new THREE.LineBasicMaterial({ color: 0xff6b6b, linewidth: 2 })
    this.rayLine = new THREE.Line(rayGeo, rayMat)
    this.scene.add(this.rayLine)

    this.rayArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, 6), 1.2, 0xff6b6b, 0.25, 0.12)
    this.scene.add(this.rayArrow)

    // ── Hit group ─────────────────────────────────────────────────
    this.hitGroup = new THREE.Group()
    this.scene.add(this.hitGroup)

    this.syncScene()
  }

  /** Sync all moveable scene objects to current params (no intersection calc). */
  private syncScene() {
    const p = this.params
    const eyePos = new THREE.Vector3(0, 0, p.eyeZ)
    const nearZ = p.eyeZ - p.nearDist
    const hitOnNear = new THREE.Vector3(p.rayX, p.rayY, nearZ)
    const rayDir = hitOnNear.clone().sub(eyePos).normalize()

    // Eye
    this.eyeSphere.position.copy(eyePos)

    // Near plane
    this.nearPlaneMesh.position.set(0, 0, nearZ)

    // Frustum corner lines
    const hw = 2.6, hh = 2.1
    const corners = [
      [-hw, -hh, nearZ], [hw, -hh, nearZ], [hw, hh, nearZ], [-hw, hh, nearZ],
    ] as const
    // Rebuild frustum geometry as LineSegments (4 eye→corner segments)
    const fpts = new Float32Array(4 * 2 * 3)
    for (let i = 0; i < 4; i++) {
      const c = corners[i]
      fpts[i * 6 + 0] = eyePos.x; fpts[i * 6 + 1] = eyePos.y; fpts[i * 6 + 2] = eyePos.z
      fpts[i * 6 + 3] = c[0];     fpts[i * 6 + 4] = c[1];     fpts[i * 6 + 5] = c[2]
    }
    this.frustumLines.geometry.dispose()
    const newFGeo = new THREE.BufferGeometry()
    newFGeo.setAttribute('position', new THREE.BufferAttribute(fpts, 3))
    this.frustumLines.geometry = newFGeo

    // Torus geometry — only rebuild when radii change (preserves gizmo transform)
    if (p.majorR !== this._lastMajorR || p.minorR !== this._lastMinorR) {
      this.torusMesh.geometry.dispose()
      this.torusMesh.geometry = new THREE.TorusGeometry(p.majorR, p.minorR, 80, 160)
      const wire = this.torusMesh.children[0] as THREE.Mesh
      wire.geometry.dispose()
      wire.geometry = new THREE.TorusGeometry(p.majorR, p.minorR, 16, 48)
      this._lastMajorR = p.majorR
      this._lastMinorR = p.minorR
    }
    // torusWire transform is driven by torusMesh parent — no manual sync needed

    // Ray (initial: eye → far)
    const farPt = eyePos.clone().addScaledVector(rayDir, 16)
    const rayGeo = this.rayLine.geometry
    const rpts = new Float32Array([eyePos.x, eyePos.y, eyePos.z, farPt.x, farPt.y, farPt.z])
    rayGeo.dispose()
    const newRGeo = new THREE.BufferGeometry()
    newRGeo.setAttribute('position', new THREE.BufferAttribute(rpts, 3))
    this.rayLine.geometry = newRGeo

    // Arrow
    this.rayArrow.position.copy(eyePos)
    this.rayArrow.setDirection(rayDir)
  }

  /** Called from main after computing intersections. */
  setHits(hitTs: number[], eyePos: THREE.Vector3, rayDir: THREE.Vector3) {
    // Clear old hits
    while (this.hitGroup.children.length) {
      const m = this.hitGroup.children[0] as THREE.Mesh
      m.geometry?.dispose()
      this.hitGroup.remove(m)
    }

    const hasHit = hitTs.length > 0
    const rayColor = hasHit ? 0x4ecca3 : 0xff6b6b;
    (this.rayLine.material as THREE.LineBasicMaterial).color.setHex(rayColor);
    (this.rayArrow.line.material as THREE.LineBasicMaterial).color.setHex(rayColor);
    (this.rayArrow.cone.material as THREE.MeshBasicMaterial).color.setHex(rayColor)

    const endT = hasHit ? hitTs[hitTs.length - 1] + 1.5 : 16
    const farPt = eyePos.clone().addScaledVector(rayDir, endT)
    const rpts = new Float32Array([eyePos.x, eyePos.y, eyePos.z, farPt.x, farPt.y, farPt.z])
    this.rayLine.geometry.dispose()
    const newG = new THREE.BufferGeometry()
    newG.setAttribute('position', new THREE.BufferAttribute(rpts, 3))
    this.rayLine.geometry = newG

    for (const t of hitTs) {
      if (t <= 0) continue
      const pos = eyePos.clone().addScaledVector(rayDir, t)

      // Hit sphere
      const geo = new THREE.SphereGeometry(0.12, 24, 24)
      const mat = new THREE.MeshStandardMaterial({ color: 0x4ecca3, emissive: 0x1a7a50, roughness: 0.05, metalness: 0.5 })
      const sphere = new THREE.Mesh(geo, mat)
      sphere.position.copy(pos)
      this.hitGroup.add(sphere)

      // Pulse ring (billboard, updated in animate)
      const rGeo = new THREE.RingGeometry(0.15, 0.22, 32)
      const rMat = new THREE.MeshBasicMaterial({ color: 0x4ecca3, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })
      const ring = new THREE.Mesh(rGeo, rMat)
      ring.position.copy(pos)
      ring.userData.isRing = true
      this.hitGroup.add(ring)
    }
  }

  /** Compute ray in torus local frame (for math). */
  getRayInfo(): { eyePos: THREE.Vector3; rayDir: THREE.Vector3; O_v: Vec3; D_v: Vec3 } {
    const p = this.params
    const eyePos = new THREE.Vector3(0, 0, p.eyeZ)
    const nearZ = p.eyeZ - p.nearDist
    const hitOnNear = new THREE.Vector3(p.rayX, p.rayY, nearZ)
    const rayDir = hitOnNear.clone().sub(eyePos).normalize()

    // Transform ray into torus local frame using the mesh's actual world transform.
    // Handles arbitrary position and rotation applied by the gizmo.
    const torusPos = this.torusMesh.position
    const qInv = this.torusMesh.quaternion.clone().invert()

    const O_local = eyePos.clone().sub(torusPos).applyQuaternion(qInv)
    const D_local = rayDir.clone().applyQuaternion(qInv)

    return {
      eyePos,
      rayDir,
      O_v: { x: O_local.x, y: O_local.y, z: O_local.z },
      D_v: { x: D_local.x, y: D_local.y, z: D_local.z },
    }
  }

  /** Register a callback that fires whenever the gizmo transforms the torus. */
  onGizmoChange(cb: () => void): void {
    this.onGizmoChangeCallback = cb
  }

  private _handleCanvasClick(e: MouseEvent) {
    if (this._gizmoDragging) return  // drag ended with a click — don't deselect

    const rect = this.renderer.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width)  * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    )
    const ray = new THREE.Raycaster()
    ray.setFromCamera(ndc, this.camera)

    // recursive=false so we don't hit the wireframe child
    const hits = ray.intersectObject(this.torusMesh, false)
    if (hits.length > 0) {
      this._selectTorus()
    } else {
      this._deselectTorus()
    }
  }

  private _selectTorus() {
    if (this._torusSelected) return
    this._torusSelected = true
    this.tcTranslate.attach(this.torusMesh)
    this.tcRotate.attach(this.torusMesh)
    ;(this.torusMesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x2a6a7a)
  }

  private _deselectTorus() {
    if (!this._torusSelected) return
    this._torusSelected = false
    this.tcTranslate.detach()
    this.tcRotate.detach()
    ;(this.torusMesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x1a4a5a)
  }

  update(params: Partial<SceneParams>) {
    Object.assign(this.params, params)
    this.syncScene()
  }

  private handleResize() {
    const el = this.renderer.domElement
    const container = el.parentElement!
    const w = container.clientWidth
    const h = container.clientHeight
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private animate() {
    requestAnimationFrame(() => this.animate())
    this.controls.update()
    // Billboard rings toward camera
    for (const child of this.hitGroup.children) {
      if (child.userData.isRing) child.lookAt(this.camera.position)
    }
    this.renderer.render(this.scene, this.camera)
  }
}
