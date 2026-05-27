# Ray Tracing: Derive and Implement the Intersection Shaders
### A Hands-On Math + GLSL Coding Task

---

## The Big Idea

A ray tracer renders images by asking one question per pixel:

> *Along the line of sight through this pixel, what surface is first visible?*

The answer requires finding where a **ray** hits a surface. A ray is a half-line parameterised by a single scalar **t**:

$$\mathbf{P}(t) = \mathbf{O} + t\,\mathbf{D}, \qquad t \ge 0$$

where **O** is the camera eye and **D** is the unit direction through the pixel.

The key insight that makes analytic ray tracing elegant: most surfaces are described by an **implicit equation** F(**X**) = 0 — a point lies on the surface exactly when F evaluates to zero. Substituting the ray into F collapses a 3-D geometry problem into a 1-D root-finding problem:

$$F(\mathbf{P}(t)) = 0 \quad\Longrightarrow\quad f(t) = 0$$

Since P(t) is linear in t, the degree of f equals the degree of F. A sphere (degree 2) gives a quadratic. A torus (degree 4) gives a quartic. The roots of f(t) are the intersection distances — the **smallest positive root** is the visible hit.

| Surface | F degree | Ray equation | Max intersections |
|---|---|---|---|
| Plane | 1 | linear | 1 |
| Sphere | 2 | quadratic | 2 |
| Cylinder | 2 | quadratic | 2 + 2 caps |
| Torus | 4 | **quartic** | **4** |

Once you have a hit at t*, the surface **normal** is the gradient of F evaluated there and normalised:

$$\mathbf{N} = \mathrm{normalize}\bigl(\nabla F(\mathbf{P}(t^*))\bigr)$$

The **Theory** tab walks through this derivation step by step for each shape. The tasks below ask you to redo it yourself — with pen and paper first, then in GLSL.

---

## Open the App

> **[https://andeplane.github.io/Raytracing](https://andeplane.github.io/Raytracing)**  
> (or run locally: `npm install && npm run dev`)

| Tab | What it does |
|---|---|
| **Theory** | Full mathematical derivation — refer back to this |
| **Intuition** | Aim a ray interactively, watch the polynomial roots update live |
| **Code** | ← **Your workspace** — the shader recompiles automatically as you type |

Your edits are **saved automatically** in your browser. The **↺ Reset** button restores the original starter code.

---

## How the Code Tab Works

Select a geometry from the dropdown in the header. Fill in **three functions**:

```glsl
// 1. Implicit surface — F(p) = 0 on the surface
float ObjectImplicit(vec3 p) { ... }

// 2. Outward unit normal at a surface point p — normalize(∇F(p))
vec3 ObjectNormal(vec3 p) { ... }

// 3. First positive intersection distance, or -1.0 on miss
float RayObject(vec3 ro, vec3 rd) { ... }
```

Everything else (camera, lighting, shading) is provided. Compilation errors appear in red at the bottom of the canvas.

---

## Reference: The Sphere (Worked Example)

The sphere shader is already complete. Read through it carefully — the same pattern repeats for cylinder and torus.

**Given:** a sphere of radius R centred at the origin.

**Step 1 — Write the implicit equation.**  
A point **p** is on the sphere when its distance from the origin equals R:

$$|\mathbf{p}|^2 = R^2 \quad\Longrightarrow\quad F(\mathbf{p}) = \mathbf{p}\cdot\mathbf{p} - R^2 = 0$$

**Step 2 — Substitute the ray.**  
Let **p** = **O** + t**D**. Expand |**O** + t**D**|² − R² = 0:

$$(\mathbf{D}\cdot\mathbf{D})\,t^2 + 2(\mathbf{O}\cdot\mathbf{D})\,t + (|\mathbf{O}|^2 - R^2) = 0$$

This is a quadratic at² + bt + c = 0 with:

$$a = \mathbf{D}\cdot\mathbf{D}, \qquad b = 2(\mathbf{O}\cdot\mathbf{D}), \qquad c = |\mathbf{O}|^2 - R^2$$

Discriminant Δ = (b/2)² − ac. If Δ < 0 the ray misses. The two roots are:

$$t = \frac{-(b/2) \pm \sqrt{\Delta}}{a}$$

**Step 3 — Derive the normal.**  
∇F(**p**) = 2**p**, so the outward unit normal is simply normalize(**p**) (the factor of 2 cancels).

```glsl
const float R = 0.5;

float ObjectImplicit(vec3 p) { return dot(p, p) - R * R; }

vec3 ObjectNormal(vec3 p) { return normalize(p); }

float RayObject(vec3 ro, vec3 rd) {
    float a     = dot(rd, rd);
    float halfB = dot(ro, rd);          // b/2 avoids the factor-of-2
    float c     = dot(ro, ro) - R * R;
    float disc  = halfB * halfB - a * c;
    if (disc < 0.0) return -1.0;
    float sqD = sqrt(disc);
    float t0  = (-halfB - sqD) / a;     // near root
    float t1  = (-halfB + sqD) / a;     // far root
    if (t0 > 0.0001) return t0;
    if (t1 > 0.0001) return t1;
    return -1.0;
}
```

---

## Part 1 — Cylinder

Select **🔷 Cylinder** from the dropdown. The canvas is black — the placeholder functions return constants. Work through the math below, then implement your results.

### Math tasks (do these on paper first)

**M1. Write the implicit equation for an infinite cylinder.**

An infinite cylinder has radius R and its axis along the **Y**-axis. A point **p** = (p_x, p_y, p_z) lies on the barrel when its distance from the Y-axis equals R.

> *What is the distance from a point (p_x, p_y, p_z) to the Y-axis?*  
> *Write F(**p**) = 0 for the barrel surface. Does F depend on p_y?*

**M2. Substitute the ray into F and derive the quadratic.**

Let **p** = **O** + t**D** = (O_x + tD_x, O_y + tD_y, O_z + tD_z).

> *Substitute into your F from M1 and expand. Collect the coefficients of t², t, and the constant term.*  
> *Compare to the sphere quadratic — what is different? What is the same?*

Expected result:

$$\underbrace{(D_x^2 + D_z^2)}_{a}\,t^2 + \underbrace{2(O_x D_x + O_z D_z)}_{b}\,t + \underbrace{(O_x^2 + O_z^2 - R^2)}_{c} = 0$$

> *Why do the Y components drop out completely?*

**M3. Derive the surface normal.**

You have F(**p**) from M1. Compute ∇F = (∂F/∂p_x, ∂F/∂p_y, ∂F/∂p_z).

> *What is ∂F/∂p_y? Why does that make geometric sense?*  
> *Write the outward unit normal at a barrel point **p**.*

**M4. Cap intersection (think through, don't implement yet).**

The cylinder has finite height H (half-height H/2 on each side). Two flat discs cap the ends at y = +H/2 and y = −H/2.

> *How do you find the parameter t where a ray crosses the plane y = H/2?*  
> *Once you have that t, what condition tells you the crossing point is inside the disc (not outside the rim)?*  
> *What happens if the ray direction D_y = 0?*

---

### Implementation tasks

**C1. Implement `ObjectImplicit`** using your answer from M1.

Hit **▶ Run**. Canvas still black (RayObject returns -1.0), but no red error means the equation is valid.

**C2. Implement `ObjectNormal`** using your answer from M3.

**C3. Implement `RayObject`** using your quadratic from M2. Mirror the sphere solver — same discriminant logic, different a/b/c.

You should now see a shaded tube. Drag to orbit around it.

**C4. Add finite caps (stretch goal)** using your analysis from M4.  
Reject barrel hits where |y(t)| > H/2. Add disc tests at y = ±H/2. Return the smallest valid positive t.

> **Check:** Switch to the **Intuition** tab and aim the ray at the end cap vs. the barrel side. How does the polynomial graph differ?

---

## Part 2 — Torus

Select **🍩 Torus** from the dropdown. The torus is significantly harder. Its implicit equation is **degree 4** — a ray can pierce it at up to **four** points.

### Background geometry

A torus is formed by revolving a circle of radius r (the tube) around an axis at distance R (the major radius). The result lives in the XZ plane by default, axis along Y.

A point **p** is on the torus when the distance from **p** to the nearest point on the central circle (the ring of radius R in the XZ plane) equals r.

### Math tasks (do these on paper first)

**M1. Derive the distance from a point p to the central circle.**

The central circle has radius R and lies in the XZ plane (y = 0). The nearest point on this circle to **p** = (p_x, p_y, p_z) is at distance R from the Y-axis in the XZ plane.

> *What is the distance from **p** to the nearest point on the ring?*  
> *Hint: first find the distance from **p** to the Y-axis, then subtract R.*

**M2. Write the implicit equation F(p) = 0.**

> *Set the expression from M1 equal to r and square both sides to eliminate the square root.*  
> *Expand and simplify. You should reach:*

$$F(\mathbf{p}) = \bigl(|\mathbf{p}|^2 + R^2 - r^2\bigr)^2 - 4R^2\bigl(p_x^2 + p_z^2\bigr) = 0$$

> *Why must we square? What does squaring introduce that we should be careful about?*

**M3. Explain why the ray–torus intersection is degree 4.**

> *F is degree 4 in **p**. The ray substitutes a degree-1 expression for **p**. Why does the result have degree 4 in t, not 8?*  
> *How many intersections can a line have with a torus? Sketch the cases: 0, 2, and 4 intersections.*

**M4. Derive the quartic coefficients.**

Define these auxiliary quantities (each is a scalar):

| Symbol | Value |
|--------|-------|
| α | dot(**D**, **D**) |
| β | 2 · dot(**O**, **D**) |
| γ | dot(**O**, **O**) + R² − r² |
| δ | D_x² + D_z² |
| ε | 2(O_x D_x + O_z D_z) |
| ζ | O_x² + O_z² |

> *Show that* |**P**(t)|² + R² − r² = αt² + βt + γ.  
> *Show that* P_x(t)² + P_z(t)² = δt² + εt + ζ.  
> *Now substitute these into F and expand. Collect the t⁴, t³, t², t¹, t⁰ terms.*

Expected quartic coefficients:

$$A = \alpha^2, \quad B = 2\alpha\beta, \quad C = \beta^2 + 2\alpha\gamma - 4R^2\delta$$
$$D_{\mathrm{coef}} = 2\beta\gamma - 4R^2\varepsilon, \quad E = \gamma^2 - 4R^2\zeta$$

**M5. Derive the surface normal.**

F(**p**) = (|**p**|² + R² − r²)² − 4R²(p_x² + p_z²). Differentiate with respect to each component.

> *Compute ∂F/∂p_x, ∂F/∂p_y, ∂F/∂p_z.*  
> *Let s = |**p**|² + R² − r². Write ∇F in terms of s, **p**, R, and r.*

Expected result:

$$\frac{\partial F}{\partial p_x} = 4p_x(s - 2R^2), \quad \frac{\partial F}{\partial p_y} = 4p_y \cdot s, \quad \frac{\partial F}{\partial p_z} = 4p_z(s - 2R^2)$$

> *Why does the Y component have a different formula than X and Z?  
> Hint: look at which term in F involves p_y.*

**M6. Why not solve the quartic analytically?**

Ferrari's formula (1540) gives a closed-form solution for quartics, but it is rarely used in practice.

> *Look up Ferrari's formula. How many arithmetic operations does it require?*  
> *A scan + bisect with N=64 uses roughly 64 evaluations of a 5-term polynomial. Which approach is simpler to implement? Which is more numerically stable?*

---

### Implementation tasks

**T1. Implement `ObjectImplicit`** using your F from M2.

**T2. Implement `ObjectNormal`** using your ∇F from M5.

**T3. Compute the quartic coefficients** (replace `return -1.0;` in `RayObject`). Use the Greek-letter table from M4.

No visual yet — but no compile errors means the coefficients are ready.

**T4. Solve the quartic — scan + bisect.**

Evaluate f(t) using **Horner's method** (numerically stable — avoids catastrophic cancellation):

```glsl
float evalQuartic(float A, float B, float C, float D, float E, float t) {
    return ((((A*t) + B)*t + C)*t + D)*t + E;
}
```

Scan [t_min, t_max] for sign changes, then bisect each bracket to 8 iterations. Return the smallest positive root.

You should now see a shaded torus. Drag to orbit. 🍩

> **Check:** Switch to **Intuition → 🍩 Torus** and drag the ray. Watch how all four roots of the quartic appear and merge as the ray grazes the torus surface. That is the discriminant condition playing out in real time.

**T5. Experiment (stretch goals)**

- **Increase N** (128, 256) — does quality improve at grazing angles?
- **Decrease N** (8, 16) — where do artefacts appear first?
- **Newton's method:** replace bisection with `t ← t − f(t)/f'(t)`, where f'(t) = 4At³ + 3Bt² + 2Ct + D_coef. Derive f'(t) from f(t) yourself. Does it converge in fewer steps?
- **Analytical quartic:** implement Neumark's quartic solver. Compare accuracy at grazing angles vs. scan + bisect.

---

## Summary

The same three-step pattern works for every implicit surface:

> 1. **Derive** F(**p**) = 0 from the geometry  
> 2. **Substitute** ray P(t) = O + tD → polynomial f(t) = 0  
> 3. **Find** the smallest positive root → evaluate N = normalize(∇F) at the hit

| Shape | F(**p**) = 0 | Poly degree | Normal |
|---|---|---|---|
| Sphere | **p**·**p** − R² | 2 | normalize(**p**) |
| Cylinder | p_x² + p_z² − R² | 2 | normalize(p_x, 0, p_z) |
| Torus | (‖**p**‖² + R² − r²)² − 4R²(p_x² + p_z²) | **4** | normalize(∇F(**p**)) |

Good luck — and enjoy the shapes!
