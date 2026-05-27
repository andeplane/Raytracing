/**
 * Ray–Cylinder Intersection Math
 *
 * Cylinder centred at origin, axis along Y, radius r.
 * Finite height h (capped at y = ±h/2).
 *
 * Barrel equation: x² + z² = r²
 * Barrel quadratic: (Dx²+Dz²)t² + 2(OxDx+OzDz)t + (Ox²+Oz²−r²) = 0
 *
 * cylinderBarrelCoeffs → QuarticCoeffs (c4=c3=0) for the polynomial graph.
 * cylinderHits         → all hit t-values including end-cap disks.
 */

import type { Vec3, QuarticCoeffs } from './torusMath'
import { findRoots } from './torusMath'

/** Fixed world-space height of the visualised cylinder. */
export const CYLINDER_HEIGHT = 3.0

/** Quadratic barrel coefficients as QuarticCoeffs (c4=c3=0). */
export function cylinderBarrelCoeffs(O: Vec3, D: Vec3, r: number): QuarticCoeffs {
  return {
    c4: 0,
    c3: 0,
    c2: D.x*D.x + D.z*D.z,
    c1: 2*(O.x*D.x + O.z*D.z),
    c0: O.x*O.x + O.z*O.z - r*r,
  }
}

/**
 * All t-values where the ray hits the finite capped cylinder.
 * Barrel hits are filtered to |y| ≤ h/2; cap hits are checked per disk.
 * Returns positive, sorted, deduplicated t-values.
 */
export function cylinderHits(
  O: Vec3, D: Vec3, r: number, h: number,
  tMin = 0.001, tMax = 50,
): number[] {
  const halfH = h / 2
  const hits: number[] = []

  // ── Barrel hits (infinite cylinder filtered by height) ───────────────────
  const coeffs = cylinderBarrelCoeffs(O, D, r)
  for (const t of findRoots(coeffs, tMin, tMax)) {
    if (Math.abs(O.y + t * D.y) <= halfH + 1e-6) hits.push(t)
  }

  // ── Cap hits (disk at y = ±halfH) ────────────────────────────────────────
  if (Math.abs(D.y) > 1e-10) {
    for (const capY of [halfH, -halfH]) {
      const t = (capY - O.y) / D.y
      if (t < tMin || t > tMax) continue
      const x = O.x + t * D.x
      const z = O.z + t * D.z
      if (x*x + z*z <= r*r + 1e-6) hits.push(t)
    }
  }

  hits.sort((a, b) => a - b)
  return hits.filter((t, i) => i === 0 || Math.abs(t - hits[i-1]) > 1e-4)
}
