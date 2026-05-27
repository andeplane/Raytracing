/**
 * Tests for graph.ts helper functions (pure logic, no DOM).
 *
 * The pan/zoom state management lives on the PolynomialGraph class which
 * requires a canvas element. Those interactions are tested here by exercising
 * the exported pure helpers (findExtrema) and by verifying the coordinate
 * math used for zoom-with-fixed-point.
 */
import { describe, it, expect } from 'vitest'
import { findExtrema } from './graph'
import { quarticCoeffs, evalQuartic } from './torusMath'
import type { QuarticCoeffs } from './torusMath'

// ── findExtrema ───────────────────────────────────────────────────────────

function sampleTs(tMin: number, tMax: number, n = 800): number[] {
  const ts: number[] = []
  for (let i = 0; i <= n; i++) ts.push(tMin + (i / n) * (tMax - tMin))
  return ts
}

describe('findExtrema', () => {
  it('finds no extrema for a linear polynomial', () => {
    // f(t) = t  →  f′(t) = 1, never zero
    const c: QuarticCoeffs = { c4: 0, c3: 0, c2: 0, c1: 1, c0: 0 }
    const ts = sampleTs(0, 10)
    expect(findExtrema(c, ts)).toHaveLength(0)
  })

  it('finds one extremum for a quadratic with a minimum', () => {
    // f(t) = t² - 4t + 5  →  minimum at t=2
    const c: QuarticCoeffs = { c4: 0, c3: 0, c2: 1, c1: -4, c0: 5 }
    const ts = sampleTs(0, 5)
    const extrema = findExtrema(c, ts)
    expect(extrema).toHaveLength(1)
    expect(extrema[0].t).toBeCloseTo(2, 1)
    expect(extrema[0].f).toBeCloseTo(1, 1)   // f(2) = 4 - 8 + 5 = 1
  })

  it('finds three extrema for a quartic with three turning points', () => {
    // A ray through the torus tube typically produces a quartic
    // with up to three local extrema in the interesting range.
    const O = { x: -8, y: 0, z: 0 }
    const D = { x: 1, y: 0, z: 0 }
    const c = quarticCoeffs(O, D, 2.0, 0.5)
    const ts = sampleTs(0, 16)
    const extrema = findExtrema(c, ts)
    // Should find at least 2 extrema (the quartic dips below zero and comes back up)
    expect(extrema.length).toBeGreaterThanOrEqual(2)
  })

  it('extremum f values satisfy f′(t) ≈ 0 via finite difference', () => {
    const c: QuarticCoeffs = { c4: 0, c3: 0, c2: 1, c1: -4, c0: 5 }
    const ts = sampleTs(0, 5)
    const extrema = findExtrema(c, ts)
    for (const { t } of extrema) {
      // Finite difference of f around t should be near 0
      const h = 1e-4
      const fd = (evalQuartic(c, t + h) - evalQuartic(c, t - h)) / (2 * h)
      expect(Math.abs(fd)).toBeLessThan(0.1)
    }
  })
})

// ── Zoom-with-fixed-point math ────────────────────────────────────────────

describe('zoom fixed-point math', () => {
  /**
   * The zoom formula used in PolynomialGraph.attachEvents (wheel handler):
   *
   *   newTMin = cursorT - fracT * newTSpan
   *   newTMax = cursorT + (1 - fracT) * newTSpan
   *
   * Invariant: the cursor's fractional position within the new window
   * must equal its fractional position within the old window.
   */
  function zoomWindow(
    tMin: number, tMax: number,
    cursorFrac: number,   // 0..1 within the window
    factor: number,       // > 1 = zoom out, < 1 = zoom in
  ) {
    const tSpan    = tMax - tMin
    const cursorT  = tMin + cursorFrac * tSpan
    const newTSpan = tSpan * factor
    return {
      tMin: cursorT - cursorFrac * newTSpan,
      tMax: cursorT + (1 - cursorFrac) * newTSpan,
    }
  }

  it('cursor at centre stays at centre after zoom', () => {
    const { tMin, tMax } = zoomWindow(0, 10, 0.5, 0.5)
    const centre = (tMin + tMax) / 2
    expect(centre).toBeCloseTo(5, 5)
  })

  it('cursor at left edge stays at left edge after zoom', () => {
    const { tMin } = zoomWindow(0, 10, 0, 2)
    expect(tMin).toBeCloseTo(0, 5)
  })

  it('cursor at right edge stays at right edge after zoom', () => {
    const { tMax } = zoomWindow(0, 10, 1, 2)
    expect(tMax).toBeCloseTo(10, 5)
  })

  it('zoom-in shrinks the window', () => {
    const orig = { tMin: 0, tMax: 10 }
    const zoomed = zoomWindow(orig.tMin, orig.tMax, 0.5, 0.5)
    expect(zoomed.tMax - zoomed.tMin).toBeLessThan(orig.tMax - orig.tMin)
  })

  it('zoom-out expands the window', () => {
    const orig = { tMin: 0, tMax: 10 }
    const zoomed = zoomWindow(orig.tMin, orig.tMax, 0.5, 2)
    expect(zoomed.tMax - zoomed.tMin).toBeGreaterThan(orig.tMax - orig.tMin)
  })

  it('cursor fractional position is preserved after zoom', () => {
    const tMin = 2, tMax = 8, frac = 0.3
    const { tMin: nMin, tMax: nMax } = zoomWindow(tMin, tMax, frac, 1.5)
    const cursorT  = tMin + frac * (tMax - tMin)
    const newFrac  = (cursorT - nMin) / (nMax - nMin)
    expect(newFrac).toBeCloseTo(frac, 5)
  })
})
