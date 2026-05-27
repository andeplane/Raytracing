/**
 * Main entry point — wires together the 3D scene, polynomial graph,
 * near-plane view, and slider controls.
 */
import { Scene3D, type SceneParams } from './scene3d'
import { PolynomialGraph } from './graph'
import { NearPlaneView } from './nearPlane'
import { quarticCoeffs, findRoots } from './torusMath'
import type { QuarticCoeffs } from './torusMath'

// ── State ──────────────────────────────────────────────────────────────────
// eyeZ and nearDist are fixed — not exposed in UI but used internally.
const params: SceneParams = {
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

// ── Main update ────────────────────────────────────────────────────────────
function updateAll() {
  scene3d.update(params)

  const { eyePos, rayDir, O_v, D_v } = scene3d.getRayInfo()

  const coeffs: QuarticCoeffs = quarticCoeffs(O_v, D_v, params.majorR, params.minorR)
  const roots = findRoots(coeffs, 0.001, params.eyeZ + 20)
  const positiveRoots = roots.filter(t => t > 0)

  scene3d.setHits(positiveRoots, eyePos, rayDir)

  const tMax = Math.max(params.eyeZ + 12, 20)
  polyGraph.draw(coeffs, positiveRoots, 0.001, tMax)
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
updateAll()
