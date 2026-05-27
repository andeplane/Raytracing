/**
 * Ray–Sphere Intersection Math
 *
 * Sphere centred at origin, radius r (isotropic — object rotation is irrelevant).
 * Surface equation: x² + y² + z² = r²
 *
 * Ray: P(t) = O + t·D
 *
 * Substituting gives a quadratic in t:
 *   (D·D)t² + 2(O·D)t + (|O|²−r²) = 0
 *
 * Returned as QuarticCoeffs with c4=c3=0.
 */

import type { Vec3, QuarticCoeffs } from './torusMath'

function dot(a: Vec3, b: Vec3) { return a.x*b.x + a.y*b.y + a.z*b.z }
function len2(a: Vec3) { return dot(a, a) }

/** Compute quadratic coefficients (as QuarticCoeffs) for ray-sphere intersection. */
export function sphereCoeffs(O: Vec3, D: Vec3, r: number): QuarticCoeffs {
  return {
    c4: 0,
    c3: 0,
    c2: len2(D),
    c1: 2 * dot(O, D),
    c0: len2(O) - r * r,
  }
}
