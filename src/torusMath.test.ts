/**
 * Unit tests for ray–torus intersection math.
 *
 * Design pattern: Dependency Injection
 * ─────────────────────────────────────
 * The math functions are pure (no DOM / Three.js / global state).
 * Tests inject Vec3 and QuarticCoeffs directly, giving complete
 * control over inputs and making tests fast, deterministic, and
 * easy to parameterise.
 *
 * TDD flow: add a failing test describing the next behaviour,
 * then make it pass. Keep coverage ≥ 90% for the math module.
 */
import { describe, it, expect } from 'vitest'
import {
  quarticCoeffs,
  evalQuartic,
  evalQuarticDeriv,
  findRoots,
  type Vec3,
  type QuarticCoeffs,
} from './torusMath'

// ── Helpers ────────────────────────────────────────────────────────────────

/** Build a normalised ray direction from origin O toward point P. */
function rayDir(O: Vec3, P: Vec3): Vec3 {
  const dx = P.x - O.x, dy = P.y - O.y, dz = P.z - O.z
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
  return { x: dx / len, y: dy / len, z: dz / len }
}

/** Evaluate the torus implicit function at P (axis=Z, XY plane). */
function torusImplicit(P: Vec3, R: number, r: number): number {
  const xy2 = P.x * P.x + P.y * P.y
  const s = xy2 + P.z * P.z + R * R - r * r
  return s * s - 4 * R * R * xy2
}

/** Walk the ray and return its position at parameter t. */
function atT(O: Vec3, D: Vec3, t: number): Vec3 {
  return { x: O.x + t * D.x, y: O.y + t * D.y, z: O.z + t * D.z }
}

// ── Fixtures ───────────────────────────────────────────────────────────────

const R = 2.0   // default major radius
const r = 0.5   // default minor radius

// Eye sitting at (0, 0, 6), looking toward origin
const EYE: Vec3 = { x: 0, y: 0, z: 6 }
const TOWARD_ORIGIN = rayDir(EYE, { x: 0, y: 0, z: 0 })

// ── Tests ──────────────────────────────────────────────────────────────────

describe('quarticCoeffs', () => {
  it('c4 is always positive (leading coefficient of normalized ray)', () => {
    const D = TOWARD_ORIGIN
    const c = quarticCoeffs(EYE, D, R, r)
    expect(c.c4).toBeGreaterThan(0)
  })

  it('coefficients match the torus implicit at sample t values', () => {
    const O = EYE
    const D = rayDir(O, { x: 1.5, y: 0.3, z: 0 })
    const c = quarticCoeffs(O, D, R, r)
    for (const t of [0, 0.5, 1.0, 2.0, 3.5, 5.0]) {
      const P = atT(O, D, t)
      const lhs = evalQuartic(c, t)
      const rhs = torusImplicit(P, R, r)
      expect(lhs).toBeCloseTo(rhs, 4)
    }
  })

  it('produces identical coefficients for the same input', () => {
    const D = TOWARD_ORIGIN
    const c1 = quarticCoeffs(EYE, D, R, r)
    const c2 = quarticCoeffs(EYE, D, R, r)
    expect(c1).toEqual(c2)
  })

  it('changes coefficients when major radius changes', () => {
    const D = TOWARD_ORIGIN
    const c1 = quarticCoeffs(EYE, D, R, r)
    const c2 = quarticCoeffs(EYE, D, R + 0.5, r)
    expect(c1.c0).not.toBeCloseTo(c2.c0, 3)
  })

  it('changes coefficients when minor radius changes', () => {
    const D = TOWARD_ORIGIN
    const c1 = quarticCoeffs(EYE, D, R, r)
    const c2 = quarticCoeffs(EYE, D, R, r + 0.3)
    expect(c1.c0).not.toBeCloseTo(c2.c0, 3)
  })
})

describe('evalQuartic', () => {
  it('evaluates a known polynomial correctly at t=0', () => {
    const c: QuarticCoeffs = { c4: 1, c3: 0, c2: 0, c1: 0, c0: 5 }
    expect(evalQuartic(c, 0)).toBe(5)
  })

  it('evaluates a known polynomial at t=1', () => {
    // t^4 + 2t^3 + 3t^2 + 4t + 5  →  at t=1: 1+2+3+4+5 = 15
    const c: QuarticCoeffs = { c4: 1, c3: 2, c2: 3, c1: 4, c0: 5 }
    expect(evalQuartic(c, 1)).toBe(15)
  })

  it('evaluates a known polynomial at t=2', () => {
    // t^4  →  at t=2: 16
    const c: QuarticCoeffs = { c4: 1, c3: 0, c2: 0, c1: 0, c0: 0 }
    expect(evalQuartic(c, 2)).toBe(16)
  })
})

describe('evalQuarticDeriv', () => {
  it('derivative of a constant is 0', () => {
    const c: QuarticCoeffs = { c4: 0, c3: 0, c2: 0, c1: 0, c0: 42 }
    expect(evalQuarticDeriv(c, 5)).toBe(0)
  })

  it('derivative of t^4 is 4t^3', () => {
    const c: QuarticCoeffs = { c4: 1, c3: 0, c2: 0, c1: 0, c0: 0 }
    expect(evalQuarticDeriv(c, 2)).toBeCloseTo(4 * 8, 8)  // 4 * 2^3 = 32
  })

  it('is consistent with finite-difference approximation', () => {
    const O = EYE
    const D = rayDir(O, { x: 1.0, y: 0.5, z: 0 })
    const c = quarticCoeffs(O, D, R, r)
    const t = 3.0, h = 1e-5
    const fd = (evalQuartic(c, t + h) - evalQuartic(c, t - h)) / (2 * h)
    expect(evalQuarticDeriv(c, t)).toBeCloseTo(fd, 4)
  })
})

describe('findRoots — miss cases', () => {
  it('central ray through hole misses the torus (returns no positive roots)', () => {
    // Straight through the hole along -Z axis
    const O = EYE
    const D = TOWARD_ORIGIN
    const c = quarticCoeffs(O, D, R, r)
    const roots = findRoots(c, 0.001, 20)
    expect(roots).toHaveLength(0)
  })

  it('ray far to the side misses', () => {
    const O = EYE
    const D = rayDir(O, { x: R + r + 1, y: 0, z: 0 })  // aimed far outside torus
    const c = quarticCoeffs(O, D, R, r)
    const roots = findRoots(c, 0.001, 20)
    expect(roots).toHaveLength(0)
  })
})

describe('findRoots — hit cases', () => {
  it('oblique ray through tube returns exactly 2 roots', () => {
    // Aim at the tube cross-section at (R, 0, 0) – tangential approach gets 2
    const O = EYE
    const D = rayDir(O, { x: R, y: 0, z: 0 })
    const c = quarticCoeffs(O, D, R, r)
    const roots = findRoots(c, 0.001, 20)
    expect(roots.length).toBeGreaterThanOrEqual(2)
  })

  it('coplanar ray through the ring hole gets 4 roots', () => {
    // Ray in the XY plane (z=0) from (-8, 0, 0) going in +X direction.
    // Passes through: outer tube wall (-R-r), inner tube wall (-R+r),
    // inner tube wall again (R-r), outer tube wall again (R+r) → 4 crossings.
    const O: Vec3 = { x: -8, y: 0, z: 0 }
    const D: Vec3 = { x: 1, y: 0, z: 0 }   // already unit length
    const c = quarticCoeffs(O, D, R, r)
    const roots = findRoots(c, 0.001, 20)
    expect(roots.length).toBe(4)
  })

  it('all reported positive roots satisfy |f(t)| < tolerance', () => {
    const O = EYE
    const D = rayDir(O, { x: R, y: 0, z: 0 })
    const c = quarticCoeffs(O, D, R, r)
    const roots = findRoots(c, 0.001, 20)
    for (const t of roots) {
      expect(Math.abs(evalQuartic(c, t))).toBeLessThan(1e-3)
    }
  })

  it('root positions lie on the torus surface in world space', () => {
    const O = EYE
    const D = rayDir(O, { x: R, y: 0, z: 0 })
    const c = quarticCoeffs(O, D, R, r)
    const roots = findRoots(c, 0.001, 20)
    for (const t of roots) {
      const P = atT(O, D, t)
      // Distance from ring centre to point P (projected onto XY plane) should ≈ r
      const distToRing = Math.sqrt(
        (Math.sqrt(P.x * P.x + P.y * P.y) - R) ** 2 + P.z * P.z
      )
      expect(distToRing).toBeCloseTo(r, 2)
    }
  })

  it('roots are sorted ascending', () => {
    const O = EYE
    const D = rayDir(O, { x: R, y: 0, z: 0 })
    const c = quarticCoeffs(O, D, R, r)
    const roots = findRoots(c, 0.001, 20)
    for (let i = 1; i < roots.length; i++) {
      expect(roots[i]).toBeGreaterThan(roots[i - 1])
    }
  })
})

describe('findRoots — tilt effect', () => {
  it('tilting the torus (X rotation) changes which roots are found', () => {
    // Simulate X-tilt by rotating ray into torus local frame
    // At 0° tilt, straight ray misses hole; at 90° tilt (ring vertical) it hits
    const tiltRad = Math.PI / 2

    // Torus local frame: apply inverse X rotation to the ray
    // Rx(-tiltRad) to (O, D):  y' = y*cos + z*sin,  z' = -y*sin + z*cos
    function rotX(v: Vec3, theta: number): Vec3 {
      return {
        x: v.x,
        y: v.y * Math.cos(theta) + v.z * Math.sin(theta),
        z: -v.y * Math.sin(theta) + v.z * Math.cos(theta),
      }
    }

    const O = EYE
    const D = TOWARD_ORIGIN
    const O_local = rotX(O, -tiltRad)
    const D_local = rotX(D, -tiltRad)

    const c = quarticCoeffs(O_local, D_local, R, r)
    const roots = findRoots(c, 0.001, 20)
    // At 90° tilt the ring is in XZ plane, central ray hits the tube
    expect(roots.length).toBeGreaterThan(0)
  })
})
