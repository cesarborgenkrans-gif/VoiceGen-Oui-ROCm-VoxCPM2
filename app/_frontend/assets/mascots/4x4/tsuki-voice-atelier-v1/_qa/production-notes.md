# Tsuki Voice Atelier v1

## Identity lock

- Small full-body Tsuki in the light Japanese Gengo chibi treatment: delicate pastel rendering, fine pale-teal outline, soft antialiasing, and no heavy dark pixel-art contour.
- Pale sunshine-yellow bob with mint/seafoam underside and a short low side ponytail on the viewer's left.
- Large lavender eyes, warm pale skin, small blush, and the gold crescent ornament on the viewer-left fringe.
- White and mint short dress with teal collar and trim, small gold star at the collar, pale-gold skirt motifs, white knee boots.
- Front-facing three-quarter-neutral game view, one consistent scale, lighting, body proportion, and shoe baseline.
- VoiceGen prop: a small seafoam voice folio with a gold crescent cover and a simple waveform line inside. No letters or interface text.
- Forbidden substitutions: mint twin buns, dark cyber colors, chunky 8-bit rendering, black-heavy outline, headset, modern streetwear, different ornament side, background scenery, detached effects.

## Action A: listen and notice

Mode: calm loop. Row-major sixteen-beat script:

1. Ready pose, closed voice folio held at chest.
2. Begins opening the folio.
3. Looks down at the waveform page.
4. Tilts her head, listening closely.
5. One hand comes gently toward her ear while the folio stays held.
6. Studies the waveform with focused eyes.
7. Points to one part of the waveform.
8. Small surprised realization.
9. Warm smile.
10. Gentle confirming nod.
11. Taps the waveform once.
12. Begins closing the folio.
13. Holds the closed folio against her chest.
14. Content blink.
15. Returns to attentive ready posture.
16. Clean match back into frame 1.

## Action B: shape and approve

Mode: one-shot with a deliberate final hold. Row-major sixteen-beat script:

1. Ready with closed voice folio.
2. Opens the folio.
3. Raises a small gold-tipped tuning pen, held in her hand.
4. Indicates the waveform page with the pen.
5. Concentrates on the voice shape.
6. Traces the waveform carefully.
7. Finishes the shaped line; the waveform itself becomes warm gold.
8. Listens with one hand near her ear.
9. Eyes widen at the result.
10. Smile arrives.
11. Gives a clear approving nod.
12. Gives a small thumbs-up while still holding the folio.
13. Presents the open folio and gold waveform.
14. Friendly wink.
15. Hugs the folio with satisfaction.
16. Settled proud pose for a long hold.

## Runtime authority

Match the live Japanese Gengo guide implementation: fixed square `.sprite-window`, nested scale and motion layers, two absolute `.sprite-film` buffers, `background-size: 400% 400%`, third-based frame positions, explicit frame/duration/fade data, long idle rests, and a reduced-motion settle frame. The sprite host itself never translates.
