# Ray Tracing: Implement the Intersection Shaders
### A Hands-On GLSL Coding Task

---

## Before You Start — Open the App

> **[https://andeplane.github.io/Raytracing](https://andeplane.github.io/Raytracing)**  
> (or run locally: `npm install && npm run dev`)

The app has three tabs:

| Tab | What it does |
|---|---|
| **Theory** | Textbook-style walkthrough — read this first |
| **Intuition** | Drag a ray, watch the polynomial graph update live |
| **Code** | ← **Your workspace** — edit GLSL, click ▶ Run |

Switch to the **Code** tab. At the top-left, select a geometry from the dropdown. You will implement the missing functions for **Cylinder** and **Torus**.

---

## How the Code Tab Works

The editor contains a fragment shader that renders one geometric object.
You only need to edit **three functions** (everything else is provided):

```glsl
// 1. Implicit surface equation — F(p) = 0 on the surface, < 0 inside, > 0 outside
float ObjectImplicit(vec3 p) { ... }

// 2. Outward unit normal at a surface point p
vec3 ObjectNormal(vec3 p) { ... }

// 3. First positive ray–object intersection distance, or -1.0 on miss
float RayObject(vec3 ro, vec3 rd) { ... }
```

The **Sphere** shader is already complete — study it as your reference:

```glsl
// Sphere of radius R centred at the origin
float ObjectImplicit(vec3 p) { return dot(p, p) - R * R; }
vec3  ObjectNormal  (vec3 p) { return normalize(p); }

float RayObject(vec3 ro, vec3 rd) {
    float a     = dot(rd, rd);
    float halfB = dot(ro, rd);
    float c     = dot(ro, ro) - R * R;
    float disc  = halfB * halfB - a * c;
    if (disc < 0.0) return -1.0;
    float sqD = sqrt(disc);
    float t0  = (-halfB - sqD) / a;
    float t1  = (-halfB + sqD) / a;
    if (t0 > 0.0001) return t0;
    if (t1 > 0.0001) return t1;
    return -1.0;
}
```

Press **▶ Run** (or **Ctrl/Cmd + Enter**) after every edit to recompile. Compilation errors appear in red in the canvas.

---

## Part 1 — Cylinder

Select **🔷 Cylinder** from the dropdown. The canvas is black — nothing renders because all three functions are placeholders. Your job is to fix them.

### Background

An **infinite cylinder** with radius `R`, axis along the Y-axis, centred at the origin satisfies:

$$p_x^2 + p_z^2 = R^2 \quad\Longrightarrow\quad F(\mathbf{p}) = p_x^2 + p_z^2 - R^2$$

Substituting the ray $\mathbf{P}(t) = \mathbf{O} + t\mathbf{D}$ and keeping only the X and Z components:

$$\underbrace{(D_x^2 + D_z^2)}_{a}\,t^2 + \underbrace{2(O_x D_x + O_z D_z)}_{b}\,t + \underbrace{(O_x^2 + O_z^2 - R^2)}_{c} = 0$$

This is the same quadratic structure as the sphere — same solver, different $a, b, c$.

The outward normal on the barrel is the radial direction away from the Y-axis:
$$\hat{\mathbf{N}} = \text{normalize}(p_x,\; 0,\; p_z)$$

### Tasks

**C1. Implement `ObjectImplicit`**

Fill in the barrel equation:

```glsl
float ObjectImplicit(vec3 p) {
    return p.x*p.x + p.z*p.z - R*R;
}
```

Hit ▶ Run. The canvas is still black — `RayObject` still returns `-1.0` — but no compile errors means you're on track.

**C2. Implement `ObjectNormal`**

```glsl
vec3 ObjectNormal(vec3 p) {
    return normalize(vec3(p.x, 0.0, p.z));
}
```

Still black. Good.

**C3. Implement `RayObject` for the infinite barrel**

Mirror the sphere solver, but use only the XZ components of `ro` and `rd`:

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

Hit ▶ Run. You should see an **infinite cylinder** — a shaded tube stretching through the scene. Drag the canvas to orbit around it.

**C4. Add finite caps (stretch goal)**

To cap the cylinder at `y = ±H/2` (where `const float H = 3.0` is already in the shader), extend `RayObject`:

1. After finding `t0`/`t1`, check that the hit point's Y coordinate is in `[-H/2, H/2]`. If not, discard that root.
2. For each end cap (a disk at `y = ±H/2`):
   - Find `t_cap` where the ray crosses that plane: `t_cap = (±H/2 - ro.y) / rd.y`
   - Check the cap hit lies inside the disk: `length(ro.xz + t_cap * rd.xz) <= R`
3. Return the smallest valid positive `t` among all candidates.

> **Tip:** Use the **Intuition** tab (🔷 Cylinder selected) to see how the polynomial graph changes as you aim the ray at different parts of the cylinder — especially what happens when the ray is parallel to the axis.

---

## Part 2 — Torus

Select **🍩 Torus** from the dropdown. The torus is much harder: the ray intersection produces a **degree-4 (quartic)** polynomial.

### Background

A torus with major radius `MAJOR_R` (centre → tube centre) and minor radius `MINOR_R` (tube cross-section), centred at the origin, symmetric around the Y-axis:

$$F(\mathbf{p}) = \bigl(|\mathbf{p}|^2 + R^2 - r^2\bigr)^2 - 4R^2\bigl(p_x^2 + p_z^2\bigr) = 0$$

where $R$ = `MAJOR_R`, $r$ = `MINOR_R`.

Substituting $\mathbf{P}(t) = \mathbf{O} + t\mathbf{D}$ and expanding yields a quartic:

$$A t^4 + B t^3 + C t^2 + D t + E = 0$$

Define the shorthand scalars:

| Symbol | Value |
|--------|-------|
| $\alpha$ | `dot(rd, rd)` |
| $\beta$ | `2 * dot(ro, rd)` |
| $\gamma$ | `dot(ro, ro) + MAJOR_R² - MINOR_R²` |
| $\delta$ | `rd.x² + rd.z²` |
| $\varepsilon$ | `2*(ro.x*rd.x + ro.z*rd.z)` |
| $\zeta$ | `ro.x² + ro.z²` |

Then the quartic coefficients are:

$$A = \alpha^2, \quad B = 2\alpha\beta, \quad C = \beta^2 + 2\alpha\gamma - 4R^2\delta$$
$$D = 2\beta\gamma - 4R^2\varepsilon, \quad E = \gamma^2 - 4R^2\zeta$$

### Tasks

**T1. Implement `ObjectImplicit`**

```glsl
float ObjectImplicit(vec3 p) {
    float s  = dot(p, p) + MAJOR_R*MAJOR_R - MINOR_R*MINOR_R;
    float xz = p.x*p.x + p.z*p.z;
    return s*s - 4.0*MAJOR_R*MAJOR_R*xz;
}
```

**T2. Implement `ObjectNormal`**

The normal is $\nabla F$ evaluated at the hit point. Differentiating:

$$\frac{\partial F}{\partial p_x} = 4p_x\bigl(|\mathbf{p}|^2 + R^2 - r^2 - 2R^2\bigr), \quad
  \frac{\partial F}{\partial p_y} = 4p_y\bigl(|\mathbf{p}|^2 + R^2 - r^2\bigr), \quad
  \frac{\partial F}{\partial p_z} = 4p_z\bigl(|\mathbf{p}|^2 + R^2 - r^2 - 2R^2\bigr)$$

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

**T3. Implement `RayObject` — step 1: compute the quartic coefficients**

```glsl
float RayObject(vec3 ro, vec3 rd) {
    float R  = MAJOR_R, r  = MINOR_R;
    float R2 = R*R,     r2 = r*r;

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

Hit ▶ Run — still black, but no compile errors means the coefficients are ready.

**T4. Implement `RayObject` — step 2: solve the quartic**

Because the quartic has real coefficients, use a **scan + bisect** strategy:

1. **Sample the polynomial** at `N` evenly-spaced values of `t` in `[0.001, 20.0]`.  
   Evaluate $f(t) = At^4 + Bt^3 + Ct^2 + Dt + E$ using Horner's method:
   ```glsl
   float evalQuartic(float A, float B, float C, float D, float E, float t) {
       return ((((A*t) + B)*t + C)*t + D)*t + E;
   }
   ```

2. **Detect sign changes.** When `f(t_i)` and `f(t_{i+1})` differ in sign, there is a root in that interval.

3. **Bisect to refine** — run ~8 iterations to narrow the bracket.

4. **Return the smallest positive root found.**

```glsl
// Replace "return -1.0;" above with:
float tMin = 0.001, tMax = 20.0;
int   N    = 64;
float dt   = (tMax - tMin) / float(N);
float best = -1.0;

float fPrev = evalQuartic(A,B,C,D,E, tMin);
for (int i = 1; i <= N; i++) {
    float t1 = tMin + float(i)*dt;
    float f1 = evalQuartic(A,B,C,D,E, t1);
    if (fPrev * f1 < 0.0) {
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

Hit ▶ Run. If everything is correct you should see a **shaded torus** in the canvas. Drag to orbit. 🍩

**T5. Quality and performance (stretch goals)**

Once the torus renders correctly, experiment:

- **Increase N** (e.g. 128, 256) — does image quality improve at grazing angles?
- **Decrease N** (e.g. 16) — where do artifacts first appear?
- **Replace bisection with Newton's method**: `t ← t - f(t)/f'(t)` where $f'(t) = 4At^3 + 3Bt^2 + 2Ct + D$. Does it converge in fewer iterations?
- **Analytic solver:** Implement Neumark's or Ferrari's quartic formula and compare speed and precision.

---

## Summary

| Shape | `ObjectImplicit` | Intersection degree | Normal |
|---|---|---|---|
| Sphere | `dot(p,p) - R²` | Quadratic | `normalize(p)` |
| Cylinder | `p.x²+p.z² - R²` | Quadratic | `normalize(p.x, 0, p.z)` |
| Torus | `(|p|²+R²-r²)² - 4R²(p.x²+p.z²)` | **Quartic** | `∇F / |∇F|` |

The central pattern:

> **Implicit surface** $F(\mathbf{p}) = 0$  
> $\longrightarrow$ substitute the ray $\mathbf{P}(t) = \mathbf{O} + t\mathbf{D}$  
> $\longrightarrow$ polynomial $f(t) = 0$  
> $\longrightarrow$ find smallest positive root  
> $\longrightarrow$ evaluate normal $= \nabla F$ at the hit point

Good luck — and enjoy the shapes!
