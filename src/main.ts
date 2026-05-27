/**
 * Main entry point — wires together the 3D scene, polynomial graph,
 * near-plane view, slider controls, and tab navigation.
 */
import { Scene3D, type SceneParams, type GeometryMode } from './scene3d'
import { PolynomialGraph } from './graph'
import { NearPlaneView } from './nearPlane'
import { quarticCoeffs, findRoots } from './torusMath'
import type { QuarticCoeffs } from './torusMath'
import { CodeView } from './codeView'
import { TheoryView } from './theoryView'
import { sphereCoeffs } from './sphereMath'
import { cylinderBarrelCoeffs, cylinderHits, CYLINDER_HEIGHT } from './cylinderMath'

// ── State ──────────────────────────────────────────────────────────────────
// eyeZ and nearDist are fixed — not exposed in UI but used internally.
const params: SceneParams = {
  geometryMode: 'sphere',
  majorR: 2.0,
  minorR: 0.5,
  eyeZ: 6.0,
  nearDist: 1.5,
  rayX: 0.0,
  rayY: 0.0,
}

// ── DOM ────────────────────────────────────────────────────────────────────
const sceneCanvas    = document.getElementById('scene-canvas')     as HTMLCanvasElement
const graphCanvas    = document.getElementById('graph-canvas')     as HTMLCanvasElement
const nearPlaneCanvas = document.getElementById('near-plane-canvas') as HTMLCanvasElement
const rootInfo       = document.getElementById('root-info')!

// ── Modules ────────────────────────────────────────────────────────────────
const scene3d   = new Scene3D(sceneCanvas, params)
scene3d.onGizmoChange(() => updateAll())
const polyGraph = new PolynomialGraph(graphCanvas)
const nearView  = new NearPlaneView(nearPlaneCanvas)

// ── Geometry metadata ──────────────────────────────────────────────────────
const GEOMETRY_META: Record<GeometryMode, {
  title: string; graphLabel: string; subtitle: string; majorLabel: string; showMinorR: boolean
}> = {
  sphere: {
    title: '🔵 Ray–Sphere Intersection',
    graphLabel: 'Quadratic f(t)',
    subtitle: 'f(t) = 0 ⟹ ray hits sphere at parameter t',
    majorLabel: 'Radius R',
    showMinorR: false,
  },
  cylinder: {
    title: '🔷 Ray–Cylinder Intersection',
    graphLabel: 'Quadratic f(t)',
    subtitle: 'f(t) = 0 ⟹ ray hits cylinder barrel at parameter t',
    majorLabel: 'Radius R',
    showMinorR: false,
  },
  torus: {
    title: '🍩 Ray–Torus Intersection',
    graphLabel: 'Quartic f(t)',
    subtitle: 'f(t) = 0 ⟹ ray hits torus at parameter t',
    majorLabel: 'Major radius R',
    showMinorR: true,
  },
}

// ── Apply geometry mode (updates DOM + rerenders) ──────────────────────────
function applyGeometryMode() {
  const meta = GEOMETRY_META[params.geometryMode]
  document.getElementById('scene-title')!.textContent = meta.title
  document.getElementById('graph-title')!.textContent = meta.graphLabel
  document.getElementById('graph-subtitle')!.textContent = meta.subtitle
  document.getElementById('label-majorR')!.textContent = meta.majorLabel
  document.getElementById('ctrl-row-minorR')!.style.display = meta.showMinorR ? '' : 'none'
  updateAll()
}

// ── Main update ────────────────────────────────────────────────────────────
function updateAll() {
  scene3d.update(params)

  const { eyePos, rayDir, O_v, D_v } = scene3d.getRayInfo()
  const tMin = 0.001
  const tMax = params.eyeZ + 20

  let coeffs: QuarticCoeffs
  let positiveRoots: number[]

  if (params.geometryMode === 'sphere') {
    coeffs = sphereCoeffs(O_v, D_v, params.majorR)
    positiveRoots = findRoots(coeffs, tMin, tMax).filter(t => t > 0)
  } else if (params.geometryMode === 'cylinder') {
    coeffs = cylinderBarrelCoeffs(O_v, D_v, params.majorR)
    positiveRoots = cylinderHits(O_v, D_v, params.majorR, CYLINDER_HEIGHT, tMin, tMax).filter(t => t > 0)
  } else {
    coeffs = quarticCoeffs(O_v, D_v, params.majorR, params.minorR)
    positiveRoots = findRoots(coeffs, tMin, tMax).filter(t => t > 0)
  }

  scene3d.setHits(positiveRoots, eyePos, rayDir)

  const graphMax = Math.max(params.eyeZ + 12, 20)
  polyGraph.draw(coeffs, positiveRoots, tMin, graphMax)
  nearView.draw()

  if (positiveRoots.length > 0) {
    const tStrs = positiveRoots.map(t => `t=${t.toFixed(3)}`).join(', ')
    rootInfo.innerHTML = `<span class="hit">✓ ${positiveRoots.length} hit${positiveRoots.length > 1 ? 's' : ''}: ${tStrs}</span>`
  } else {
    rootInfo.innerHTML = `<span class="miss">✗ no intersection</span>`
  }
}

// ── Slider helper ──────────────────────────────────────────────────────────
function bindSlider(
  id: string,
  valId: string,
  format: (v: number) => string,
  onChange: (v: number) => void,
) {
  const slider  = document.getElementById(id)    as HTMLInputElement
  const display = document.getElementById(valId)!
  const update = () => {
    const v = parseFloat(slider.value)
    display.textContent = format(v)
    onChange(v)
  }
  slider.addEventListener('input', update)
  update()
}

// ── Near plane drag → sync sliders ────────────────────────────────────────
nearView.onChange((x, y) => {
  params.rayX = x
  params.rayY = y
  const sX = document.getElementById('ctrl-rayX') as HTMLInputElement
  const sY = document.getElementById('ctrl-rayY') as HTMLInputElement
  sX.value = String(x)
  document.getElementById('val-rayX')!.textContent = x.toFixed(2)
  sY.value = String(y)
  document.getElementById('val-rayY')!.textContent = y.toFixed(2)
  updateAll()
})

// ── Geometry dropdown ──────────────────────────────────────────────────────
const geoSelect = document.getElementById('geometry-select') as HTMLSelectElement
geoSelect.value = params.geometryMode
geoSelect.addEventListener('change', () => {
  params.geometryMode = geoSelect.value as GeometryMode
  applyGeometryMode()
})

// ── Bind sliders ───────────────────────────────────────────────────────────
const fix2 = (v: number) => v.toFixed(2)

bindSlider('ctrl-R',    'val-R',    fix2, v => { params.majorR = v;                  updateAll() })
bindSlider('ctrl-r',    'val-r',    fix2, v => { params.minorR = v;                  updateAll() })
bindSlider('ctrl-rayX', 'val-rayX', fix2, v => { params.rayX = v; nearView.rayX = v; updateAll() })
bindSlider('ctrl-rayY', 'val-rayY', fix2, v => { params.rayY = v; nearView.rayY = v; updateAll() })

// ── Resize observer ────────────────────────────────────────────────────────
const resizeObs = new ResizeObserver(() => updateAll())
resizeObs.observe(graphCanvas)
resizeObs.observe(nearPlaneCanvas)

// ── Initial render ─────────────────────────────────────────────────────────
applyGeometryMode()

// ── Tab navigation ─────────────────────────────────────────────────────────
let codeView:   CodeView   | null = null
let theoryView: TheoryView | null = null

// Elements only relevant when the Intuition or Code tab is active
const headerOnlyForInteractive = [
  document.getElementById('scene-title')!,
  document.getElementById('geometry-select')!,
  document.getElementById('root-info')!,
]

function setActiveTab(target: string) {
  // Hide all panels, deselect all buttons
  document.querySelectorAll<HTMLElement>('.tab-panel').forEach(p => { p.hidden = true })
  document.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach(b => {
    b.setAttribute('aria-selected', 'false')
  })

  // Show target panel, mark its button active
  const panel = document.getElementById(`tab-${target}`) as HTMLElement
  panel.hidden = false
  document.querySelector<HTMLButtonElement>(`.tab-btn[data-tab="${target}"]`)!
    .setAttribute('aria-selected', 'true')

  // Hide Intuition-only header items on Theory tab
  const isTheory = target === 'theory'
  for (const el of headerOnlyForInteractive) {
    el.style.visibility = isTheory ? 'hidden' : ''
  }

  // Lazy-init tabs on first visit
  if (target === 'theory' && !theoryView) {
    theoryView = new TheoryView(document.getElementById('tab-theory')!)
  }
  if (target === 'code' && !codeView) {
    codeView = new CodeView(document.getElementById('code-view-root')!)
  }
}

document.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => setActiveTab(btn.dataset.tab!))
})

// Open on Theory by default
setActiveTab('theory')
