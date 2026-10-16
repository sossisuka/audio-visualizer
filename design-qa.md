# Design and interaction QA

Source: the user's inline reference image, 881 × 1566 px. The attachment is the visual reference; no source image file was supplied in the checkout. The latest request overrides the original warm palette and outer framing: use monochrome, remove the player's outer borders, make playback icons and the timeline white, and increase wave motion.

Implementation evidence:

- `artifacts/reference-size.png`: 881 × 1566 CSS viewport, device scale factor 1.
- `artifacts/desktop-playing.png`: 1440 × 1000 CSS viewport, full document capture, device scale factor 1.
- `artifacts/mobile.png`: 390 × 844 CSS viewport, full document capture, device scale factor 1.
- `artifacts/mobile-small.png`: 320 × 740 CSS viewport, full document capture, device scale factor 1.
- `artifacts/browser-results.json`: measured layout and audio responses from the browser.

The supplied attachment and rendered captures were visually reviewed. This is a qualitative comparison, not a pixel-difference measurement. Desktop and narrow portrait layouts intentionally have different proportions. Playback intensity differs with the input audio. The latest request replaces the resting particle sculpture with a gradual appearance and a chaotic dissolution to an empty visual field whenever audio stops.

## Findings and fixes

- The initial dial shading was too green. Updated the concentric bevels, highlights, shadows, and pointer to neutral ivory and graphite. Reviewed the revised portrait and desktop captures.
- Initial particles were too dim and the lightning paths were angular. Increased particle definition and replaced the lightning path with recursive, branching displacements. Strike brightness and decay now follow the measured signal.
- Radio legends initially affected option alignment. Changed the group flow and verified the corrected desktop and mobile captures.
- The initial renderer included idle animation and timer-triggered lightning. Removed both. Audio-analysis features now drive movement, deformation, pulses, and strike events. Actual silence, mute, and pause settle the effect.
- Removed all scaffold logos, promotional text, and the branded favicon.

## Required fidelity surfaces

- Typography: spaced uppercase instrument labels, condensed functional text, monospaced telemetry and preset labels. Neutral Arial dial labels were reviewed against the reference's control labels.
- Layout: recessed rounded display, left and right control banks, vertical faders, inset black preset selector, and four image controls below the screen. On mobile the control banks move below the display to preserve usable dial sizes. No horizontal overflow at 320 or 390 px.
- Color and lighting: grayscale metal panel and dials, fine local grain, directional bevel highlights, dark contact shadows, black display, white particles, and luminous branching strikes. The latest request replaces the original warm tint with neutral grayscale.
- Image quality: the visualization is a live Canvas renderer, so it responds to the actual sound rather than replaying an image. Controls are actual accessible UI elements. Fine grain is a local PNG asset.
- Content: source branding and decorative copy omitted as requested. Labels support the controls, playback, signal level, or current preset. The small transport and upload affordances support playing real audio.

## Audio and interaction verification

The browser loaded a generated WAV through the file input and played it through the full Web Audio graph. The analyser receives the same post-effects, post-volume signal routed to the speakers.

- Bass tone: bass 0.3973, mid 0.0245, treble 0.0000.
- Silence: RMS 0.00026; no new strikes; wave opacity exactly zero.
- High tone: treble 0.0579, bass 0.0000, mid 0.0000.
- Mid tone: mid 0.1195, bass 0.0000.
- Muting output reduced RMS to 0.00006 and held the musical animation clock at 6.49274 while the separate exit animation dissolved the waves.
- Pausing held the visual clock and strike count constant.
- Preset navigation, keyboard dial adjustment, display selection, FX selection, power, reset, playback, file loading, and mobile layouts passed.
- Browser console errors: none.

`bun run test:audio` additionally passed frequency isolation, amplitude response, transient detection, sustained-tone behavior, pause release, and silence checks. `bun run typecheck` and `bun run build` passed.

## Accepted differences and follow-up

The user's reference is a static portrait hardware composition. The implementation adapts its proportions to wider screens and moves controls below the visualization on phones. Actual control positions reflect their parameter values. The audio determines visual brightness and motion; quiet or paused audio intentionally differs from the source's bright, active snapshot. Exact original weathering marks and the exact particle arrangement are not reproduced.

## Latest refinement verification

- Increased audio-driven flow speed, particle twisting, longitudinal ripples, beat expansion, and short particle trails. Silence and pause continue to hold the animation clock still.
- Wave mode now has eleven overlapping traces, amplitude compensation for quiet music, stronger glow, and moving ripples derived from the measured audio envelope. An active browser capture is saved as `artifacts/wave-playing.png`.
- Removed structural borders and frame shadows from the instrument, visualization, preset container, and transport. Removed the transport card background and the play button's circular border.
- Timeline track, progress, thumb, and all seven interface icons are white. Keyboard focus indicators remain available.
- Computed browser styles confirmed zero-width borders and no frame shadows. Every SVG icon computed to `rgb(255, 255, 255)`.
- Pixel inspection found zero colored pixels in the mobile, desktop-playing, and Wave-mode screenshots: every pixel's red, green, and blue channels match.
- The active Wave-mode clock advanced from 0.75295 to 1.25646 during a 700 ms sample. The full browser suite again passed audio frequency response, silence, mute, pause, presets, controls, and 320/390 px mobile overflow checks, with no console errors.
- Type checking, audio-analysis checks, and the production build all passed after the refinement.

Final implementation checklist: complete. No outstanding functional or responsive issues found in the checked flows. Physical touch-device and Safari playback remain untested.

## Occasional lightning reveal

- Some audio-triggered strikes now draw from their origin toward the target over 300–500 ms, using distance along the actual branching path and a moving tip glow.
- Branches wait until the main line reaches their junction. A gradual strike is always followed by an instant strike; other strikes are selected randomly, so the draw effect remains occasional.
- Older strikes retain their own reveal and fade state when a new beat arrives. At most four strike groups are retained.
- Reduced-motion mode uses instant strikes. Pausing, silence, and mute stop reveal advancement and let the light fade.
- Live browser evidence: `artifacts/lightning-growth-results.json` observed the same strike advance from 0.324 to 1.000, with one gradual strike and two instant strikes. The corresponding canvas captures are `artifacts/lightning-growing-early.png` and `artifacts/lightning-growing-late.png`.
- The complete browser checks passed again with no console errors, including real uploaded audio, pause, mute, silence, presets, and 320/390 px responsive layouts. Audio-analysis checks, TypeScript, and the production build passed.

## Audio presence and chaotic disappearance

- Public first-party research and the implementation rationale are saved in `VISUALIZER_RESEARCH.md`.
- Initially silent playback is completely hidden. A 400 ms visual attack, hysteresis, and a 120 ms silence hold prevent sudden appearance and flicker between beats.
- Pause, mute, and sustained silence cause a 900 ms fade with seeded random fragment dropout and drifting trajectories. The effect reaches exact zero; stars, lightning, and the flat waveform baseline are also absent afterward.
- Known decoded tracks begin their visual fade in the last 800 ms. Playback state is read directly from the audio engine so the source's end event cannot briefly restart the visual when React updates the transport.
- Actual float audio samples detect quiet audio without byte-waveform quantization. The last audible waveform is retained during the exit rather than snapping to a flat line.
- Transition timing is independent of the musical animation clock. Reduced-motion mode removes scattering and shortens opacity transitions. Fragment glow and random offsets are batched to reduce the transition rendering cost.
- Browser measurements captured entry at opacity 0.7943, a pre-EOF exit at 0.5777, and an ended state at exactly 0.0000. Paused, muted, initial, intra-track silent, and ended states all passed rendered-canvas pixel checks for zero bright wave pixels. Wave mode also cleared its baseline fully.
- Evidence: `artifacts/browser-results.json`, `artifacts/wave-visible.png`, `artifacts/wave-dissolving.png`, and `artifacts/wave-ended.png`.
- Audio checks, the new visual-lifecycle checks, type checking, and production build passed. The complete browser suite passed again with no console errors and no horizontal overflow at 320 or 390 px.

final result: passed

## Expanded scene collection

- Added eight independent compositions: Orbit, Senbonzakura, Galaxy, Warp, Constellation, Mandala, Terrain, and Rain. The original Ribbon, Wave, Pulse, and Filament remain available, for twelve choices total. Orbit is the default.
- Orbit mirrors logarithmic frequency bands around a ring and emits bounded pools of particles on audio transients. Senbonzakura renders up to 1,000 notched cherry petals, complete five-petal blossoms, fluttering depth layers, and dispersed petal bursts. The other compositions use different geometry and movement rather than reusing the ribbon.
- Added an accessible native-radio scene picker with white icons, visible selection and keyboard focus, and responsive layouts of six, four, or three columns. Switching scenes preserves playback. Rebalanced the phone's filter and power controls after moving scene selection below the display.
- Every scene shares the actual post-volume audio analyser, gradual entry, seeded fragment dropout, chaotic exit, exact-zero cleanup, quality controls, and reduced-motion behavior. The last audible spectrum is retained during exit to avoid an abrupt geometry collapse.
- Batched ring, mandala, and lightning bloom into single shadow passes. The eight new scenes each recorded a median animation-frame interval of approximately 16.7 ms in the desktop headless Chrome check. This is evidence from that environment, not a frame-rate guarantee for every device.
- Visually inspected the eight compositions together and the full Orbit, Senbonzakura, and 320 px mobile screenshots. All scenes have distinct silhouettes, the blossom effect reads as fluttering petals, and all twelve labels fit without overflow. The existing monochrome hardware dials and borderless player remain intact.
- `bun run test:scenes` passed twelve scenes with visible animated pixels, emitted particles in Orbit and Senbonzakura, no colored canvas pixels, zero residual pixels after pause, no idle art when selecting a scene in silence, keyboard selection, uninterrupted playback while switching, 320/390 px touch targets, and reduced motion. Browser console errors: none.
- The full existing browser regression passed actual uploaded WAV analysis, bass/mid/treble isolation, silent gaps, mute, pause, EOF, waveform cleanup, presets, controls, and 320/390/881/1440 px layouts. Audio-analysis tests, presence tests, TypeScript, and the production build passed.
- Evidence: `artifacts/scene-results.json`, `artifacts/scene-orbit.png`, `artifacts/scene-senbonzakura.png`, `artifacts/scene-canvas-*.png`, `artifacts/scene-mobile-320.png`, and `artifacts/browser-results.json`.

Final result: passed. Physical touch devices and Safari remain untested.

## Desktop window fit

- The desktop instrument now occupies the available dynamic viewport height. Header, workspace, and footer use a grid, and the canvas takes the space remaining above the scene picker, presets, and image controls. The layout fits its content without hiding page overflow or clipping controls.
- Kept the hardware dial materials while scaling their dimensions and spacing with window height. Output and Mix share the top row of a two-column rail, followed by paired visual dials, FX, and Quality. Desktop scene buttons use a compact horizontal layout, with six, four, or three columns according to available width.
- Checked 1920×1080, 1536×864, 1440×900, 1366×768, 1280×720, 1280×600, 1024×768, 1024×600, 800×600, 701×600, 881×1566, and 2560×1440 viewports. Every case had document width and height equal to its viewport, zero out-of-window controls, and no overflowing scene labels.
- Visually inspected the complete 1366×768 and 1024×600 windows. All twelve scenes, thirteen dials, both faders, power, presets, audio transport, FX, Quality, Load, and Reset are visible simultaneously. The new layout is scoped above the existing 700 px mobile breakpoint.
- Evidence: `artifacts/desktop-fit-results.json` and `artifacts/desktop-fit-1366x768.png`, `artifacts/desktop-fit-1024x600.png`, and `artifacts/desktop-fit-1920x1080.png`.
- Production build and TypeScript passed. The existing browser suite also passed uploaded-audio playback, frequency response, silence/mute/pause/EOF cleanup, controls, and mobile layouts, with no console errors. Its 1440×1000 check now reports a document height of exactly 1000 px; the 390 px mobile page retains its 1863 px scrolling layout.

## Audio-directed Constellation choreography

- Replaced the drifting cloud with eleven procedural formations: Nebula, Sphere, Torus, Helix, Spiral, Rose, Knot, Crystal, Orbitals, Supernova, and Lissajous. Each star keeps its index across formations. Quintic easing and damped positions make the geometric transformations continuous, while nearest-neighbor connections fade as they rewire.
- The director considers measured onsets, peak strength, estimated pulse intervals, bass/mid/treble balance, spectral entropy, short versus long energy, centroid changes, and decoded-track progress. A minimum hold, completed-transition guard, and recent-formation history prevent per-beat flicker and repetitive sequences. Sustained audio uses a slower evolutionary cue. These are procedural heuristics, not semantic chord or verse/chorus recognition.
- Additive spectral-partial motion, frequency modulation, actual waveform displacement, bass expansion, and propagating peak fronts animate the formations. Rotation, perspective, travelling link pulses, node highlights, quality settings, and existing dials remain functional. Choreography runs through the track even when another scene is selected.
- Pause and silence freeze morph progress, synthesis phase, and pulse propagation. The existing random dissolve still reaches exact zero. Seeks clear stale pulse and section predictions while retaining star identity; reduced motion slows evolution and uses longer transitions.
- A 36-second WAV with contrasting tonal, percussive, bright, bass-heavy, and FM sections exercised the complete file-loading/audio/rendering path. The browser captured six settled formations (Nebula, Helix, Spiral, Crystal, Orbitals, Torus), eight transitions, and 97 intermediate morph samples. A pause during a morph held its phase and interpolation constant; pause and natural EOF each left zero bright canvas pixels. The 390 px mobile rendering had no horizontal overflow or colored pixels. Browser exceptions: none.
- Visually inspected the six-form contact sheet and full mobile image. The helix, cube, orbitals, and torus have recognizable distinct silhouettes; the star mesh stays connected while changing shape. Desktop window-fit CSS and mobile controls were preserved.
- `bun run test:constellation` passed all eleven formations at Low/Medium/High counts, musical/spectral response, interpolation, pulse estimation, pause/silence, seeks, reduced motion, and 24/60 fps timing. Audio-analysis checks, presence checks, TypeScript, and production build passed. The full twelve-scene browser suite also passed; Constellation recorded a median frame interval of 16.7 ms in the test environment.
- Evidence: `artifacts/constellation-browser-results.json`, `artifacts/constellation-contact-sheet.png`, `artifacts/constellation-*.png`, and `artifacts/scene-results.json`.

Final result: passed. Physical touch devices and Safari remain untested.
