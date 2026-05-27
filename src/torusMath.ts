/**
 * Ray–Torus Intersection Math
 *
 * Torus centred at origin, axis along Z, in XY plane (Three.js default orientation).
 * Major radius R (centre to tube centre), minor radius r (tube radius).
 * Surface equation: (x²+y²+z² + R²−r²)² = 4R²(x²+y²)
 *
 * Ray: P(t) = O + t·D
 *
 * Substituting gives a quartic in t:
 *   c4·t⁴ + c3·t³ + c2·t² + c1·t + c0 = 0
 */

export interface Vec3 { x: number; y: number; z: number }

function dot(a: Vec3, b: Vec3) { return a.x*b.x + a.y*b.y + a.z*b.z }
function len2(a: Vec3) { return dot(a, a) }

export interface QuarticCoeffs {
  c4: number; c3: number; c2: number; c1: number; c0: number;
}

/** Compute quartic coefficients for the ray-torus intersection. */
export function quarticCoeffs(O: Vec3, D: Vec3, R: number, r: number): QuarticCoeffs {
  const m = len2(D)                          // |D|²
  const n = 2 * dot(O, D)                   // 2(O·D)
  const p = len2(O) + R*R - r*r             // |O|² + R² - r²

  // x² + y² terms for the 4R²(x²+y²) side (torus axis = Z, ring in XY plane)
  const a2 = D.x*D.x + D.y*D.y
  const a1 = 2*(O.x*D.x + O.y*D.y)
  const a0 = O.x*O.x + O.y*O.y

  const c4 = m * m
  const c3 = 2 * m * n
  const c2 = n*n + 2*m*p - 4*R*R*a2
  const c1 = 2*n*p - 4*R*R*a1
  const c0 = p*p - 4*R*R*a0

  return { c4, c3, c2, c1, c0 }
}

/** Evaluate quartic polynomial at t. */
export function evalQuartic(c: QuarticCoeffs, t: number): number {
  return c.c4*t**4 + c.c3*t**3 + c.c2*t**2 + c.c1*t + c.c0
}

/** Evaluate quartic derivative at t. */
export function evalQuarticDeriv(c: QuarticCoeffs, t: number): number {
  return 4*c.c4*t**3 + 3*c.c3*t**2 + 2*c.c2*t + c.c1
}

/**
 * Find real roots of the quartic in the interval [tMin, tMax].
 * Uses a scan for sign changes + Newton–Raphson refinement.
 * Only returns roots with t > 0 (in front of the eye).
 */
export function findRoots(
  c: QuarticCoeffs,
  tMin = 0.001,
  tMax = 30,
  steps = 2000
): number[] {
  const roots: number[] = []
  const dt = (tMax - tMin) / steps
  let prev = evalQuartic(c, tMin)

  for (let i = 1; i <= steps; i++) {
    const t = tMin + i * dt
    const cur = evalQuartic(c, t)

    if (prev * cur < 0) {
      // Sign change → root bracket [t-dt, t]
      let lo = t - dt, hi = t
      // Newton–Raphson refinement
      let mid = (lo + hi) / 2
      for (let iter = 0; iter < 50; iter++) {
        const fmid = evalQuartic(c, mid)
        const dfmid = evalQuarticDeriv(c, mid)
        if (Math.abs(fmid) < 1e-10) break
        if (dfmid === 0) { mid = (lo + hi) / 2; break }
        const next = mid - fmid / dfmid
        if (next > lo && next < hi) {
          mid = next
        } else {
          // bisect fallback
          if (evalQuartic(c, lo) * fmid < 0) hi = mid
          else lo = mid
          mid = (lo + hi) / 2
        }
      }
      // Deduplicate close roots
      if (roots.length === 0 || Math.abs(mid - roots[roots.length-1]) > 1e-4) {
        roots.push(mid)
      }
    }
    prev = cur
  }

  return roots
}
