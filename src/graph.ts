/**
 * 2D polynomial graph.
 *
 * Interaction:
 *  • Drag to pan (x and y axes).
 *  • Scroll to zoom, keeping the point under the cursor fixed.
 *  • Double-click to reset to auto view.
 *
 * Y range auto-scales to local extrema (not blown-up endpoints).
 */
import type { QuarticCoeffs } from './torusMath'
import { evalQuartic, evalQuarticDeriv } from './torusMath'

const N = 800
const PAD = { top: 26, right: 18, bottom: 34, left: 68 }
const PADDING_FACTOR = 1.2

export class PolynomialGraph {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D

  // View window — null means "auto" (recomputed from data each frame)
  private view: { tMin: number; tMax: number; yMin: number; yMax: number } | null = null

  // Dragging
  private dragging = false
  private dragStart = { x: 0, y: 0 }
  private dragViewStart: typeof this.view = null

  // Last rendered window + plot area (used by event handlers for coordinate conversion)
  private rendered = { tMin: 0, tMax: 20, yMin: -1, yMax: 1, pL: 0, pT: 0, pw: 0, ph: 0 }

  // Cached draw args for redraws triggered by interaction
  private lastArgs: { coeffs: QuarticCoeffs; roots: number[]; tMin: number; tMax: number } | null = null

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.attachEvents()
  }

  private attachEvents() {
    const el = this.canvas

    // ── Pan ───────────────────────────────────────────────────────
    const pointerPos = (e: MouseEvent | Touch) => {
      const rect = el.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }

    el.addEventListener('mousedown', e => {
      e.preventDefault()
      this.dragging = true
      this.dragStart = pointerPos(e)
      this.dragViewStart = this.view ? { ...this.view } : { ...this.rendered }
      el.style.cursor = 'grabbing'
    })

    window.addEventListener('mousemove', e => {
      if (!this.dragging) return
      this.applyPan(pointerPos(e))
    })

    window.addEventListener('mouseup', () => {
      this.dragging = false
      el.style.cursor = 'grab'
    })

    el.addEventListener('touchstart', e => {
      e.preventDefault()
      const t = e.touches[0]
      this.dragging = true
      this.dragStart = pointerPos(t)
      this.dragViewStart = this.view ? { ...this.view } : { ...this.rendered }
      el.style.cursor = 'grabbing'
    }, { passive: false })

    el.addEventListener('touchmove', e => {
      e.preventDefault()
      if (!this.dragging) return
      this.applyPan(pointerPos(e.touches[0]))
    }, { passive: false })

    el.addEventListener('touchend', () => {
      this.dragging = false
      el.style.cursor = 'grab'
    })

    // ── Scroll zoom (fixed point under cursor) ────────────────────
    el.addEventListener('wheel', e => {
      e.preventDefault()
      const { tMin, tMax, yMin, yMax, pL, pT, pw, ph } = this.rendered
      const pos = pointerPos(e)

      // Cursor in data coords
      const cursorT = tMin + (pos.x - pL) / pw * (tMax - tMin)
      const cursorY = yMax - (pos.y - pT) / ph * (yMax - yMin)

      // Zoom factor: scroll up = zoom in (smaller span)
      const factor = e.deltaY > 0 ? 1.12 : 1 / 1.12
      const newTSpan = (tMax - tMin) * factor
      const newYSpan = (yMax - yMin) * factor

      // Keep cursor point fixed
      const fracT = (pos.x - pL) / pw
      const fracY = (pos.y - pT) / ph
      this.view = {
        tMin: cursorT - fracT * newTSpan,
        tMax: cursorT + (1 - fracT) * newTSpan,
        yMin: cursorY - (1 - fracY) * newYSpan,
        yMax: cursorY + fracY * newYSpan,
      }
      this.redraw()
    }, { passive: false })

    // ── Reset ─────────────────────────────────────────────────────
    el.addEventListener('dblclick', () => {
      this.view = null
      this.redraw()
    })

    el.style.cursor = 'grab'
  }

  private applyPan(current: { x: number; y: number }) {
    if (!this.dragViewStart) return
    const { tMin, tMax, yMin, yMax, pw, ph } = this.rendered
    const tSpan = tMax - tMin
    const ySpan = yMax - yMin

    const dx = current.x - this.dragStart.x
    const dy = current.y - this.dragStart.y

    // dx > 0 (drag right) → earlier t in view
    const dtPan = -(dx / pw) * tSpan
    // dy > 0 (drag down) → lower y in view
    const dyPan = (dy / ph) * ySpan

    const base = this.dragViewStart!
    this.view = {
      tMin: base.tMin + dtPan,
      tMax: base.tMax + dtPan,
      yMin: base.yMin + dyPan,
      yMax: base.yMax + dyPan,
    }
    this.redraw()
  }

  private redraw() {
    if (this.lastArgs) {
      const { coeffs, roots, tMin, tMax } = this.lastArgs
      this.draw(coeffs, roots, tMin, tMax)
    }
  }

  /** Compute the auto y range from local extrema. */
  private autoYRange(coeffs: QuarticCoeffs, ts: number[]): { yMin: number; yMax: number } {
    const extrema = findExtrema(coeffs, ts)
    const interesting = [0, ...extrema.map(e => e.f)]
    const fMin = Math.min(...interesting)
    const fMax = Math.max(...interesting)
    const yLo = fMin < 0 ? fMin * PADDING_FACTOR : (fMin === 0 ? -1 : fMin / PADDING_FACTOR)
    const yHi = fMax > 0 ? fMax * PADDING_FACTOR : (fMax === 0 ?  1 : fMax / PADDING_FACTOR)
    return { yMin: yLo, yMax: yHi }
  }

  draw(coeffs: QuarticCoeffs, roots: number[], tMin = 0, tMax = 20) {
    this.lastArgs = { coeffs, roots, tMin, tMax }

    const { canvas, ctx } = this

    // ── HiDPI ─────────────────────────────────────────────────────
    const dpr  = window.devicePixelRatio || 1
    const cssW = canvas.clientWidth  || 350
    const cssH = canvas.clientHeight || 160
    canvas.width  = Math.round(cssW * dpr)
    canvas.height = Math.round(cssH * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const W = cssW, H = cssH
    const { top: pT, right: pR, bottom: pB, left: pL } = PAD
    const pw = W - pL - pR
    const ph = H - pT - pB

    // ── Compute view window ───────────────────────────────────────
    // Sample using the auto t range first (for extrema detection)
    const ts: number[] = []
    const fs: number[] = []
    for (let i = 0; i <= N; i++) {
      const t = tMin + (i / N) * (tMax - tMin)
      ts.push(t); fs.push(evalQuartic(coeffs, t))
    }
    const autoY = this.autoYRange(coeffs, ts)

    const vTMin = this.view?.tMin ?? tMin
    const vTMax = this.view?.tMax ?? tMax
    const vYMin = this.view?.yMin ?? autoY.yMin
    const vYMax = this.view?.yMax ?? autoY.yMax

    // Cache rendered state for event handlers
    this.rendered = { tMin: vTMin, tMax: vTMax, yMin: vYMin, yMax: vYMax, pL, pT, pw, ph }

    // Resample for the visible t window
    const vts: number[] = []
    const vfs: number[] = []
    for (let i = 0; i <= N; i++) {
      const t = vTMin + (i / N) * (vTMax - vTMin)
      vts.push(t); vfs.push(evalQuartic(coeffs, t))
    }

    const tToX = (t: number) => pL + ((t - vTMin) / (vTMax - vTMin)) * pw
    const yToY = (y: number) => pT + ((vYMax - y) / (vYMax - vYMin)) * ph
    const clamp = (y: number) => Math.max(vYMin, Math.min(vYMax, y))

    // ── Background ────────────────────────────────────────────────
    ctx.fillStyle = '#080810'; ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#0c0c18'; ctx.fillRect(pL, pT, pw, ph)

    // Pan/zoom hint
    if (this.view !== null) {
      ctx.fillStyle = 'rgba(126,200,227,0.3)'
      ctx.font = '9px Courier New'; ctx.textAlign = 'right'
      ctx.fillText('dbl-click to reset', pL + pw - 2, pT + ph - 4)
    }

    // ── Grid ──────────────────────────────────────────────────────
    const extrema = findExtrema(coeffs, ts)
    const fMin = Math.min(0, ...extrema.map(e => e.f))
    const fMax = Math.max(0, ...extrema.map(e => e.f))
    const yTicks = makeYTicks(vYMin, vYMax, fMin, fMax, ph)
    const tTicks = niceTicks(vTMin, vTMax, Math.max(3, Math.floor(pw / 65)))

    ctx.strokeStyle = '#1e1e30'; ctx.lineWidth = 1; ctx.beginPath()
    for (const yv of yTicks.nice) { const cy = yToY(yv); ctx.moveTo(pL, cy); ctx.lineTo(pL + pw, cy) }
    for (const tv of tTicks)      { const cx = tToX(tv); ctx.moveTo(cx, pT); ctx.lineTo(cx, pT + ph) }
    ctx.stroke()

    // ── Zero line ─────────────────────────────────────────────────
    const zeroY = yToY(0)
    const zeroVisible = zeroY >= pT && zeroY <= pT + ph
    if (zeroVisible) {
      ctx.strokeStyle = '#404058'; ctx.lineWidth = 1.5
      ctx.setLineDash([5, 4])
      ctx.beginPath(); ctx.moveTo(pL, zeroY); ctx.lineTo(pL + pw, zeroY); ctx.stroke()
      ctx.setLineDash([])
    }

    // ── Curve ─────────────────────────────────────────────────────
    ctx.beginPath(); ctx.strokeStyle = '#7ec8e3'; ctx.lineWidth = 2
    let pen: 'up' | 'down' = 'up'
    for (let i = 0; i <= N; i++) {
      const cx = tToX(vts[i]), fy = vfs[i]
      const cy = yToY(clamp(fy))
      const clipped = fy < vYMin || fy > vYMax
      if (pen === 'up' || clipped) { ctx.moveTo(cx, cy); pen = clipped ? 'up' : 'down' }
      else ctx.lineTo(cx, cy)
    }
    ctx.stroke()

    // ── Extrema diamonds ─────────────────────────────────────────
    for (const { t, f } of extrema) {
      if (t < vTMin || t > vTMax || f < vYMin || f > vYMax) continue
      const cx = tToX(t), cy = yToY(f)
      ctx.fillStyle = '#c07840'; ctx.beginPath()
      ctx.moveTo(cx, cy - 5); ctx.lineTo(cx + 4, cy); ctx.lineTo(cx, cy + 5); ctx.lineTo(cx - 4, cy)
      ctx.closePath(); ctx.fill()
    }

    // ── Roots ─────────────────────────────────────────────────────
    for (const rt of roots) {
      if (rt < vTMin || rt > vTMax) continue
      const cx = tToX(rt)
      ctx.strokeStyle = '#4ecca3'; ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      ctx.beginPath(); ctx.moveTo(cx, pT); ctx.lineTo(cx, pT + ph); ctx.stroke()
      ctx.setLineDash([])

      if (zeroVisible) {
        ctx.shadowColor = '#4ecca3'; ctx.shadowBlur = 5
        ctx.fillStyle = '#4ecca3'
        ctx.beginPath(); ctx.arc(cx, zeroY, 4, 0, Math.PI * 2); ctx.fill()
        ctx.shadowBlur = 0
      }

      ctx.fillStyle = '#4ecca3'; ctx.font = 'bold 9px Courier New'; ctx.textAlign = 'center'
      ctx.fillText(`t=${rt.toFixed(2)}`, cx, pT + ph + 22)
    }

    // ── Border ────────────────────────────────────────────────────
    ctx.strokeStyle = '#2a2a42'; ctx.lineWidth = 1; ctx.strokeRect(pL, pT, pw, ph)

    // ── Y labels ──────────────────────────────────────────────────
    ctx.font = '9px Courier New'; ctx.textAlign = 'right'; ctx.fillStyle = '#555'
    for (const yv of yTicks.nice) {
      const cy = yToY(yv)
      if (cy < pT - 2 || cy > pT + ph + 2) continue
      ctx.fillText(fmtY(yv), pL - 5, cy + 3)
      ctx.strokeStyle = '#2a2a42'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(pL - 3, cy); ctx.lineTo(pL, cy); ctx.stroke()
    }
    drawExtremeLabel(ctx, fMin, pL, yToY(fMin), pT, pT + ph, 'min', '#c07840')
    drawExtremeLabel(ctx, fMax, pL, yToY(fMax), pT, pT + ph, 'max', '#c07840')

    // ── T labels ──────────────────────────────────────────────────
    ctx.fillStyle = '#555'; ctx.font = '9px Courier New'; ctx.textAlign = 'center'
    for (const tv of tTicks) {
      const cx = tToX(tv)
      ctx.fillText(fmtT(tv), cx, pT + ph + 13)
      ctx.strokeStyle = '#2a2a42'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(cx, pT + ph); ctx.lineTo(cx, pT + ph + 3); ctx.stroke()
    }

    // ── Axis titles ───────────────────────────────────────────────
    ctx.fillStyle = '#555'; ctx.font = '10px Courier New'; ctx.textAlign = 'left'
    ctx.fillText('t →', pL + pw - 26, pT + ph + 31)
    ctx.save(); ctx.translate(11, pT + ph / 2); ctx.rotate(-Math.PI / 2)
    ctx.textAlign = 'center'; ctx.fillText('f(t)', 0, 0); ctx.restore()

    // ── Coefficient readout ───────────────────────────────────────
    const c = coeffs
    ctx.fillStyle = '#2f2f48'; ctx.font = '8px Courier New'; ctx.textAlign = 'left'
    ctx.fillText(
      `c₄=${fmtC(c.c4)}  c₃=${fmtC(c.c3)}  c₂=${fmtC(c.c2)}  c₁=${fmtC(c.c1)}  c₀=${fmtC(c.c0)}`,
      pL + 4, pT + 10,
    )
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function drawExtremeLabel(
  ctx: CanvasRenderingContext2D,
  value: number, leftEdge: number, cy: number,
  plotTop: number, plotBottom: number,
  tag: 'min' | 'max', color: string,
) {
  if (!Number.isFinite(cy)) return
  const pinned = cy < plotTop || cy > plotBottom
  const clampedCy = Math.max(plotTop + 10, Math.min(plotBottom - 4, cy))
  ctx.save()
  ctx.strokeStyle = color; ctx.lineWidth = 0.8; ctx.setLineDash([2, 3])
  ctx.beginPath(); ctx.moveTo(leftEdge - 3, clampedCy); ctx.lineTo(leftEdge + 6, clampedCy)
  ctx.stroke(); ctx.setLineDash([])
  const arrow = pinned ? (cy < plotTop ? ' ↑' : ' ↓') : ''
  ctx.fillStyle = color; ctx.font = 'bold 8px Courier New'; ctx.textAlign = 'right'
  ctx.fillText(`${tag} ${fmtY(value)}${arrow}`, leftEdge - 5, clampedCy + (tag === 'max' ? -3 : 10))
  ctx.restore()
}

interface YTicks { nice: number[] }

function makeYTicks(yMin: number, yMax: number, fMin: number, fMax: number, pxH: number): YTicks {
  const target = Math.max(3, Math.floor(pxH / 45))
  const set = new Set<number>(niceTicks(yMin, yMax, target))
  if (yMin <= 0 && 0 <= yMax) set.add(0)
  const nice = [...set]
    .filter(v => v >= yMin && v <= yMax)
    .filter(v => Math.abs(v - fMin) > (yMax - yMin) * 0.04 && Math.abs(v - fMax) > (yMax - yMin) * 0.04)
    .sort((a, b) => a - b)
  return { nice }
}

function niceTicks(lo: number, hi: number, n: number): number[] {
  if (lo >= hi) return [lo]
  const span = hi - lo
  const raw  = span / Math.max(1, n)
  const mag  = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  const step = norm < 1.5 ? mag : norm < 3.5 ? 2 * mag : norm < 7.5 ? 5 * mag : 10 * mag
  const start = Math.ceil(lo / step) * step
  const result: number[] = []
  for (let v = start; v <= hi + step * 0.01; v += step) result.push(parseFloat(v.toPrecision(10)))
  return result
}

export function findExtrema(coeffs: QuarticCoeffs, ts: number[]): Array<{ t: number; f: number }> {
  const out: Array<{ t: number; f: number }> = []
  let prev = evalQuarticDeriv(coeffs, ts[0])
  for (let i = 1; i < ts.length; i++) {
    const cur = evalQuarticDeriv(coeffs, ts[i])
    // Detect sign change, including the case where derivative lands exactly on 0
    const signChanged = (prev < 0 && cur > 0) || (prev > 0 && cur < 0)
    const crossedZero = (prev < 0 && cur === 0) || (prev > 0 && cur === 0)
    if (signChanged || crossedZero) {
      let a = ts[i - 1], b = ts[i]
      for (let k = 0; k < 30; k++) {
        const m = (a + b) / 2
        const da = evalQuarticDeriv(coeffs, a)
        const dm = evalQuarticDeriv(coeffs, m)
        if (da * dm <= 0) b = m; else a = m
      }
      const t = (a + b) / 2
      out.push({ t, f: evalQuartic(coeffs, t) })
    }
    prev = cur
  }
  return out
}

function fmtY(v: number): string {
  if (!Number.isFinite(v)) return '?'
  if (v === 0) return '0'
  const a = Math.abs(v)
  if (a >= 1e6 || (a < 0.001 && a > 0)) return v.toExponential(2)
  if (a >= 1000) return v.toFixed(0)
  if (a >= 10)   return v.toFixed(1)
  return v.toFixed(2)
}

function fmtT(v: number): string {
  return Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2)
}

function fmtC(v: number): string {
  return Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0) ? v.toExponential(1) : v.toFixed(2)
}
