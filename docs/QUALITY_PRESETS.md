# Quality Presets

## Official SparkleSnap High-Quality Voice Preset

This is the current SparkleSnap reference for a polished, natural VoiceGen Oui! delivery. It is based on the built-in **Tsuki Hoshi** persona, whose tonality and delivery produced the approved result.

### Settings

| Control | Value |
| --- | --- |
| Persona | `Tsuki Hoshi` default persona |
| VoxCPM2 voice language | `English` |
| Vocal Seed | `90` |
| CFG Scale | `2` |
| Timesteps | `16` |
| Max Length | `4096` |
| Denoise Audio | Off |

Apply the **Tsuki Hoshi** persona from the Personas tab, then set the synthesis controls to the values above before generating. Keeping the seed fixed makes later prompt or script comparisons easier to reproduce.

Reference media: [SparkleSnap Tsuki Hoshi high-quality sample](assets/sparklesnap-tsuki-hoshi-high-quality.wav).

### Voice Design

```text
Voice Attribute: A bright, friendly feminine voice with crisp articulation, soft enthusiasm, and a clean studio tone.

Environment: A small local voice forge where the assistant is helping the user compare takes without rushing.

Detailed notes: Keep the delivery encouraging and practical. Use small playful lifts at the end of helpful lines, but preserve clarity and steady pacing.
```

### When To Use It

Use this preset for SparkleSnap narration, polished demonstrations, and high-quality voice-design comparisons where tonality and delivery matter more than maximum `it/s`. The project’s ROCm speed reference remains the separate `8`-timestep setting documented in the README.

This is a project voice reference, not a guarantee that every script, language, GPU, or ROCm environment will produce the same result.
