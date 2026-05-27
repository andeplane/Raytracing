# Ray Tracing: Implement the Intersection Shaders
### A Hands-On GLSL Coding Task

---

## The Big Idea

A ray tracer renders images by asking one question per pixel:

> *Along the line of sight through this pixel, what surface is first visible?*

The answer requires finding where a **ray** hits a surface. A ray is a half-line parameterised by a single scalar **t**:

$$\mathbf{P}(t) = \mathbf{O} + t\,\mathbf{D}, \qquad t \ge 0$$

where **O** is the camera eye and **D** is the unit direction through the pixel. The restriction t ≥ 0 means only forward travel counts.

The key insight that makes analytic ray tracing elegant: most surfaces are described by an **implicit equation** F(**X**) = 0. Substituting the ray into F collapses a 3-D geometry problem into a 1-D root-finding problem:

$$F(\mathbf{P}(t)) = 0 \quad\Longrightarrow\quad f(t) = 0$$

Since P(t) is linear in t, the degree of f equals the degree of F. A sphere (degree 2) gives a quadratic. A torus (degree 4) gives a quartic. The roots of f(t) are the intersection distances — the smallest positive root is the visible hit.

| Surface | F degree | Ray equation | Roots (max) |
|---|---|---|---|
| Plane | 1 | linear | 1 |
| Sphere | 2 | quadratic | 2 |
| Cylinder | 2 | quadratic | 2 + 2 caps |
| Torus | 4 | **quartic** | **4** |

Once you have a hit at t*, the surface **normal** is the gradient of F evaluated there and normalised:

$$\mathbf{N} = \mathrm{normalize}\bigl(\nabla F(\mathbf{P}(t^*))\bigr)$$

The Theory tab walks through this derivation step by step for each shape. This task is about *implementing* it in GLSL.

---

## Open the App

> **[https://andeplane.github.io/Raytracing](https://andeplane.github.io/Raytracing)**  
> (or run locally: `npm install && npm run dev`)

The app has three tabs:

| Tab | What it does |
|---|---|
| **Theory** | Full mathematical derivation — read this first |
| **Intuition** | Aim a ray interactively, watch the polynomial roots update live |
| **Code** | ← **Your workspace** — edit GLSL and the shader recompiles automatically |

---

## How the Code Tab Works

Select a geometry from the dropdown in the header. The editor shows a complete fragment shader that renders that shape by ray tracing.

You only need to fill in **three functions** (the camera, lighting, and shading are already handled):

```glsl
// 1. Implicit surface — F(p) = 0 on the surface, < 0 inside, > 0 outside
float ObjectImplicit(vec3 p) { ... }

// 2. Outward unit normal at a surface point p — equals normalize(∇F(p))
vec3 ObjectNormal(vec3 p) { ... }

// 3. First positive intersection distance, or -1.0 on miss
float RayObject(vec3 ro, vec3 rd) { ... }
```

**The shader recompiles automatically** as you type (after a short pause). Compilation errors appear in red at the bottom of the canvas. Use **Ctrl/Cmd + Enter** or **▶ Run** for an instant recompile.

Your edits are **saved automatically** in your browser. The **↺ Reset** button restores the original starter code if you need it.

---

## Reference: The Sphere (Already Complete)

Study the sphere shader before starting — it is the simplest case of the pattern you will apply to cylinder and torus.

**Sphere of radius R centred at origin:** F(**p**) = |**p**|² − R²

Substituting **P**(t) = **O** + t**D** and expanding:

$$(\mathbf{D}\cdot\mathbf{D})\,t^2 + 2(\mathbf{O}\cdot\mathbf{D})\,t + (|\mathbf{O}|^2 - R^2) = 0$$

Discriminant Δ = (O·D)² − (D·D)(|O|²−R²). If Δ < 0 the ray misses; otherwise the two roots are (−(O·D) ± √Δ) / (D·D).

```glsl
const float R = 0.5;

float ObjectImplicit(vec3 p) { return dot(p, p) - R * R; }

vec3 ObjectNormal(vec3 p) { return normalize(p); }   // ∇F = 2p, factor cancels

float RayObject(vec3 ro, vec3 rd) {
    float a     = dot(rd, rd);
    float halfB = dot(ro, rd);          // b/2 avoids the factor-of-2 everywhere
    float c     = dot(ro, ro) - R * R;
    float disc  = halfB * halfB - a * c;
    if (disc < 0.0) return -1.0;        // Δ < 0 → miss
    float sqD = sqrt(disc);
    float t0  = (-halfB - sqD) / a;     // near root
    float t1  = (-halfB + sqD) / a;     // far root
    if (t0 > 0.0001) return t0;
    if (t1 > 0.0001) return t1;
    return -1.0;
}
```

Notice: `halfB = dot(ro, rd)` is b/2, which lets us write the discriminant as (b/2)² − ac instead of b² − 4ac. Same result, cleaner code.

---

## Part 1 — Cylinder

Select **🔷 Cylinder** from the dropdown. The canvas is black — both `ObjectImplicit` and `RayObject` are placeholders that return constants. Your job is to fill them in.

### Background

An infinite cylinder with radius R and axis along Y satisfies x² + z² = R², so:

$$F(\mathbf{p}) = p_x^2 + p_z^2 - R^2$$

Crucially, **F ignores the y component** — the barrel extends infinitely along Y. Substituting the ray's x and z components only:

$$\underbrace{(D_x^2 + D_z^2)}_{a}\,t^2 + \underbrace{2(O_x D_x + O_z D_z)}_{b}\,t + \underbrace{(O_x^2 + O_z^2 - R^2)}_{c} = 0$$

This is the **same quadratic structure** as the sphere — only the coefficients a, b, c are different (XZ components instead of full 3D dot products).

The outward normal on the barrel points radially away from the Y axis:
$$\mathbf{N} = \mathrm{normalize}(p_x,\; 0,\; p_z)$$

### Tasks

**C1. Implement `ObjectImplicit`**

```glsl
float ObjectImplicit(vec3 p) {
    return p.x*p.x + p.z*p.z - R*R;
}
```

The canvas is still black — `RayObject` still returns -1.0 — but no red error means you're on track.

**C2. Implement `ObjectNormal`**

```glsl
vec3 ObjectNormal(vec3 p) {
    return normalize(vec3(p.x, 0.0, p.z));
}
```

Still black. Good — only `RayObject` remains.

**C3. Implement `RayObject` for the infinite barrel**

Mirror the sphere solver but use only the XZ components:

```glsl
float RayObject(vec3 ro, vec3 rd) {
    float a     = rd.x*rd.x + rd.z*rd.z;
    float halfB = ro.x*rd.x + ro.z*rd.z;
    float c     = ro.x*ro.x + ro.z*ro.z - R*R;
    float disc  = halfB*halfB - a*c;
    if (disc < 0.0) return -1.0;
    float sqD = sqrt(disc);
    float t0  = (-halfB - sqD) / a;
    float t1  = (-halfB + sqD) / a;
    if (t0 > 0.0001) return t0;
    if (t1 > 0.0001) return t1;
    return -1.0;
}
```

You should see a shaded tube stretching through the scene. Drag to orbit around it.

**C4. Add finite caps (stretch goal)**

The shader already defines `const float H = 3.0` as the cylinder height. To cap at y = ±H/2:

1. After finding t0/t1, reject any root where |y(t)| > H/2.
2. For each cap plane y = ±H/2, find t_cap = (±H/2 − ro.y) / rd.y. Accept the cap hit if x² + z² ≤ R² at that point.
3. Return the smallest valid positive t among barrel and cap candidates.

> **Tip:** Check the **Intuition** tab with Cylinder selected. Watch how the polynomial graph changes as you aim toward the end cap vs. the barrel side.

---

## Part 2 — Torus

Select **🍩 Torus** from the dropdown. The torus is significantly harder: ray intersection produces a **degree-4 (quartic) polynomial** with up to four real roots.

### Background

A torus with major radius R (centre → tube centre) and minor radius r (tube cross-section), symmetric around Y, satisfies:

$$F(\mathbf{p}) = \bigl(|\mathbf{p}|^2 + R^2 - r^2\bigr)^2 - 4R^2\bigl(p_x^2 + p_z^2\bigr) = 0$$

Substituting P(t) = O + tD yields a quartic. Define auxiliary scalars:

| Symbol | Value | What it encodes |
|--------|-------|-----------------|
| α | `dot(rd, rd)` | |D|² |
| β | `2 * dot(ro, rd)` | 2(O·D) |
| γ | `dot(ro, ro) + R² - r²` | |O|² + R² − r² |
| δ | `rd.x² + rd.z²` | D projected onto XZ |
| ε | `2*(ro.x*rd.x + ro.z*rd.z)` | 2(O·D) projected onto XZ |
| ζ | `ro.x² + ro.z²` | |O|² projected onto XZ |

Notice: `αt² + βt + γ` = |P(t)|² + R² − r² and `δt² + εt + ζ` = P(t)_x² + P(t)_z². Squaring the first and subtracting 4R² times the second gives the quartic:

$$A = \alpha^2, \quad B = 2\alpha\beta, \quad C = \beta^2 + 2\alpha\gamma - 4R^2\delta$$
$$D = 2\beta\gamma - 4R^2\varepsilon, \quad E = \gamma^2 - 4R^2\zeta$$

### Tasks

**T1. Implement `ObjectImplicit`**

```glsl
float ObjectImplicit(vec3 p) {
    float s  = dot(p, p) + MAJOR_R*MAJOR_R - MINOR_R*MINOR_R;
    return s*s - 4.0*MAJOR_R*MAJOR_R*(p.x*p.x + p.z*p.z);
}
```

**T2. Implement `ObjectNormal`**

The gradient of F, derived by differentiating the torus implicit (see Theory tab):

```glsl
vec3 ObjectNormal(vec3 p) {
    float s = dot(p, p) + MAJOR_R*MAJOR_R - MINOR_R*MINOR_R;
    return normalize(vec3(
        4.0*p.x*(s - 2.0*MAJOR_R*MAJOR_R),
        4.0*p.y*s,
        4.0*p.z*(s - 2.0*MAJOR_R*MAJOR_R)
    ));
}
```

**T3. Compute the quartic coefficients**

Replace the `return -1.0;` in `RayObject` with:

```glsl
float RayObject(vec3 ro, vec3 rd) {
    float R2 = MAJOR_R*MAJOR_R, r2 = MINOR_R*MINOR_R;

    float alpha   = dot(rd, rd);
    float beta    = 2.0 * dot(ro, rd);
    float gamma   = dot(ro, ro) + R2 - r2;
    float delta   = rd.x*rd.x + rd.z*rd.z;
    float epsilon = 2.0*(ro.x*rd.x + ro.z*rd.z);
    float zeta    = ro.x*ro.x + ro.z*ro.z;

    float A = alpha*alpha;
    float B = 2.0*alpha*beta;
    float C = beta*beta  + 2.0*alpha*gamma - 4.0*R2*delta;
    float D = 2.0*beta*gamma               - 4.0*R2*epsilon;
    float E = gamma*gamma                  - 4.0*R2*zeta;

    // TODO next: solve At⁴ + Bt³ + Ct² + Dt + E = 0
    return -1.0;
}
```

No visual yet, but now the coefficients are right.

**T4. Solve the quartic — scan + bisect**

Evaluate f(t) = At⁴ + Bt³ + Ct² + Dt + E using **Horner's method** (numerically stable):

```glsl
float evalQuartic(float A, float B, float C, float D, float E, float t) {
    return ((((A*t) + B)*t + C)*t + D)*t + E;
}
```

Then scan for sign changes and bisect each bracket. Replace `return -1.0;` above with:

```glsl
    float tMin = 0.001, tMax = 20.0;
    int   N    = 64;
    float dt   = (tMax - tMin) / float(N);
    float best = -1.0;
    float fPrev = evalQuartic(A,B,C,D,E, tMin);

    for (int i = 1; i <= N; i++) {
        float t1 = tMin + float(i)*dt;
        float f1 = evalQuartic(A,B,C,D,E, t1);
        if (fPrev * f1 < 0.0) {             // sign change → bracket a root
            float lo = t1 - dt, hi = t1;
            for (int j = 0; j < 8; j++) {
                float mid = 0.5*(lo + hi);
                if (evalQuartic(A,B,C,D,E, mid) * fPrev < 0.0) hi = mid;
                else lo = mid;
            }
            float root = 0.5*(lo + hi);
            if (root > 0.0001 && (best < 0.0 || root < best)) best = root;
        }
        fPrev = f1;
    }
    return best;
```

You should now see a shaded torus. Drag to orbit. 🍩

**T5. Experiment (stretch goals)**

- **Increase N** (128, 256) — does quality improve at grazing angles?
- **Decrease N** (16, 8) — where do artefacts first appear?
- **Newton's method** instead of bisection: `t ← t − f(t)/f'(t)` where f'(t) = 4At³ + 3Bt² + 2Ct + D. Does it converge faster?
- **Analytic quartic** — look up Neumark's or Ferrari's formula and compare precision.

> **Tip:** Switch to **Intuition → 🍩 Torus** and drag the ray. Watch the quartic graph — you can see all four roots appear and merge as the ray grazes the torus surface.

---

## Summary

The same three-step pattern works for every implicit surface:

> 1. Write **F(p) = 0** — the implicit surface equation  
> 2. Substitute the ray **P(t) = O + tD** → polynomial **f(t) = 0**  
> 3. Find the **smallest positive root** → evaluate **N = normalize(∇F)** at the hit

| Shape | `ObjectImplicit` | Poly degree | `ObjectNormal` |
|---|---|---|---|
| Sphere | `dot(p,p) − R²` | 2 | `normalize(p)` |
| Cylinder | `p.x²+p.z² − R²` | 2 | `normalize(p.x, 0, p.z)` |
| Torus | `(‖p‖²+R²−r²)² − 4R²(p.x²+p.z²)` | **4** | `normalize(∇F(p))` |

Good luck — and enjoy the shapes!
