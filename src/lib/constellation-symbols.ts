import outlines from "./constellation-logo-outlines.json";

type Point = { x: number; y: number; z: number };
type Stroke = { points: Point[]; weight?: number };
type SymbolShape = {
  family: "scifi" | "logos" | "anatomy";
  generate: (count: number) => Point[];
};
const TAU = Math.PI * 2;
const p = (x: number, y: number, z = 0): Point => ({ x, y, z });
const line = (...points: Point[]): Stroke => ({ points });
const loop = (...points: Point[]): Stroke => ({
  points: [...points, points[0]],
});
const ellipse = (x: number, y: number, rx: number, ry = rx, z = 0): Stroke => ({
  points: Array.from({ length: 65 }, (_, i) =>
    p(x + Math.cos((i / 64) * TAU) * rx, y + Math.sin((i / 64) * TAU) * ry, z),
  ),
});

/** Allocate stars to separate contours, including small features at low quality. */
function drawing(
  family: SymbolShape["family"],
  strokes: Stroke[],
): SymbolShape {
  const segments = strokes.map(({ points, weight = 1 }) => {
    const lengths = points
      .slice(1)
      .map((point, i) =>
        Math.hypot(
          point.x - points[i].x,
          point.y - points[i].y,
          point.z - points[i].z,
        ),
      );
    const length = lengths.reduce((sum, value) => sum + value, 0);
    return { points, lengths, length, weight: length * weight };
  });
  const total = segments.reduce((sum, segment) => sum + segment.weight, 0);
  return {
    family,
    generate(count) {
      const minimum = count >= segments.length * 2 ? 2 : 0;
      const remaining = count - minimum * segments.length;
      const allocations = segments.map((segment, index) => {
        const exact = (remaining * segment.weight) / total;
        return {
          index,
          count: Math.floor(exact) + minimum,
          fraction: exact % 1,
        };
      });
      const missing =
        count -
        allocations.reduce((sum, allocation) => sum + allocation.count, 0);
      const ranked = [...allocations].sort((a, b) => b.fraction - a.fraction);
      for (let i = 0; i < missing; i++) ranked[i].count++;
      return allocations.flatMap(({ index, count: stars }) => {
        const { points, lengths, length } = segments[index];
        return Array.from({ length: stars }, (_, i) => {
          let distance = ((i + 0.5) / stars) * length,
            edge = 0;
          while (edge < lengths.length - 1 && distance > lengths[edge])
            distance -= lengths[edge++];
          const a = points[edge],
            b = points[edge + 1],
            t = distance / Math.max(0.000001, lengths[edge]);
          return p(
            a.x + (b.x - a.x) * t,
            a.y + (b.y - a.y) * t,
            a.z + (b.z - a.z) * t,
          );
        });
      });
    },
  };
}

function logo(name: keyof typeof outlines) {
  // Sampled from the official Nike/Jordan and Apple navigation vectors.
  // Sources are retained with the local outlines; no runtime requests are made.
  return drawing(
    "logos",
    outlines[name].contours.map((contour) =>
      loop(...contour.map(([x, y]) => p(x, y))),
    ),
  );
}

function deathStar(incomplete = false): SymbolShape {
  const panels: Stroke[] = [{ ...ellipse(0, 0, 1), weight: 2 }];
  // Show the visible hemisphere, reserving stars for the trench and superlaser dish.
  for (const y of [-0.72, -0.48, 0.38, 0.7]) {
    const radius = Math.sqrt(1 - y * y);
    panels.push({
      points: Array.from({ length: 65 }, (_, i) => {
        const x = ((i / 64) * 2 - 1) * radius;
        return p(x, y, Math.sqrt(Math.max(0, 1 - x * x - y * y)) * 0.3);
      }),
      weight: 0.45,
    });
  }
  for (const longitude of [-0.65, -0.27, 0.27, 0.65])
    panels.push({
      points: Array.from({ length: 65 }, (_, i) => {
        const y = (i / 64) * 1.96 - 0.98,
          x = longitude * Math.sqrt(1 - y * y);
        return p(x, y, Math.sqrt(Math.max(0, 1 - x * x - y * y)) * 0.3);
      }),
      weight: 0.4,
    });
  const strokes = panels.flatMap((stroke) => {
    const parts: Stroke[] = [],
      points: Point[] = [];
    const flush = () => {
      if (points.length > 1)
        parts.push({ points: [...points], weight: stroke.weight });
      points.length = 0;
    };
    for (const point of stroke.points) {
      const dish = Math.hypot(point.x + 0.34, point.y + 0.4) < 0.3;
      const missing = incomplete && point.x > 0.12 && point.y < -0.12;
      if (dish || missing) flush();
      else points.push(point);
    }
    flush();
    return parts;
  });
  for (const y of [-0.04, 0.04])
    strokes.push({
      points: Array.from({ length: 65 }, (_, i) => {
        const x = (i / 64) * 2 - 1;
        return p(x, y, Math.sqrt(1 - x * x) * 0.3);
      }),
      weight: 1.3,
    });
  for (const [r, weight] of [
    [0.28, 2.2],
    [0.19, 1.8],
    [0.045, 1.2],
  ])
    strokes.push({
      ...ellipse(-0.34, -0.4, r, r, 0.22 - (0.28 - r) * 0.3),
      weight,
    });
  if (incomplete) {
    strokes.push({
      points: [
        p(0.12, -0.99),
        p(0.12, -0.66),
        p(0.34, -0.66),
        p(0.34, -0.48),
        p(0.53, -0.48),
        p(0.53, -0.27),
        p(0.77, -0.27),
        p(0.77, -0.12),
        p(0.99, -0.12),
      ],
      weight: 1.1,
    });
    for (const [x, y] of [
      [0.2, -0.6],
      [0.42, -0.42],
      [0.62, -0.22],
    ])
      strokes.push(
        line(p(x, y, 0.08), p(x, y + 0.23, 0.18), p(x + 0.11, y + 0.23, 0.12)),
      );
  }
  return drawing("scifi", strokes);
}

function skull(crossbones = false) {
  const strokes: Stroke[] = [
    loop(
      p(-0.42, 0.3),
      p(-0.59, 0.15),
      p(-0.66, -0.15),
      p(-0.62, -0.5),
      p(-0.46, -0.76),
      p(-0.2, -0.9),
      p(0.2, -0.9),
      p(0.46, -0.76),
      p(0.62, -0.5),
      p(0.66, -0.15),
      p(0.59, 0.15),
      p(0.42, 0.3),
      p(0.38, 0.65),
      p(0.22, 0.78),
      p(-0.22, 0.78),
      p(-0.38, 0.65),
    ),
    { ...ellipse(-0.28, -0.12, 0.205, 0.18, 0.09), weight: 1.4 },
    { ...ellipse(0.28, -0.12, 0.205, 0.18, 0.09), weight: 1.4 },
    loop(
      p(0, 0.08, 0.12),
      p(-0.11, 0.3, 0.14),
      p(0, 0.26, 0.14),
      p(0.11, 0.3, 0.14),
    ),
    line(p(-0.5, 0.13, 0.04), p(-0.35, 0.31, 0.06), p(-0.27, 0.43, 0.08)),
    line(p(0.5, 0.13, 0.04), p(0.35, 0.31, 0.06), p(0.27, 0.43, 0.08)),
    line(p(-0.29, 0.43, 0.12), p(0, 0.47, 0.15), p(0.29, 0.43, 0.12)),
    line(p(-0.29, 0.62, 0.1), p(0, 0.65, 0.12), p(0.29, 0.62, 0.1)),
    line(p(-0.49, -0.34, 0.1), p(-0.25, -0.4, 0.15), p(-0.08, -0.31, 0.12)),
    line(p(0.49, -0.34, 0.1), p(0.25, -0.4, 0.15), p(0.08, -0.31, 0.12)),
  ];
  for (let i = 0; i < 7; i++) {
    const x = (i - 3) * 0.08;
    strokes.push(line(p(x, 0.46, 0.15), p(x, 0.64, 0.12)));
  }
  if (crossbones) {
    for (const side of [-1, 1]) {
      strokes.push(
        line(p(-0.93, side * 0.72, -0.15), p(0.93, -side * 0.72, -0.15)),
      );
      for (const end of [-1, 1]) {
        strokes.push(ellipse(end * 0.93, side * end * 0.72, 0.12, 0.09, -0.15));
        strokes.push(ellipse(end * 1.02, side * end * 0.61, 0.09, 0.1, -0.15));
      }
    }
  }
  return drawing("anatomy", strokes);
}

type Pose = "point" | "peace" | "horns" | "open" | "thumb" | "gun";
function skeletonHand(pose: Pose, rotation = 0): SymbolShape {
  const strokes: Stroke[] = [];
  function bone(a: Point, b: Point, width = 0.035) {
    const length = Math.hypot(b.x - a.x, b.y - a.y),
      nx = (-(b.y - a.y) / length) * width,
      ny = ((b.x - a.x) / length) * width;
    strokes.push(
      loop(
        p(a.x + nx, a.y + ny, a.z),
        p(b.x + nx * 0.65, b.y + ny * 0.65, b.z),
        p(b.x - nx * 0.65, b.y - ny * 0.65, b.z),
        p(a.x - nx, a.y - ny, a.z),
      ),
    );
  }
  const roots = [
    p(-0.3, 0.02, 0.04),
    p(-0.09, -0.03, 0.06),
    p(0.13, 0.02, 0.04),
    p(0.32, 0.11, 0),
  ];
  for (let finger = 0; finger < 4; finger++) {
    const root = roots[finger],
      base = p((finger - 1.5) * 0.075, 0.65, -0.04);
    bone(base, root, 0.045);
    const extended =
      pose === "open" ||
      (finger === 0 && ["point", "peace", "horns", "gun"].includes(pose)) ||
      (finger === 1 && pose === "peace") ||
      (finger === 3 && pose === "horns");
    const spread = pose === "peace" ? 0.22 : pose === "open" ? 0.19 : 0.07;
    const lengths = [0.93, 1.03, 0.91, 0.7];
    const tip = extended
      ? p(root.x + (finger - 1.5) * spread, root.y - lengths[finger], 0.04)
      : p(root.x + 0.09, root.y + 0.15, 0.16);
    const joints = extended
      ? [
          root,
          p(
            root.x + (tip.x - root.x) * 0.43,
            root.y + (tip.y - root.y) * 0.43,
            0.07,
          ),
          p(
            root.x + (tip.x - root.x) * 0.76,
            root.y + (tip.y - root.y) * 0.76,
            0.05,
          ),
          tip,
        ]
      : [
          root,
          p(root.x - 0.03, root.y - 0.27, 0.12),
          p(root.x + 0.11, root.y - 0.14, 0.23),
          tip,
        ];
    for (let joint = 0; joint < 3; joint++)
      bone(joints[joint], joints[joint + 1], 0.032 - joint * 0.005);
    strokes.push(ellipse(root.x, root.y, 0.047, 0.043, 0.07));
  }
  const thumb =
    pose === "thumb"
      ? [p(-0.18, 0.6), p(-0.52, 0.21), p(-0.59, -0.19), p(-0.54, -0.57)]
      : pose === "gun"
        ? [p(-0.18, 0.6), p(-0.52, 0.3), p(-0.86, 0.34), p(-1.08, 0.47)]
        : pose === "open"
          ? [p(-0.18, 0.6), p(-0.57, 0.36), p(-0.78, 0.1), p(-0.91, -0.09)]
          : [
              p(-0.18, 0.6),
              p(-0.5, 0.34),
              p(-0.39, 0.11, 0.18),
              p(-0.18, 0.2, 0.22),
            ];
  for (let i = 0; i < 3; i++) bone(thumb[i], thumb[i + 1], 0.04 - i * 0.005);
  bone(p(-0.14, 1.05, -0.04), p(-0.14, 0.73, -0.04), 0.045);
  bone(p(0.15, 1.05, -0.04), p(0.15, 0.73, -0.04), 0.045);
  strokes.push(
    ellipse(-0.1, 0.7, 0.075, 0.045),
    ellipse(0.08, 0.7, 0.075, 0.045),
  );
  const rotated = strokes.map((stroke) => ({
    ...stroke,
    points: stroke.points.map(({ x, y, z }) =>
      p(
        x * Math.cos(rotation) - y * Math.sin(rotation),
        x * Math.sin(rotation) + y * Math.cos(rotation),
        z,
      ),
    ),
  }));
  return drawing("anatomy", rotated);
}

export const SYMBOL_SHAPES = {
  "Death Star": deathStar(),
  "Death Star II": deathStar(true),
  "Nike Swoosh": logo("Nike"),
  "Jordan Jumpman": logo("Jordan"),
  "Adidas Stripes": drawing("logos", [
    loop(p(-1, 0.55), p(-0.7, 0.55), p(-0.9, 0.2), p(-1.2, 0.2)),
    loop(p(-0.47, 0.55), p(-0.13, 0.55), p(-0.65, -0.35), p(-0.97, -0.35)),
    loop(p(0.13, 0.55), p(0.5, 0.55), p(-0.36, -0.95), p(-0.72, -0.95)),
  ]),
  Apple: logo("Apple"),
  "Mercedes Star": drawing("logos", [
    ellipse(0, 0, 1),
    ...Array.from({ length: 3 }, (_, i) => {
      const a = -Math.PI / 2 + (i / 3) * TAU;
      return loop(
        p(Math.cos(a), Math.sin(a)),
        p(Math.cos(a + 2.15) * 0.16, Math.sin(a + 2.15) * 0.16),
        p(0, 0),
        p(Math.cos(a - 2.15) * 0.16, Math.sin(a - 2.15) * 0.16),
      );
    }),
  ]),
  "Audi Rings": drawing(
    "logos",
    Array.from({ length: 4 }, (_, i) => ellipse((i - 1.5) * 0.52, 0, 0.36)),
  ),
  Skull: skull(),
  "Skull and Crossbones": skull(true),
  "Skeleton Point Up": skeletonHand("point"),
  "Skeleton Point Right": skeletonHand("point", Math.PI / 2),
  "Skeleton Point Left": skeletonHand("point", -Math.PI / 2),
  "Skeleton Peace": skeletonHand("peace"),
  "Skeleton Rock On": skeletonHand("horns"),
  "Skeleton Finger Gun": skeletonHand("gun", Math.PI / 2),
  "Skeleton Thumbs Up": skeletonHand("thumb"),
  "Skeleton Open Palm": skeletonHand("open"),
} satisfies Record<string, SymbolShape>;

export type SymbolFormation = keyof typeof SYMBOL_SHAPES;
export const SYMBOL_FORMATIONS = Object.keys(
  SYMBOL_SHAPES,
) as SymbolFormation[];
export function isSymbolFormation(name: string) {
  return Object.hasOwn(SYMBOL_SHAPES, name);
}
