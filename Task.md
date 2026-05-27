# Ray Tracing: Intersection Mathematics
### A Hands-On Problem Set

---

## Before You Start — Open the App

This problem set comes with an interactive visualiser. Open it here:

> **[https://github.com/andeplane/Raytracing](https://github.com/andeplane/Raytracing)**

Follow the instructions on that page to run the app in your browser. Once it loads you will see three tabs:

| Tab | What it does |
|---|---|
| **Theory** | Textbook-style walkthrough with 3D scenes you can orbit |
| **Intuition** | Drag a ray across the near plane, watch the polynomial graph update in real time |
| **Code** | Write your own GLSL shader; click ▶ RUN to render it |

The **Intuition** tab will be your main tool during this problem set. Try it now:

1. Select **🔵 Sphere** from the geometry dropdown at the top.
2. Click and drag on the **Near Plane** canvas (small 2D grid in the right panel) to aim the ray.
3. Watch the **polynomial graph** on the right: the horizontal axis is the ray parameter $t$, the curve is the intersection equation $f(t)$. Green dots mark real roots — the actual hit points.
4. Move the ray until it just grazes the sphere. What happens to the two roots?
5. Move the ray so it misses completely. What happens to the curve?

---

## Background — The Ray

A **ray** is a half-line in 3D space:

$$\mathbf{P}(t) = \mathbf{O} + t\mathbf{D}, \qquad t \geq 0$$

- $\mathbf{O} = (O_x, O_y, O_z)$ — the **origin** (where the ray starts).
- $\mathbf{D} = (D_x, D_y, D_z)$ — the **direction** (usually normalised so $|\mathbf{D}| = 1$).
- $t$ — the **parameter**. At $t = 0$ you are at the origin; at $t = 1$ you are one unit along the ray.

The restriction $t \geq 0$ is essential: we only look *forward* along the ray. A root $t < 0$ would correspond to something *behind* the camera — physically real, but invisible.

> **Key idea.** Ray tracing turns a 3D visibility question into a 1D root-finding problem: given a ray and a surface, find the smallest positive $t$ such that $\mathbf{P}(t)$ lies on the surface.

---

## Part I — Sphere

### Theory

A sphere with centre $\mathbf{C}$ and radius $R$ is the set of all points $\mathbf{X}$ satisfying:

$$|\mathbf{X} - \mathbf{C}|^2 = R^2$$

Substituting the ray $\mathbf{X} = \mathbf{O} + t\mathbf{D}$ and letting $\mathbf{L} = \mathbf{O} - \mathbf{C}$:

$$|\mathbf{L} + t\mathbf{D}|^2 = R^2$$

Expanding using the dot product:

$$(\mathbf{D} \cdot \mathbf{D})\,t^2 + 2(\mathbf{L} \cdot \mathbf{D})\,t + (\mathbf{L} \cdot \mathbf{L} - R^2) = 0$$

This is a **quadratic** $at^2 + bt + c = 0$ with:

$$a = \mathbf{D} \cdot \mathbf{D}, \qquad b = 2(\mathbf{L} \cdot \mathbf{D}), \qquad c = |\mathbf{L}|^2 - R^2$$

The discriminant $\Delta = b^2 - 4ac$ controls the geometry:

| $\Delta$ | Geometric meaning |
|---|---|
| $\Delta < 0$ | ray misses the sphere entirely |
| $\Delta = 0$ | ray is tangent — grazes the sphere at exactly one point |
| $\Delta > 0$ | ray enters and exits — two distinct hit points |

The two roots are:

$$t = \frac{-b \pm \sqrt{\Delta}}{2a}$$

The **visible** hit is the smallest root with $t > \varepsilon$ (a tiny threshold that prevents the ray from immediately re-intersecting the surface it just left).

**Surface normal.** The sphere is an implicit surface $F(\mathbf{X}) = |\mathbf{X} - \mathbf{C}|^2 - R^2 = 0$. The normal direction is the gradient $\nabla F = 2(\mathbf{X} - \mathbf{C})$, so at a hit point $\mathbf{P}$:

$$\hat{\mathbf{N}} = \frac{\mathbf{P} - \mathbf{C}}{|\mathbf{P} - \mathbf{C}|}$$

The normal simply points outward from the centre — exactly as you would expect.

---

### Sphere Tasks

**S1.** In the Intuition tab, set the geometry to **🔵 Sphere** and move the ray so it passes through the centre of the sphere. How many roots does the quadratic have, and what is their relationship to each other? (*Hint: think about symmetry.*)

**S2.** The formula for $c$ is $|\mathbf{L}|^2 - R^2$, where $\mathbf{L} = \mathbf{O} - \mathbf{C}$.

- If $c < 0$, what does that say about where the ray origin is relative to the sphere?
- What can you conclude about the number of *positive* roots in this case?

**S3.** Suppose the ray direction $\mathbf{D}$ is already normalised ($|\mathbf{D}| = 1$). Show that $a = \mathbf{D} \cdot \mathbf{D} = 1$, and write a simplified version of the quadratic formula.

**S4. (Tangent condition)** A ray is tangent to the sphere if and only if $\Delta = 0$. In terms of $\mathbf{L}$ and $\mathbf{D}$, show that this means:

$$(\mathbf{L} \cdot \mathbf{D})^2 = |\mathbf{L}|^2 - R^2$$

Interpret each side geometrically. (*Hint: what is the projection of $\mathbf{L}$ onto $\mathbf{D}$?*)

**S5. (Normals and shading)** At a hit point $\mathbf{P}$, the surface normal is $\hat{\mathbf{N}} = (\mathbf{P} - \mathbf{C}) / R$. The simplest shading model colours a surface by $\max(0, \hat{\mathbf{N}} \cdot \hat{\mathbf{L}})$, where $\hat{\mathbf{L}}$ is the direction toward a light source. 

- Why do we take the $\max$ with 0?
- Why is the surface darkest at the silhouette (the outer edge of the sphere as seen by the camera)?

---

## Part II — Cylinder

Now it is your turn to derive the equations. We will do this in two stages: an infinite cylinder first, then a finite one with caps.

### Infinite Cylinder

An **infinite cylinder** with axis along the $z$-axis and radius $R$ is the set of all points $(x, y, z)$ satisfying:

$$x^2 + y^2 = R^2$$

More generally, a cylinder with axis through point $\mathbf{A}$ in direction $\hat{\mathbf{u}}$ (unit vector) is:

$$|\mathbf{X} - \mathbf{A} - [(\mathbf{X} - \mathbf{A}) \cdot \hat{\mathbf{u}}]\,\hat{\mathbf{u}}|^2 = R^2$$

This says: the *component of* $(\mathbf{X} - \mathbf{A})$ *perpendicular to the axis* has magnitude $R$.

**C1. (Derivation)** Substitute $\mathbf{X} = \mathbf{O} + t\mathbf{D}$ into the cylinder equation for an axis through the origin along $\hat{\mathbf{u}}$. Let $\mathbf{L} = \mathbf{O}$ (i.e., $\mathbf{A} = \mathbf{0}$) and define:

$$\mathbf{D}_\perp = \mathbf{D} - (\mathbf{D} \cdot \hat{\mathbf{u}})\,\hat{\mathbf{u}}, \qquad \mathbf{L}_\perp = \mathbf{L} - (\mathbf{L} \cdot \hat{\mathbf{u}})\,\hat{\mathbf{u}}$$

Show that the ray-cylinder intersection reduces to a quadratic in $t$:

$$at^2 + bt + c = 0$$

and find explicit expressions for $a$, $b$, $c$ in terms of $\mathbf{D}_\perp$, $\mathbf{L}_\perp$, and $R$.

(*Observe: this is the same degree as the sphere. Why? How are the two derivations structurally similar?*)

**C2. (Normals)** For the infinite cylinder, the surface normal at a hit point $\mathbf{P}$ is the vector from the *axis* to $\mathbf{P}$, perpendicular to the axis. Write the formula for this normal using the axis direction $\hat{\mathbf{u}}$ and the hit point $\mathbf{P}$.

**C3.** In the Intuition tab, switch to **🔷 Cylinder**. Aim the ray along the cylinder axis (so the ray travels parallel to the axis). What does the polynomial graph look like? Explain what happens algebraically — specifically, what value does $a = |\mathbf{D}_\perp|^2$ take in this case?

**C4.** Now aim the ray so that it hits the cylinder at a very oblique angle (nearly tangent). What does the graph show? What happens to the two roots as the ray approaches a tangent configuration?

---

### Finite Cylinder with Caps

A real cylinder has finite length. A **finite cylinder** between $z = z_{\min}$ and $z = z_{\max}$ (for the axis-aligned case) requires two additional tests:

1. **Lateral surface:** A root $t$ from the quadratic is valid only if the $z$-coordinate of the hit point satisfies $z_{\min} \leq P_z(t) \leq z_{\max}$.

2. **End caps:** Each cap is a **disk** — a plane clipped to the circle $x^2 + y^2 \leq R^2$.

**C5. (Cap intersection)** Derive the intersection of a ray with the disk at $z = z_{\max}$ (radius $R$, centred on the $z$-axis). In two steps:

- First find the $t$ at which the ray crosses the plane $z = z_{\max}$ (a linear equation — why?).
- Then test whether the hit point $(P_x, P_y)$ satisfies $P_x^2 + P_y^2 \leq R^2$.

**C6.** A finite cylinder can produce up to **three** hits in total (two on the lateral surface, one on a cap — or similar combinations). Is it possible to have *exactly* three intersections? Draw a picture of a ray configuration that achieves this, or argue why it is or is not possible.

**C7.** What is the surface normal on a flat end cap? Compare it to the normal on the lateral surface and explain geometrically why the two normals are perpendicular to each other.

---

## Part III — Torus

### Theory

A **torus** is generated by revolving a circle of radius $r$ (the *tube radius*) around an axis at distance $R$ (the *major radius*). Centred at the origin, aligned around the $z$-axis:

$$F(x,y,z) = \left(\sqrt{x^2 + y^2} - R\right)^2 + z^2 - r^2 = 0$$

or equivalently (squaring to remove the square root):

$$\boxed{\left(x^2 + y^2 + z^2 + R^2 - r^2\right)^2 = 4R^2(x^2 + y^2)}$$

Switch to **🍩 Torus** in the app. Orbit the scene in the Theory tab to get a feeling for the shape. Then go to the Intuition tab and observe how the polynomial graph changes.

---

### Deriving the Quartic

To intersect a ray with the torus, substitute $\mathbf{P}(t) = \mathbf{O} + t\mathbf{D}$ into the boxed equation above. Define the following scalar quantities:

$$\alpha = \mathbf{D} \cdot \mathbf{D}, \qquad \beta = 2(\mathbf{O} \cdot \mathbf{D}), \qquad \gamma = \mathbf{O} \cdot \mathbf{O} + R^2 - r^2$$

$$\delta = D_x^2 + D_y^2, \qquad \varepsilon = 2(O_x D_x + O_y D_y), \qquad \zeta = O_x^2 + O_y^2$$

**T1. (Setting up the substitution)** Show that after substituting $\mathbf{P}(t) = \mathbf{O} + t\mathbf{D}$:

$$x(t)^2 + y(t)^2 + z(t)^2 + R^2 - r^2 = \alpha t^2 + \beta t + \gamma$$

$$x(t)^2 + y(t)^2 = \delta t^2 + \varepsilon t + \zeta$$

(*Hint: just expand each sum and collect powers of $t$. The first one is $|\mathbf{P}(t)|^2 + R^2 - r^2$, so use the dot product.*)

**T2. (The quartic)** Using the results of T1, show that the torus equation becomes:

$$\left(\alpha t^2 + \beta t + \gamma\right)^2 - 4R^2\!\left(\delta t^2 + \varepsilon t + \zeta\right) = 0$$

Now expand this and collect terms by powers of $t$. Show that the result is:

$$At^4 + Bt^3 + Ct^2 + Dt + E = 0$$

and derive the coefficients:

$$A = \alpha^2, \quad B = 2\alpha\beta, \quad C = \beta^2 + 2\alpha\gamma - 4R^2\delta$$
$$D = 2\beta\gamma - 4R^2\varepsilon, \quad E = \gamma^2 - 4R^2\zeta$$

Check: which of $A, B, C, D, E$ can be zero, and what geometric situation does each zero correspond to?

---

### Thinking About Roots

A quartic equation has **four** roots in $\mathbb{C}$ (counting multiplicity), by the fundamental theorem of algebra. Not all of them are relevant — only real, positive roots correspond to actual ray-surface hits.

**T3. (Degree and geometry)** The torus equation $F(\mathbf{X}) = 0$ is degree **4** as a polynomial in $(x, y, z)$. Explain in one sentence why substituting a linear function $\mathbf{P}(t) = \mathbf{O} + t\mathbf{D}$ into a degree-$n$ polynomial always gives a polynomial of degree *at most* $n$ in $t$.

Fill in the table:

| Surface | Implicit degree | Ray equation degree | Max hits |
|---|---|---|---|
| Plane | 1 | ? | ? |
| Sphere | 2 | ? | ? |
| Cylinder | 2 | ? | ? |
| Torus | 4 | ? | ? |

**T4. (Complex roots)** Suppose the quartic $f(t) = 0$ has exactly two real roots and two complex roots. 

- What does this look like on the polynomial graph in the app?
- In physical terms, what does a *complex* root of $f(t) = 0$ mean? (A complex $t$ would give a complex point $\mathbf{P}(t)$ — does that point lie on the torus? What does it represent geometrically?)
- Complex roots of a real polynomial always come in **conjugate pairs** $a \pm bi$. Why? (*Hint: think about what happens when you substitute a complex number into a polynomial with real coefficients.*)

**T5. (Can there be exactly 3 real roots?)** 

The quartic $f(t)$ has real coefficients. Consider the claim: *"A ray can hit the torus in exactly 3 points."*

- If $f$ has a **repeated real root**, is that consistent with three distinct intersections? What does a repeated root mean geometrically (think about the graph touching the $t$-axis)?
- Using the fact that complex roots of real polynomials come in conjugate pairs, what are the *only* possible numbers of real roots of a degree-4 polynomial with real coefficients?
- Conclude: can a ray have exactly 3 genuine (distinct, positive) intersections with a torus? Why or why not?

**T6. (Maximum hits)** 

- In the Intuition tab, find a ray configuration with **4 green dots** on the graph. Describe the geometry: where is the ray relative to the torus?
- Now find a configuration with **2 green dots**, and one with **0 green dots**.
- Can you find a configuration with exactly **1 green dot** that is *not* a repeated root (i.e., the curve crosses the axis, not just touches it)? Think carefully about what this would require.

**T7. (The normal on a torus)**

For the torus $F(x,y,z) = (x^2 + y^2 + z^2 + R^2 - r^2)^2 - 4R^2(x^2 + y^2) = 0$, the surface normal is $\nabla F$.

Compute $\nabla F = \left(\frac{\partial F}{\partial x}, \frac{\partial F}{\partial y}, \frac{\partial F}{\partial z}\right)$ at a hit point $\mathbf{P} = (P_x, P_y, P_z)$ and simplify.

(*Hint: let $s = P_x^2 + P_y^2 + P_z^2 + R^2 - r^2$ and $q = P_x^2 + P_y^2$. You can express the answer neatly in terms of $s$ and $q$.*)

**T8. (Solving the quartic — a numerical challenge)**

Unlike the quadratic formula (degree 2) or even the cubic formula (degree 3, which exists but is complicated), solving a general quartic by hand is extremely tedious. However, because $f(t)$ has real coefficients and we only need real roots, numerical methods work very well.

One approach: **bisection and Newton's method.** Given that $f(t)$ is a smooth function, describe (in words or pseudocode) how you would:

1. Find an interval $[t_{\min}, t_{\max}]$ that is guaranteed to contain all positive real roots.
2. Use the *derivative* $f'(t)$ to find the local extrema of $f(t)$, splitting the real line into monotone pieces.
3. Apply bisection or Newton iteration on each monotone piece to locate each root.

*(You do not need to implement this — just describe the strategy.)*

---

## Bonus Problems

**B1. (Bounding box test)** Before testing a ray against a complex shape like a torus, renderers first test the ray against a simple **axis-aligned bounding box** (AABB). For the torus with major radius $R$ and tube radius $r$:

- What is the smallest axis-aligned box that contains the entire torus?
- The AABB test for a ray $\mathbf{P}(t) = \mathbf{O} + t\mathbf{D}$ uses three slab inequalities: $x_{\min} \leq O_x + tD_x \leq x_{\max}$, and similarly for $y$ and $z$. Show that each slab gives an interval $[t_a, t_b]$, and the ray hits the box iff these three intervals share a common point. Derive the formula for the interval intersection.
- Why is this test worth doing, even though it only gives a conservative bound?

**B2. (Self-intersecting torus)** What happens if $r > R$ — does the formula still make sense? Explore in the app. Does the equation $F(\mathbf{X}) = 0$ still describe a smooth surface, or does something singular happen? Can you find the singular set?

**B3. (Shadows)** A **shadow ray** starts at a surface hit point $\mathbf{P}$ and travels toward a light source $\mathbf{L}_\text{pos}$. Explain why:

1. The shadow ray must be offset by $\varepsilon\hat{\mathbf{N}}$ from the hit point.
2. Only roots satisfying $0 < t < |\mathbf{L}_\text{pos} - \mathbf{P}|$ count as blockers.

What would go wrong in practice if either condition were omitted?

**B4. (Reflection)** Given an incoming ray direction $\mathbf{I}$ (pointing *toward* the surface) and a unit normal $\hat{\mathbf{N}}$, derive the formula for the reflected direction:

$$\mathbf{R} = \mathbf{I} - 2(\mathbf{I} \cdot \hat{\mathbf{N}})\hat{\mathbf{N}}$$

from first principles. Verify that $|\mathbf{R}| = |\mathbf{I}|$ (reflection preserves speed) and that the angle of incidence equals the angle of reflection.

**B5. (Code challenge)** Open the **Code** tab. The editor contains a working GLSL shader that renders the torus. Try modifying `ObjectImplicit()` to render a different shape — for example, two spheres (the union of two spheres is a piecewise-quadratic intersection). You can take the minimum of two $f(t)$ values. What visual result do you get?

---

## Summary

| Shape | Equation | Ray intersect degree | Formula |
|---|---|---|---|
| Sphere | $\|\mathbf{X}-\mathbf{C}\|^2 = R^2$ | Quadratic | $\Delta = b^2 - 4ac$ |
| Cylinder | $\|\mathbf{X}_\perp\|^2 = R^2$ | Quadratic | $\Delta = b^2 - 4ac$ |
| Torus | $(x^2+y^2+z^2+R^2-r^2)^2 = 4R^2(x^2+y^2)$ | **Quartic** | Must solve $At^4+Bt^3+Ct^2+Dt+E=0$ |

The central pattern throughout is:

> **Implicit surface** $F(\mathbf{X}) = 0$ $\;\longrightarrow\;$ substitute the ray $\;\longrightarrow\;$ polynomial $f(t) = 0$ $\;\longrightarrow\;$ find smallest positive root.

Good luck — and enjoy the shapes!
