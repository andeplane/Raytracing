# Agent Guidelines — Ray–Torus Intersection Visualiser

## Project overview

A Three.js + TypeScript (Vite) educational tool for visualising ray–torus
intersection. A ray is fired from an eye point through a near plane into a
scene containing a torus. The quartic polynomial whose roots give the
intersection parameters is plotted in real time.

---

## Architecture

```
src/
  torusMath.ts      Pure math: quartic coefficients, evaluation, root-finding.
  scene3d.ts        Three.js 3D scene (torus, ray, frustum, hit markers).
  graph.ts          2D canvas plot of the quartic f(t).
  nearPlane.ts      Interactive 2D near-plane target picker.
  main.ts           Wires everything together; owns shared SceneParams state.
  *.test.ts         Unit tests (Vitest).
```

**Key invariant:** `torusMath.ts` has **zero** DOM / Three.js dependencies.
All inputs are plain `Vec3` and number values. This makes it trivially testable.

---

## Coding standards

### Dependency Injection (DI) pattern

The math layer is deliberately decoupled from the rendering layer.

- `Scene3D.getRayInfo()` transforms the ray into torus-local coordinates and
  returns plain `Vec3` objects (`O_v`, `D_v`).
- `quarticCoeffs(O, D, R, r)` then operates purely on those values.
- Tests inject `Vec3` literals directly — **no mocks, no stubs needed.**

When adding new math features, keep them as **pure functions in `torusMath.ts`**
and write tests before the implementation (TDD).

### Test-driven development (TDD)

1. Write a failing test describing the expected behaviour.
2. Implement the minimum code to make it pass.
3. Refactor if needed, keeping all tests green.

Coverage target: **≥ 90 %** for `torusMath.ts`.

---

## Running locally

```bash
npm install
npm run dev          # Vite dev server at http://localhost:5173
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint
npm run test         # Vitest unit tests
npm run test:coverage
npm run build        # Production build to dist/
```

---

## CI (GitHub Actions)

| Workflow | Trigger | Jobs |
|----------|---------|------|
| `ci.yml` | Every push / PR | typecheck → lint → test (coverage) → build |
| `pages.yml` | Push to `main` | build (with `/Raytracing/` base) → deploy to GitHub Pages |

The live demo is published to:
`https://andeplane.github.io/Raytracing/`

---

## Math notes

### Torus orientation

The torus sits at the origin with its **axis along Z** (ring in the XY plane —
the Three.js default). A tilt slider applies an **X-axis rotation** to the
torus mesh; the ray is transformed into torus-local coordinates by the
inverse rotation before the quartic is computed.

### Quartic derivation

Given torus surface equation: `(x²+y²+z²+R²−r²)² = 4R²(x²+y²)`

Substitute ray `P(t) = O + t·D`:

```
m = |D|²          n = 2(O·D)          p = |O|² + R² − r²
a₂ = Dx²+Dy²      a₁ = 2(Ox·Dx+Oy·Dy)  a₀ = Ox²+Oy²

c₄ = m²
c₃ = 2mn
c₂ = n² + 2mp − 4R²a₂
c₁ = 2np − 4R²a₁
c₀ = p² − 4R²a₀
```

Root-finding uses a scan for sign changes followed by Newton–Raphson /
bisection refinement (see `findRoots` in `torusMath.ts`).
