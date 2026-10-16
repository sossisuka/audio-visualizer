# Audio-driven appearance and disappearance

Reviewed against public first-party documentation on 16 October 2026. The service examples below establish playback-state patterns; the fade timings and particle dissolution are design choices for this visualizer.

## What established services document

| Product | Documented behavior | Applied here |
| --- | --- | --- |
| [Spotify Web Playback SDK](https://developer.spotify.com/documentation/web-playback-sdk/reference) | Playback state exposes pause and position information, and state-change notifications update clients. | Playback state controls whether sound can activate the visualizer. Known position and duration allow the visual fade to begin near EOF. |
| [SoundCloud Widget API](https://developers.soundcloud.com/docs/api/html5-widget) | Separate play, pause, finish, seek, and playback-progress events support a complete player lifecycle. | Explicit pause and finish handling prevent an idle or completed track from leaving a visible waveform. |
| [Apple Music visualizer](https://support.apple.com/en-gb/guide/music/muse3aa39574/mac) | Visual effects change with the music and with playing/paused state; the visualizer can also operate without music. | Keep the effects coupled to audio, while following this project's explicit preference for an empty visual field at silence. Apple's idle behavior is a different product choice. |

These public interfaces do not specify the services' proprietary particle algorithms, visual attack/release durations, or random dissolution effects. The implementation therefore uses documented Web Audio techniques rather than attributing an invented rendering algorithm to a service.

## Relevant implementation guidance

[MDN's visualization guide](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Visualizations_with_Web_Audio_API) uses an analyser, reusable typed-array buffers, Canvas, and `requestAnimationFrame` to draw the current audio signal. The existing post-effects, post-volume analyser remains the source for this app.

[Float time-domain samples](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/getFloatTimeDomainData) preserve small amplitudes around zero. Measuring RMS from them avoids relying on quantized byte waveform data when deciding whether a quiet signal is actually silent.

[FFT smoothing](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/smoothingTimeConstant) averages frequency analysis across frames. It does not itself define a visual lifecycle or guarantee that a canvas becomes empty. This app therefore keeps a separate visual attack/release envelope.

[Tone.js Gate](https://tonejs.github.io/docs/14.7.39/Gate) documents amplitude following, a threshold, and smoothing as established audio-gating tools. Using separate opening and closing thresholds plus a short silence hold is our application-level refinement to prevent visual chatter near the noise floor; the gate affects rendering only.

## Implemented behavior

- Initial load and stopped playback show no resting particle sculpture, lingering waveform, stars, or lightning. The display's static reticle and control readouts remain available.
- Real audio opens the visual gate at RMS 0.001, approximately −60 dBFS. An already open gate closes below RMS 0.0005, approximately −66 dBFS, after a 120 ms hold. Brief musical gaps therefore do not repeatedly hide and reveal the waves.
- A smooth 400 ms attack brings the waves in. A smooth 900 ms release handles pause, mute, and sustained silence, reaching exact zero rather than approaching it indefinitely.
- For decoded tracks, the visualizer starts its exit in the final 800 ms when the waves have already appeared. This is a visual fade; it does not change the audio file or its volume.
- Particle fragments receive stable randomized visibility thresholds and drift directions. They scatter and disappear at different times; the random seed is not regenerated every animation frame.
- Wave mode breaks into staggered line fragments. The last audible waveform is retained during the exit, so it dissolves instead of snapping into a flat line.
- Audio returning during an exit reverses the envelope from its current opacity. Fade progress uses elapsed seconds, keeping durations consistent across rendering frame rates.
- Reduced-motion mode uses a shorter opacity transition and disables particle scattering. The small input waveform follows the same presence lifecycle.
- The existing occasional progressive lightning, monochrome palette, borderless controls, and mobile layout are retained.

## Verification

`bun run test:audio` covers frequency response, amplitude response, onsets, silence, pause, and quiet float samples. `bun run test:visual` covers initial invisibility, gradual entry, hysteresis, silence hold, randomized fragment thresholds, exact-zero cleanup, interrupted fades, predicted EOF, frame-rate independence, and reduced motion.

The browser suite additionally checks actual decoded audio, initial silence, a silent gap within a playing file, muting, pausing, and a short file ending on an audible tone. It reads the rendered canvas to ensure there are no bright wave pixels after disappearance, including Wave mode. Screenshots and measured states are written to `artifacts/`.
