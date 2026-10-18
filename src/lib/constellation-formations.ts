import { SYMBOL_SHAPES } from "./constellation-symbols";

type Point = { x: number; y: number; z: number };
type Edge = readonly [number, number];
export type FormationFamily =
  | "geometry"
  | "knots"
  | "surfaces"
  | "botanical"
  | "shells"
  | "fractals"
  | "astronomy"
  | "curves"
  | "structures"
  | "waves"
  | "scifi"
  | "logos"
  | "anatomy";
type Shape = { family: FormationFamily; generate: (count: number) => Point[] };

const TAU = Math.PI * 2;
const PHI = (1 + Math.sqrt(5)) / 2;
const fract = (x: number) => x - Math.floor(x);
const p = (x: number, y: number, z = 0): Point => ({ x, y, z });
const mix = (a: Point, b: Point, t: number) =>
  p(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
const param = (
  family: FormationFamily,
  sample: (u: number, v: number, i: number) => Point,
): Shape => ({
  family,
  generate: (count) =>
    Array.from({ length: count }, (_, i) =>
      sample((i + 0.5) / count, fract(i * 0.61803398875), i),
    ),
});

function wire(
  vertices: Point[],
  edges?: Edge[],
  family: FormationFamily = "geometry",
): Shape {
  if (!edges) {
    let shortest = Infinity;
    const pairs: { edge: Edge; distance: number }[] = [];
    for (let a = 0; a < vertices.length; a++)
      for (let b = a + 1; b < vertices.length; b++) {
        const distance = Math.hypot(
          vertices[a].x - vertices[b].x,
          vertices[a].y - vertices[b].y,
          vertices[a].z - vertices[b].z,
        );
        shortest = Math.min(shortest, distance);
        pairs.push({ edge: [a, b], distance });
      }
    edges = pairs
      .filter((pair) => pair.distance <= shortest * 1.01)
      .map((pair) => pair.edge);
  }
  const segments = edges;
  const lengths = segments.map(([a, b]) =>
    Math.hypot(
      vertices[a].x - vertices[b].x,
      vertices[a].y - vertices[b].y,
      vertices[a].z - vertices[b].z,
    ),
  );
  const total = lengths.reduce((sum, length) => sum + length, 0);
  return param(family, (u) => {
    let cursor = u * total;
    let index = 0;
    while (index < lengths.length - 1 && cursor > lengths[index])
      cursor -= lengths[index++];
    return mix(
      vertices[segments[index][0]],
      vertices[segments[index][1]],
      cursor / lengths[index],
    );
  });
}

function prism(sides: number, twist = 0, topRadius = 1): Shape {
  const vertices = Array.from({ length: sides * 2 }, (_, i) => {
    const top = i >= sides;
    const angle = ((i % sides) * TAU) / sides + (top ? twist : 0);
    const radius = top ? topRadius : 1;
    return p(
      Math.cos(angle) * radius,
      top ? 0.7 : -0.7,
      Math.sin(angle) * radius,
    );
  });
  const edges: Edge[] = [];
  for (let i = 0; i < sides; i++)
    edges.push(
      [i, (i + 1) % sides],
      [i + sides, ((i + 1) % sides) + sides],
      [i, i + sides],
    );
  return wire(vertices, edges);
}
const tetra = [p(1, 1, 1), p(1, -1, -1), p(-1, 1, -1), p(-1, -1, 1)];
const icosa: Point[] = [],
  dodeca: Point[] = [],
  cubocta: Point[] = [];
for (const a of [-1, 1])
  for (const b of [-1, 1]) {
    icosa.push(p(0, a, b * PHI), p(a, b * PHI, 0), p(b * PHI, 0, a));
    dodeca.push(
      p(0, a / PHI, b * PHI),
      p(a / PHI, b * PHI, 0),
      p(b * PHI, 0, a / PHI),
    );
    cubocta.push(p(0, a, b), p(a, b, 0), p(b, 0, a));
    for (const c of [-1, 1]) dodeca.push(p(a, b, c));
  }

const torusKnot = (a: number, b: number) =>
  param("knots", (u) => {
    const t = u * TAU,
      r = 0.65 + 0.25 * Math.cos(b * t);
    return p(r * Math.cos(a * t), r * Math.sin(a * t), 0.35 * Math.sin(b * t));
  });
const harmonicKnot = (a: number, b: number, c: number, phase: number) =>
  param("knots", (u) =>
    p(
      Math.sin(a * u * TAU + phase),
      Math.sin(b * u * TAU),
      Math.cos(c * u * TAU) * 0.65,
    ),
  );
const surface = (sample: (u: number, v: number) => Point) =>
  param("surfaces", sample);
const flower = (petals: number, fold: number, cup: number) =>
  param("botanical", (u, v) => {
    const t = u * TAU,
      r = (0.55 + 0.4 * Math.cos(t * petals)) * (0.3 + 0.7 * Math.sqrt(v));
    return p(
      r * Math.cos(t),
      r * Math.sin(t),
      cup * r * r + fold * Math.sin(t * petals) * r,
    );
  });
const leaf = (lobes: number, spread: number, bend: number) =>
  param("botanical", (u, v) => {
    const y = u * 2 - 1,
      side = v * 2 - 1;
    const width =
      Math.sin(Math.PI * u) * spread * (0.7 + 0.3 * Math.cos(u * TAU * lobes));
    return p(
      side * width,
      y,
      bend * (1 - side * side) + 0.15 * Math.sin(y * 4),
    );
  });
const shell = (turns: number, growth: number, aperture: number, rise: number) =>
  param("shells", (u, v) => {
    const t = u * TAU * turns,
      radius = Math.exp((u - 1) * growth),
      a = v * TAU;
    return p(
      radius * (1 + aperture * Math.cos(a)) * Math.cos(t),
      radius * (1 + aperture * Math.cos(a)) * Math.sin(t),
      radius * aperture * Math.sin(a) + (u - 0.5) * rise,
    );
  });
const celestial = (sample: (u: number, v: number, i: number) => Point) =>
  param("astronomy", sample);
const curve = (sample: (t: number) => Point) =>
  param("curves", (u) => sample(u * TAU));
const structure = (sample: (u: number, v: number, i: number) => Point) =>
  param("structures", sample);
const wave = (sample: (u: number, v: number, i: number) => Point) =>
  param("waves", sample);

function implicitSurface(field: (point: Point) => number): Shape {
  let crossings: Point[] | null = null;
  return {
    family: "structures",
    generate: (count) => {
      if (!crossings) {
        crossings = [];
        const steps = 14;
        const coordinate = (n: number) => ((n / steps) * 2 - 1) * Math.PI;
        for (let x = 0; x <= steps; x++)
          for (let y = 0; y <= steps; y++)
            for (let z = 0; z <= steps; z++) {
              const start = p(coordinate(x), coordinate(y), coordinate(z));
              for (const axis of ["x", "y", "z"] as const) {
                if ((axis === "x" ? x : axis === "y" ? y : z) === steps)
                  continue;
                let a = start,
                  b = { ...start, [axis]: start[axis] + TAU / steps };
                let fa = field(a),
                  fb = field(b);
                if (fa * fb > 0 || Math.abs(fa - fb) < 1e-8) continue;
                for (let step = 0; step < 6; step++) {
                  const middle = mix(a, b, 0.5),
                    fm = field(middle);
                  if (fa * fm <= 0) {
                    b = middle;
                    fb = fm;
                  } else {
                    a = middle;
                    fa = fm;
                  }
                }
                crossings.push(mix(a, b, 0.5));
              }
            }
      }
      return Array.from({ length: count }, (_, i) => ({
        ...crossings![Math.floor(((i + 0.5) / count) * crossings!.length)],
      }));
    },
  };
}

function chaos(vertices: Point[], ratio: number, skipRepeat = false): Shape {
  return {
    family: "fractals",
    generate: (count) => {
      let current = p(0, 0, 0),
        state = 71249,
        previous = -1;
      const points: Point[] = [];
      for (let i = 0; i < count + 32; i++) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        let choice = Math.floor((state / 4294967296) * vertices.length);
        if (skipRepeat && choice === previous)
          choice = (choice + 1) % vertices.length;
        previous = choice;
        current = mix(current, vertices[choice], ratio);
        if (i >= 32) points.push(current);
      }
      return points;
    },
  };
}
function recursiveCurve(kind: "koch" | "dragon" | "levy"): Shape {
  let points =
    kind === "koch"
      ? [p(-1, -0.5), p(1, -0.5), p(0, 1.23), p(-1, -0.5)]
      : [p(-1, 0), p(1, 0)];
  for (let depth = 0; depth < (kind === "koch" ? 3 : 9); depth++) {
    const next: Point[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i],
        b = points[i + 1],
        dx = b.x - a.x,
        dy = b.y - a.y;
      next.push(a);
      if (kind === "koch")
        next.push(
          mix(a, b, 1 / 3),
          p(
            (a.x + b.x) / 2 + (dy * Math.sqrt(3)) / 6,
            (a.y + b.y) / 2 - (dx * Math.sqrt(3)) / 6,
          ),
          mix(a, b, 2 / 3),
        );
      else {
        const sign = kind === "dragon" && i % 2 ? -1 : 1;
        next.push(p((a.x + b.x - dy * sign) / 2, (a.y + b.y + dx * sign) / 2));
      }
    }
    next.push(points[points.length - 1]);
    points = next;
  }
  return wire(
    points,
    points.slice(1).map((_, i) => [i, i + 1] as const),
    "fractals",
  );
}
function branching(fan: boolean): Shape {
  const vertices: Point[] = [p(0, -1, 0)],
    edges: Edge[] = [];
  function grow(parent: number, angle: number, length: number, depth: number) {
    const start = vertices[parent];
    const end = p(
      start.x + Math.sin(angle) * length,
      start.y + Math.cos(angle) * length,
      start.z + Math.sin(angle * 2) * length * 0.25,
    );
    const index = vertices.push(end) - 1;
    edges.push([parent, index]);
    if (depth)
      for (const offset of fan ? [-0.65, 0, 0.65] : [-0.5, 0.5])
        grow(index, angle + offset, length * 0.66, depth - 1);
  }
  grow(0, 0, 0.9, fan ? 4 : 6);
  return wire(vertices, edges, "fractals");
}
const carpet = (sponge: boolean): Shape => ({
  family: "fractals",
  generate: (count) => {
    const points: Point[] = [];
    let state = 1729;
    for (let i = 0; i < count; i++) {
      let x = 0,
        y = 0,
        z = 0,
        scale = 1;
      for (let depth = 0; depth < 4; depth++) {
        let a: number, b: number, c: number;
        do {
          state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
          a = (state % 3) - 1;
          b = (Math.floor(state / 3) % 3) - 1;
          c = sponge ? (Math.floor(state / 9) % 3) - 1 : 0;
        } while (
          sponge
            ? Number(a === 0) + Number(b === 0) + Number(c === 0) > 1
            : a === 0 && b === 0
        );
        scale /= 3;
        x += a * scale;
        y += b * scale;
        z += c * scale;
      }
      points.push(p(x, y, z));
    }
    return points;
  },
});

// The original ten families of ten shapes, plus recognizable figures and logos.
// Every entry describes geometry, rather than a
// rotated or renamed copy of another formation.
const SHAPES = {
  Tetrahedron: wire(tetra),
  Octahedron: wire([
    p(1, 0, 0),
    p(-1, 0, 0),
    p(0, 1, 0),
    p(0, -1, 0),
    p(0, 0, 1),
    p(0, 0, -1),
  ]),
  Icosahedron: wire(icosa),
  Dodecahedron: wire(dodeca),
  Cuboctahedron: wire(cubocta),
  "Triangular Prism": prism(3),
  "Pentagonal Prism": prism(5),
  "Hexagonal Prism": prism(6),
  "Twisted Prism": prism(4, Math.PI / 4),
  "Truncated Pyramid": prism(4, 0, 0.3),

  Cinquefoil: torusKnot(2, 5),
  Septfoil: torusKnot(2, 7),
  "Threefold Knot": torusKnot(3, 4),
  "Star Knot": torusKnot(3, 5),
  "Ninefold Knot": torusKnot(4, 5),
  "Figure Eight": harmonicKnot(2, 3, 4, 0.4),
  "Celtic Weave": harmonicKnot(3, 4, 5, 0.7),
  "Lattice Knot": harmonicKnot(3, 5, 7, 0.2),
  "Endless Knot": harmonicKnot(4, 5, 7, 1.1),
  "Braided Knot": harmonicKnot(5, 7, 9, 0.6),

  "Mobius Strip": surface((u, v) => {
    const t = u * TAU,
      s = (v - 0.5) * 0.7,
      r = 0.7 + s * Math.cos(t / 2);
    return p(r * Math.cos(t), r * Math.sin(t), s * Math.sin(t / 2));
  }),
  "Klein Bottle": surface((u, v) => {
    const t = u * TAU,
      a = v * TAU,
      r = 1 + Math.cos(t / 2) * Math.sin(a) - Math.sin(t / 2) * Math.sin(2 * a);
    return p(
      r * Math.cos(t),
      r * Math.sin(t),
      Math.sin(t / 2) * Math.sin(a) + Math.cos(t / 2) * Math.sin(2 * a),
    );
  }),
  Catenoid: surface((u, v) => {
    const y = u * 2 - 1,
      r = 0.45 * Math.cosh(y * 1.2);
    return p(r * Math.cos(v * TAU), y, r * Math.sin(v * TAU));
  }),
  Helicoid: surface((u, v) =>
    p(
      (v * 2 - 1) * Math.cos(u * TAU * 2),
      (u - 0.5) * 2,
      (v * 2 - 1) * Math.sin(u * TAU * 2),
    ),
  ),
  Enneper: surface((u, v) => {
    const a = u * 2 - 1,
      b = v * 2 - 1;
    return p(
      a - a ** 3 / 3 + a * b * b,
      b - b ** 3 / 3 + b * a * a,
      a * a - b * b,
    );
  }),
  Hyperboloid: surface((u, v) => {
    const y = (u - 0.5) * 2,
      r = 0.45 * Math.sqrt(1 + y * y * 3);
    return p(r * Math.cos(v * TAU), y, r * Math.sin(v * TAU));
  }),
  "Monkey Saddle": surface((u, v) => {
    const x = u * 2 - 1,
      y = v * 2 - 1;
    return p(x, y, (x ** 3 - 3 * x * y * y) * 0.4);
  }),
  "Spiral Cone": surface((u, v) =>
    p(u * Math.cos(v * TAU), 1 - u * 2, u * Math.sin(v * TAU)),
  ),
  "Barrel Vault": surface((u, v) =>
    p(Math.cos(u * Math.PI), Math.sin(u * Math.PI), (v - 0.5) * 2),
  ),
  "Twisted Ribbon": surface((u, v) =>
    p(
      (v - 0.5) * Math.cos(u * TAU * 1.5),
      u * 2 - 1,
      (v - 0.5) * Math.sin(u * TAU * 1.5),
    ),
  ),

  Lotus: flower(8, 0.15, 0.7),
  Orchid: flower(3, 0.5, -0.2),
  Daisy: flower(12, 0.05, 0.15),
  Iris: flower(6, 0.55, 0.3),
  Sunflower: param("botanical", (u, _, i) =>
    p(
      Math.sqrt(u) * Math.cos(i * 2.3999632297),
      Math.sqrt(u) * Math.sin(i * 2.3999632297),
      0.3 * (1 - u),
    ),
  ),
  Fern: param("botanical", (u, v, i) => {
    const branch = (i % 18) / 17,
      side = i % 2 ? 1 : -1;
    return p(
      side * Math.sin(branch * Math.PI) * v * 0.7,
      branch * 2 - 1 + v * 0.25,
      Math.sin(v * Math.PI) * 0.15,
    );
  }),
  Palm: param("botanical", (u, v, i) => {
    const a = ((i % 9) * TAU) / 9;
    return p(
      Math.sin(v * 1.9) * Math.cos(a),
      0.7 - v * v,
      Math.sin(v * 1.9) * Math.sin(a),
    );
  }),
  Ginkgo: param("botanical", (u, v) => {
    const a = (u - 0.5) * Math.PI * 1.4,
      r = Math.sqrt(v) * (0.8 + 0.12 * Math.cos(a * 12));
    return p(Math.sin(a) * r, Math.cos(a) * r, r * r * 0.25);
  }),
  Maple: leaf(5, 1.2, 0.15),
  Willow: leaf(1, 0.45, 0.5),

  Nautilus: shell(2.8, 2.8, 0.35, 0.1),
  Conch: shell(3.5, 2.1, 0.5, 2),
  Whelk: shell(4.5, 3, 0.28, 3),
  "Trumpet Shell": shell(1.4, 4, 0.7, 0.8),
  "Ram Horn": shell(1.2, 1.4, 0.2, 0.1),
  Ammonite: shell(4, 1.8, 0.1, 0.02),
  Scallop: param("shells", (u, v) => {
    const a = u * Math.PI,
      r = Math.sqrt(v) * (0.88 + 0.12 * Math.cos(a * 18));
    return p(Math.cos(a) * r, Math.sin(a) * r, Math.sin(v * Math.PI) * 0.28);
  }),
  Clam: param("shells", (u, v, i) => {
    const a = u * TAU;
    return p(
      Math.cos(a) * Math.sqrt(v),
      Math.sin(a) * Math.sqrt(v) * 0.7,
      (i % 2 ? 1 : -1) * Math.sin(v * Math.PI) * 0.25,
    );
  }),
  "Sea Urchin": param("shells", (u, v) => {
    const y = u * 2 - 1,
      r = Math.sqrt(1 - y * y),
      a = v * TAU,
      spine = 0.75 + 0.25 * Math.cos(a * 14) * Math.cos(u * Math.PI * 12);
    return p(r * Math.cos(a) * spine, y * spine, r * Math.sin(a) * spine);
  }),
  Jellyfish: param("shells", (u, v, i) => {
    const a = ((i % 12) * TAU) / 12;
    return u < 0.5
      ? p(
          Math.cos(v * TAU) * Math.sin(u * Math.PI),
          Math.cos(u * Math.PI) * 0.6,
          Math.sin(v * TAU) * Math.sin(u * Math.PI),
        )
      : p(
          Math.cos(a) * 0.65 + Math.sin(u * 22) * 0.1,
          -((u - 0.5) * 3),
          Math.sin(a) * 0.65,
        );
  }),

  "Sierpinski Tetrahedron": chaos(tetra, 0.5),
  "Sierpinski Triangle": chaos([p(-1, -0.7), p(1, -0.7), p(0, 1)], 0.5),
  "Sierpinski Carpet": carpet(false),
  "Menger Sponge": carpet(true),
  "Pentagonal Dust": chaos(
    Array.from({ length: 5 }, (_, i) =>
      p(Math.cos((i * TAU) / 5), Math.sin((i * TAU) / 5)),
    ),
    0.56,
    true,
  ),
  "Koch Snowflake": recursiveCurve("koch"),
  "Dragon Curve": recursiveCurve("dragon"),
  "Levy Curve": recursiveCurve("levy"),
  "Binary Canopy": branching(false),
  "Coral Branches": branching(true),

  Saturn: celestial((u, v, i) => {
    const a = v * TAU;
    if (i % 3) {
      const y = u * 2 - 1,
        r = Math.sqrt(1 - y * y) * 0.5;
      return p(r * Math.cos(a), y * 0.5, r * Math.sin(a));
    }
    const r = 0.75 + u * 0.25;
    return p(Math.cos(a) * r, Math.sin(a) * r * 0.2, Math.sin(a) * r);
  }),
  "Binary Orbit": celestial((u, v, i) => {
    const side = i % 2 ? 1 : -1,
      a = u * TAU * 2;
    return p(
      side * 0.5 + Math.cos(a) * 0.38,
      Math.sin(a) * 0.5,
      Math.sin(v * TAU) * 0.18,
    );
  }),
  "Trinary Orbit": celestial((u, v, i) => {
    const a = ((i % 3) * TAU) / 3,
      t = u * TAU;
    return p(
      Math.cos(a) * 0.6 + Math.cos(t) * 0.3,
      Math.sin(a) * 0.6 + Math.sin(t) * 0.3,
      Math.sin(v * TAU) * 0.15,
    );
  }),
  Armillary: celestial((u, _, i) => {
    const ring = i % 5,
      a = u * TAU,
      tilt = (ring * Math.PI) / 5;
    return p(
      Math.cos(a),
      Math.sin(a) * Math.cos(tilt),
      Math.sin(a) * Math.sin(tilt),
    );
  }),
  Astrolabe: celestial((u, _, i) => {
    const ring = i % 4,
      r = 0.3 + ring * 0.22,
      a = u * TAU;
    return p(Math.cos(a) * r, Math.sin(a) * r, Math.sin(a * 2) * ring * 0.08);
  }),
  "Accretion Disk": celestial((u, v) => {
    const a = u * TAU * 5,
      r = 0.25 + Math.sqrt(v) * 0.75;
    return p(Math.cos(a) * r, Math.sin(a) * r, (Math.sin(a * 2) * 0.1) / r);
  }),
  Pulsar: celestial((u, v, i) =>
    i % 3
      ? p(
          Math.cos(v * TAU) * 0.35,
          Math.sin(v * TAU) * 0.35,
          Math.cos(u * Math.PI) * 0.35,
        )
      : p(Math.sin(u * 25) * 0.12, u * 2 - 1, Math.cos(u * 25) * 0.12),
  ),
  Comet: celestial((u, v) =>
    p(
      u * 2 - 1,
      Math.cos(v * TAU) * (0.08 + u * u * 0.5),
      Math.sin(v * TAU) * (0.08 + u * u * 0.5),
    ),
  ),
  "Spiral Galaxy": celestial((u, v, i) => {
    const a = u * TAU * 1.5 + ((i % 5) * TAU) / 5,
      r = Math.sqrt(u);
    return p(Math.cos(a) * r, Math.sin(a) * r, (v - 0.5) * (1 - u) * 0.35);
  }),
  "Lens Galaxy": celestial((u, v) => {
    const y = u * 2 - 1,
      a = v * TAU,
      r = Math.sqrt(1 - y * y);
    return p(r * Math.cos(a), y * 0.28, r * Math.sin(a));
  }),

  Butterfly: curve((t) => {
    t *= 6;
    const r =
      Math.exp(Math.cos(t)) - 2 * Math.cos(4 * t) - Math.sin(t / 12) ** 5;
    return p(Math.sin(t) * r, -Math.cos(t) * r, Math.sin(t * 3) * 0.3);
  }),
  Heart: curve((t) =>
    p(
      16 * Math.sin(t) ** 3,
      -13 * Math.cos(t) +
        5 * Math.cos(2 * t) +
        2 * Math.cos(3 * t) +
        Math.cos(4 * t),
      Math.sin(t * 2) * 2,
    ),
  ),
  Infinity: curve((t) =>
    p(
      Math.cos(t) / (1 + Math.sin(t) ** 2),
      (Math.sin(t) * Math.cos(t)) / (1 + Math.sin(t) ** 2),
      Math.sin(t) * 0.15,
    ),
  ),
  Viviani: curve((t) =>
    p(1 + Math.cos(t * 2), Math.sin(t * 2), 2 * Math.sin(t)),
  ),
  Deltoid: curve((t) =>
    p(
      2 * Math.cos(t) + Math.cos(2 * t),
      2 * Math.sin(t) - Math.sin(2 * t),
      Math.sin(3 * t) * 0.2,
    ),
  ),
  Astroid: curve((t) =>
    p(Math.cos(t) ** 3, Math.sin(t) ** 3, Math.sin(2 * t) * 0.15),
  ),
  Hypotrochoid: curve((t) =>
    p(
      3 * Math.cos(t) + 1.5 * Math.cos(5 * t),
      3 * Math.sin(t) - 1.5 * Math.sin(5 * t),
      Math.sin(3 * t),
    ),
  ),
  Epitrochoid: curve((t) =>
    p(
      3 * Math.cos(t) - Math.cos(4 * t),
      3 * Math.sin(t) - Math.sin(4 * t),
      Math.cos(5 * t) * 0.4,
    ),
  ),
  "Spherical Spiral": curve((t) => {
    const y = t / Math.PI - 1,
      r = Math.sqrt(Math.max(0, 1 - y * y));
    return p(r * Math.cos(t * 7), y, r * Math.sin(t * 7));
  }),
  "Tennis Seam": curve((t) =>
    p(
      Math.cos(t),
      Math.sin(t) * Math.cos(Math.sin(t) * 1.2),
      Math.sin(t) * Math.sin(Math.sin(t) * 1.2),
    ),
  ),

  "DNA Ladder": structure((u, _, i) => {
    const t = u * TAU * 2.5,
      r = i % 4 === 0 ? Math.sin(i * 2.4) * 0.5 : i % 2 ? 0.5 : -0.5;
    return p(r * Math.cos(t), u * 2 - 1, r * Math.sin(t));
  }),
  Chain: structure((u, _, i) => {
    const ring = i % 4,
      a = u * TAU * 4;
    return ring % 2
      ? p((ring - 1.5) * 0.55 + Math.cos(a) * 0.35, Math.sin(a) * 0.3, 0)
      : p((ring - 1.5) * 0.55 + Math.cos(a) * 0.35, 0, Math.sin(a) * 0.3);
  }),
  Gyroid: implicitSurface(
    ({ x, y, z }) =>
      Math.sin(x) * Math.cos(y) +
      Math.sin(y) * Math.cos(z) +
      Math.sin(z) * Math.cos(x),
  ),
  "Diamond Lattice": structure((u, v, i) => {
    const cell = i % 27,
      x = ((cell % 3) - 1) * 0.65,
      y = ((Math.floor(cell / 3) % 3) - 1) * 0.65,
      z = (Math.floor(cell / 9) - 1) * 0.65,
      arm = tetra[Math.floor(i / 27) % 4];
    return p(x + arm.x * v * 0.25, y + arm.y * v * 0.25, z + arm.z * v * 0.25);
  }),
  "Cubic Lattice": structure((u, _, i) => {
    const a = ((i % 4) / 3) * 2 - 1,
      b = ((Math.floor(i / 4) % 4) / 3) * 2 - 1,
      axis = Math.floor(i / 16) % 3;
    return axis === 0
      ? p(u * 2 - 1, a, b)
      : axis === 1
        ? p(a, u * 2 - 1, b)
        : p(a, b, u * 2 - 1);
  }),
  Honeycomb: structure((u, _, i) => {
    const cell = i % 7,
      a = u * TAU * 7,
      cx = cell ? Math.cos(((cell - 1) * TAU) / 6) * 0.6 : 0,
      cy = cell ? Math.sin(((cell - 1) * TAU) / 6) * 0.6 : 0;
    const r =
      (0.34 * Math.cos(Math.PI / 6)) / Math.cos((a % (TAU / 6)) - Math.PI / 6);
    return p(
      cx + r * Math.cos(a),
      cy + r * Math.sin(a),
      Math.sin(a * 3) * 0.05,
    );
  }),
  "Double Cone": structure((u, v) => {
    const y = u * 2 - 1,
      r = 1 - Math.abs(y);
    return p(r * Math.cos(v * TAU), y, r * Math.sin(v * TAU));
  }),
  Hourglass: structure((u, v) => {
    const y = u * 2 - 1,
      r = 0.12 + Math.abs(y) * 0.8;
    return p(r * Math.cos(v * TAU), y, r * Math.sin(v * TAU));
  }),
  "Torus Grid": structure((u, v, i) => {
    const ring = i % 8,
      a = (ring * TAU) / 8,
      b = u * TAU;
    return i % 2
      ? p(
          (0.7 + Math.cos(a) * 0.25) * Math.cos(b),
          (0.7 + Math.cos(a) * 0.25) * Math.sin(b),
          Math.sin(a) * 0.25,
        )
      : p(
          (0.7 + Math.cos(b) * 0.25) * Math.cos(a),
          (0.7 + Math.cos(b) * 0.25) * Math.sin(a),
          Math.sin(b) * 0.25,
        );
  }),
  "Geodesic Dome": structure((u, v) => {
    const r = Math.sqrt(1 - u * u),
      a = v * TAU;
    return p(r * Math.cos(a), u, r * Math.sin(a));
  }),

  "Ripple Disk": wave((u, v) => {
    const r = Math.sqrt(u),
      a = v * TAU;
    return p(r * Math.cos(a), Math.sin(r * TAU * 3) * 0.2, r * Math.sin(a));
  }),
  "Standing Wave": wave((u, v) => {
    const x = u * 2 - 1,
      y = v * 2 - 1;
    return p(
      x,
      y,
      Math.sin(x * Math.PI * 2) * Math.sin(y * Math.PI * 3) * 0.45,
    );
  }),
  Chladni: wave((u, _, i) => {
    const x = u * 2 - 1,
      branch = i % 6,
      y = ((branch / 5) * 2 - 1) * Math.cos(x * Math.PI * 1.5);
    return p(x, y, Math.sin(x * 9 + branch) * 0.08);
  }),
  "Vortex Funnel": wave((u, v) => {
    const r = 0.15 + u * 0.85,
      a = v * TAU + u * 8;
    return p(r * Math.cos(a), Math.log(r) * 0.6, r * Math.sin(a));
  }),
  "Sea Fan": wave((u, _, i) => {
    const a = ((i % 17) / 16) * Math.PI - Math.PI / 2;
    return p(Math.sin(a) * u, Math.cos(a) * u, Math.sin(u * 9 + a) * u * 0.2);
  }),
  Soliton: wave((u, v) => {
    const x = u * 2 - 1;
    return p(x, 0.8 / Math.cosh(x * 4) ** 2, (v - 0.5) * 0.9);
  }),
  "Wave Packet": wave((u, v) => {
    const x = u * 2 - 1;
    return p(x, Math.cos(x * 15) * Math.exp(-x * x * 3) * 0.7, (v - 0.5) * 0.7);
  }),
  "Ripple Sphere": wave((u, v) => {
    const y = u * 2 - 1,
      a = v * TAU,
      r = Math.sqrt(1 - y * y) * (0.8 + Math.sin(u * TAU * 5) * 0.2);
    return p(r * Math.cos(a), y, r * Math.sin(a));
  }),
  "Woven Grid": wave((u, _, i) => {
    const lane = ((i % 12) / 11) * 2 - 1,
      t = u * 2 - 1;
    return i % 2
      ? p(t, lane, Math.sin(t * Math.PI * 6) * 0.16)
      : p(lane, t, -Math.sin(t * Math.PI * 6) * 0.16);
  }),
  "Aurora Curtain": wave((u, v) => {
    const a = u * TAU;
    return p(
      Math.cos(a) * (0.65 + Math.sin(a * 5) * 0.2),
      (v - 0.5) * (1 + Math.sin(a * 3) * 0.5),
      Math.sin(a) * 0.65,
    );
  }),
  ...SYMBOL_SHAPES,
} satisfies Record<string, Shape>;

export type ExtraFormation = keyof typeof SHAPES;
export const EXTRA_FORMATIONS = Object.keys(SHAPES) as ExtraFormation[];
const shapes: Readonly<Record<string, Shape | undefined>> = SHAPES;
// Only the current morph and a few recent geometries need to remain in memory.
const cache = new Map<string, Point[]>();

export function extraFormationFamily(name: string) {
  return shapes[name]?.family ?? null;
}

export function extraFormationPoint(
  name: string,
  index: number,
  count: number,
): Point | null {
  const shape = shapes[name];
  if (!shape) return null;
  const key = `${name}:${count}`;
  let points = cache.get(key);
  if (!points) {
    points = shape.generate(count);
    const min = p(Infinity, Infinity, Infinity),
      max = p(-Infinity, -Infinity, -Infinity);
    for (const point of points)
      for (const axis of ["x", "y", "z"] as const) {
        min[axis] = Math.min(min[axis], point[axis]);
        max[axis] = Math.max(max[axis], point[axis]);
      }
    const center = mix(min, max, 0.5);
    let radius = 0;
    for (const point of points) {
      point.x -= center.x;
      point.y -= center.y;
      point.z -= center.z;
      radius = Math.max(radius, Math.hypot(point.x, point.y, point.z));
    }
    const scale =
      (shape.family === "scifi" ? 0.9 : 1.05) / Math.max(0.001, radius);
    for (const point of points) {
      point.x *= scale;
      point.y *= scale;
      point.z *= scale;
    }
    if (cache.size >= 6) cache.delete(cache.keys().next().value!);
    cache.set(key, points);
  }
  return points[index];
}
