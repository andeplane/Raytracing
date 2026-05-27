/**
 * 2D polynomial graph.
 *
 * Features:
 *  • Y-axis scales to local extrema (not blown-up endpoints).
 *  • Drag up/down to pan the y-axis view.
 *  • Double-click to reset pan.
 *  • Zero line, root markers, extrema diamonds, min/max labels.
 *  • Proper HiDPI rendering.
 */
import type { QuarticCoeffs } from './torusMath'
import { evalQuartic, evalQuarticDeriv } from './torusMath'

const N = 800
const PAD = { top: 26, right: 18, bottom: 34, left: 68 }
const PADDING_FACTOR = 1.2

export class PolynomialGraph {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D

  // Pan state
  private yPan = 0          // current pan offset in data units
  private dragging = false
  private dragStartY = 0    // pointer y at drag start (CSS px)
  private dragStartPan = 0  // yPan value at drag start

  // Cached from last draw so drag can trigger a redraw
  private lastCoeffs: QuarticCoeffs | null = null
  private lastRoots: number[] = []
  private lastTMin = 0
  private lastTMax = 20

  // Last rendered y span (data units per CSS pixel) for drag scaling
  private pxPerDataUnit = 1

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.attachDragEvents()
  }

  private attachDragEvents() {
    const el = this.canvas

    const onDown = (clientY: number) => {
      this.dragging = true
      this.dragStartY = clientY
      this.dragStartPan = this.yPan
      el.style.cursor = 'grabbing'
    }

    const onMove = (clientY: number) => {
      if (!this.dragging) return
      const dy = clientY - this.dragStartY          // CSS pixels, positive = down
      const dataDelta = dy / this.pxPerDataUnit      // down drag → lower values in view → pan down
      this.yPan = this.dragStartPan - dataDelta
      this.redraw()
    }

    const onUp = () => {
      this.dragging = false
      el.style.cursor = 'ns-resize'
    }

    el.addEventListener('mousedown', e => { e.preventDefault(); onDown(e.clientY) })
    window.addEventListener('mousemove', e => onMove(e.clientY))
    window.addEventListener('mouseup', onUp)

    el.addEventListener('touchstart', e => { e.preventDefault(); onDown(e.touches[0].clientY) }, { passive: false })
    el.addEventListener('touchmove',  e => { e.preventDefault(); onMove(e.touches[0].clientY) }, { passive: false })
    el.addEventListener('touchend',   onUp)

    // Double-click resets pan
    el.addEventListener('dblclick', () => { this.yPan = 0; this.redraw() })

    el.style.cursor = 'ns-resize'
  }

  private redraw() {
    if (this.lastCoeffs) {
      this.draw(this.lastCoeffs, this.lastRoots, this.lastTMin, this.lastTMax)
    }
  }

  draw(coeffs: QuarticCoeffs, roots: number[], tMin = 0, tMax = 20) {
    // Cache for drag redraws
    this.lastCoeffs = coeffs
    this.lastRoots  = roots
    this.lastTMin   = tMin
    this.lastTMax   = tMax

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

    // ── Sample ────────────────────────────────────────────────────
    const ts: number[] = []
    const fs: number[] = []
    for (let i = 0; i <= N; i++) {
      const t = tMin + (i / N) * (tMax - tMin)
      ts.push(t)
      fs.push(evalQuartic(coeffs, t))
    }

    // ── Base y range: local extrema + zero, ±20% padding ─────────
    const extrema = findExtrema(coeffs, ts)
    const interesting = [0, ...extrema.map(e => e.f)]
    const fMin = Math.min(...interesting)
    const fMax = Math.max(...interesting)

    const yLoBase = fMin < 0 ? fMin * PADDING_FACTOR : fMin / PADDING_FACTOR
    const yHiBase = fMax > 0 ? fMax * PADDING_FACTOR : fMax / PADDING_FACTOR
    const ySpan   = (yLoBase === yHiBase) ? 2 : (yHiBase - yLoBase)

    // Apply pan offset
    const yMin = (yLoBase === yHiBase ? yLoBase - 1 : yLoBase) + this.yPan
    const yMax = (yLoBase === yHiBase ? yHiBase + 1 : yHiBase) + this.yPan

    // Store scale for drag conversion (CSS pixels per data unit, positive = down)
    this.pxPerDataUnit = ph / ySpan

    const tToX  = (t: number) => pL + ((t - tMin) / (tMax - tMin)) * pw
    const yToY  = (y: number) => pT + ((yMax - y) / (yMax - yMin)) * ph
    const clamp = (y: number) => Math.max(yMin, Math.min(yMax, y))

    // ── Background ────────────────────────────────────────────────
    ctx.fillStyle = '#080810'
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#0c0c18'
    ctx.fillRect(pL, pT, pw, ph)

    // Pan hint (shown when panned away from default)
    if (Math.abs(this.yPan) > ySpan * 0.02) {
      ctx.fillStyle = 'rgba(126,200,227,0.35)'
      ctx.font = '9px Courier New'
      ctx.textAlign = 'right'
      ctx.fillText('↕ dbl-click to reset', pL + pw - 2, pT + ph - 4)
    }

    // ── Grid ──────────────────────────────────────────────────────
    const yTicks = makeYTicks(yMin, yMax, fMin + this.yPan, fMax + this.yPan, ph)
    const tTicks = niceTicks(tMin, tMax, Math.max(3, Math.floor(pw / 65)))

    ctx.strokeStyle = '#1e1e30'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (const yv of yTicks.nice) {
      const cy = yToY(yv); ctx.moveTo(pL, cy); ctx.lineTo(pL + pw, cy)
    }
    for (const tv of tTicks) {
      const cx = tToX(tv); ctx.moveTo(cx, pT); ctx.lineTo(cx, pT + ph)
    }
    ctx.stroke()

    // ── Zero line ─────────────────────────────────────────────────
    const zeroY = yToY(0)
    const zeroVisible = zeroY >= pT && zeroY <= pT + ph
    if (zeroVisible) {
      ctx.strokeStyle = '#404058'
      ctx.lineWidth = 1.5
      ctx.setLineDash([5, 4])
      ctx.beginPath(); ctx.moveTo(pL, zeroY); ctx.lineTo(pL + pw, zeroY); ctx.stroke()
      ctx.setLineDash([])
    }

    // ── Curve ─────────────────────────────────────────────────────
    ctx.beginPath()
    ctx.strokeStyle = '#7ec8e3'
    ctx.lineWidth = 2
    let pen: 'up' | 'down' = 'up'
    for (let i = 0; i <= N; i++) {
      const cx = tToX(ts[i])
      const fy = fs[i]
      const cy = yToY(clamp(fy))
      const clipped = fy < yMin || fy > yMax
      if (pen === 'up' || clipped) { ctx.moveTo(cx, cy); pen = clipped ? 'up' : 'down' }
      else ctx.lineTo(cx, cy)
    }
    ctx.stroke()

    // ── Extrema diamonds ─────────────────────────────────────────
    for (const { t, f } of extrema) {
      if (f < yMin || f > yMax) continue
      const cx = tToX(t), cy = yToY(f)
      ctx.fillStyle = '#c07840'
      ctx.beginPath()
      ctx.moveTo(cx, cy - 5); ctx.lineTo(cx + 4, cy)
      ctx.lineTo(cx, cy + 5); ctx.lineTo(cx - 4, cy)
      ctx.closePath(); ctx.fill()
    }

    // ── Roots ─────────────────────────────────────────────────────
    for (const rt of roots) {
      if (rt < tMin || rt > tMax) continue
      const cx = tToX(rt)
      ctx.strokeStyle = '#4ecca3'
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      ctx.beginPath(); ctx.moveTo(cx, pT); ctx.lineTo(cx, pT + ph); ctx.stroke()
      ctx.setLineDash([])

      if (zeroVisible) {
        ctx.shadowColor = '#4ecca3'; ctx.shadowBlur = 5
        ctx.fillStyle = '#4ecca3'
        ctx.beginPath(); ctx.arc(cx, zeroY, 4, 0, Math.PI * 2); ctx.fill()
        ctx.shadowBlur = 0
      }

      ctx.fillStyle = '#4ecca3'
      ctx.font = 'bold 9px Courier New'
      ctx.textAlign = 'center'
      ctx.fillText(`t=${rt.toFixed(2)}`, cx, pT + ph + 22)
    }

    // ── Border ────────────────────────────────────────────────────
    ctx.strokeStyle = '#2a2a42'; ctx.lineWidth = 1
    ctx.strokeRect(pL, pT, pw, ph)

    // ── Y labels ──────────────────────────────────────────────────
    ctx.font = '9px Courier New'; ctx.textAlign = 'right'
    ctx.fillStyle = '#555'
    for (const yv of yTicks.nice) {
      const cy = yToY(yv)
      if (cy < pT - 2 || cy > pT + ph + 2) continue
      ctx.fillText(fmtY(yv), pL - 5, cy + 3)
      ctx.strokeStyle = '#2a2a42'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(pL - 3, cy); ctx.lineTo(pL, cy); ctx.stroke()
    }

    // min/max labels at their actual y positions (may be off-screen if panned)
    drawExtremeLabel(ctx, fMin + this.yPan, pL, yToY(fMin + this.yPan), pT, pT + ph, 'min', '#c07840')
    drawExtremeLabel(ctx, fMax + this.yPan, pL, yToY(fMax + this.yPan), pT, pT + ph, 'max', '#c07840')

    // ── X labels ──────────────────────────────────────────────────
    ctx.fillStyle = '#555'; ctx.font = '9px Courier New'; ctx.textAlign = 'center'
    for (const tv of tTicks) {
      const cx = tToX(tv)
      ctx.fillText(tv.toFixed(1), cx, pT + ph + 13)
      ctx.strokeStyle = '#2a2a42'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(cx, pT + ph); ctx.lineTo(cx, pT + ph + 3); ctx.stroke()
    }

    // ── Axis titles ───────────────────────────────────────────────
    ctx.fillStyle = '#555'; ctx.font = '10px Courier New'; ctx.textAlign = 'left'
    ctx.fillText('t →', pL + pw - 26, pT + ph + 31)
    ctx.save()
    ctx.translate(11, pT + ph / 2); ctx.rotate(-Math.PI / 2)
    ctx.textAlign = 'center'; ctx.fillText('f(t)', 0, 0)
    ctx.restore()

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
  value: number,
  leftEdge: number,
  cy: number,
  plotTop: number,
  plotBottom: number,
  tag: 'min' | 'max',
  color: string,
) {
  if (!Number.isFinite(cy)) return
  // If the label's line is outside the plot, pin it to the edge with an arrow indicator
  const pinned = cy < plotTop || cy > plotBottom
  const clampedCy = Math.max(plotTop + 10, Math.min(plotBottom - 4, cy))

  ctx.save()
  ctx.strokeStyle = color; ctx.lineWidth = 0.8
  ctx.setLineDash([2, 3])
  ctx.beginPath(); ctx.moveTo(leftEdge - 3, clampedCy); ctx.lineTo(leftEdge + 6, clampedCy)
  ctx.stroke(); ctx.setLineDash([])

  const arrow = pinned ? (cy < plotTop ? ' ↑' : ' ↓') : ''
  ctx.fillStyle = color; ctx.font = 'bold 8px Courier New'; ctx.textAlign = 'right'
  const yOff = tag === 'max' ? -3 : 10
  ctx.fillText(`${tag} ${fmtY(value)}${arrow}`, leftEdge - 5, clampedCy + yOff)
  ctx.restore()
}

interface YTicks { nice: number[] }

function makeYTicks(yMin: number, yMax: number, fMin: number, fMax: number, pxH: number): YTicks {
  const target = Math.max(3, Math.floor(pxH / 45))
  const niceAll = niceTicks(yMin, yMax, target)
  const set = new Set<number>(niceAll)
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
  for (let v = start; v <= hi + step * 0.01; v += step) {
    result.push(parseFloat(v.toPrecision(10)))
  }
  return result
}

function findExtrema(coeffs: QuarticCoeffs, ts: number[]): Array<{ t: number; f: number }> {
  const out: Array<{ t: number; f: number }> = []
  let prev = evalQuarticDeriv(coeffs, ts[0])
  for (let i = 1; i < ts.length; i++) {
    const cur = evalQuarticDeriv(coeffs, ts[i])
    if (prev * cur < 0) {
      let a = ts[i - 1], b = ts[i]
      for (let k = 0; k < 30; k++) {
        const m = (a + b) / 2
        if (evalQuarticDeriv(coeffs, a) * evalQuarticDeriv(coeffs, m) < 0) b = m
        else a = m
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

function fmtC(v: number): string {
  return Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0) ? v.toExponential(1) : v.toFixed(2)
}
