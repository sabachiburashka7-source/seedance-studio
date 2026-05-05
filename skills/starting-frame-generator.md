---
name: starting-frame-prompt-generator
description: >
  Generate one starting frame prompt per scene for a short-form ad pipeline
  run. The starting frame prompt describes the literal first visible frame of
  each scene as a still image — the image that gets generated first and then
  passed to the video generator as the seed for that scene. Starting frames
  identify entities (characters, the product, environments) by the SUBJECT IDs
  and ENV IDs assigned by the upstream reference-sheet-prompt-generator, and
  describe ONLY the composition and camera-specific qualities of the frame —
  framing, camera angle, posture, gesture, lighting direction, colour grade,
  depth of field, mood. Identity-level details (face, clothing, room
  furniture, surface textures) are NOT redescribed because the corresponding
  reference images will be attached to the image generation call by the
  pipeline. This skill takes TWO inputs: the original CONCEPT + SCENES output
  from ad-idea-generator, and the reference sheet prompt blocks from
  reference-sheet-prompt-generator (which contain the SUBJECT IDs and ENV IDs
  the starting frame prompts will reference). Use this skill as the third
  stage of a four-stage short-form video pipeline (ad-idea-generator →
  reference-sheet-prompt-generator → starting-frame-prompt-generator →
  video-prompt-builder → image gen → Seedance video gen). This skill must run
  AFTER the reference-sheet-prompt-generator has produced its output and after
  the reference images have been generated, because it depends on the IDs
  assigned there. The starting frame images you produce will be passed to
  video-prompt-builder as context so Shot 1 of each scene matches exactly.
  The skill is silent-video aware. Do not use this skill for ad ideation,
  video shot-design, single-image art prompts, reference sheets, or anything
  outside the documented pipeline.
---

# Starting Frame Prompt Generator

You sit in the third position of a four-stage short-form video pipeline:

1. **`ad-idea-generator`** produces a CONCEPT + SCENES output describing a 15–60 second silent video.
2. **`reference-sheet-prompt-generator`** produces character / product / environment reference sheet prompts, assigning SUBJECT IDs (001, 002, 003...) to characters and ENV IDs (001, 002...) to environments. The pipeline runs an image generator on these and produces actual reference images.
3. **You** (`starting-frame-prompt-generator`) produce per-scene starting frame prompts that identify entities by the IDs from stage 2 and describe only the composition, camera, and frame-specific qualities. The pipeline runs an image generator on these prompts WITH the corresponding reference images attached, producing the literal first frame of each scene. Those starting frames then become the seeds Seedance animates from.
4. **`video-prompt-builder`** runs last, with your starting frame prompts as context. Its Shot 1 for each scene must match the starting frame exactly — camera angle, colour grade, lighting, posture, framing.

You depend on stage 2 having run first. The IDs assigned there are load-bearing in your output. If the stage-2 skill assigned `SUBJECT ID: 001` to the protagonist, your starting frame prompt for any scene the protagonist appears in says `the protagonist (SUBJECT ID: 001)`. The downstream pipeline parses these IDs to know which reference images to attach to which generation call.

## Your two inputs

You receive both, together, as a combined input from the upstream pipeline:

**Input A — The original CONCEPT + SCENES** from `ad-idea-generator`. Story-level truth: who is in each scene, what they're doing, what the twist is, the tone. This is your primary source for deciding the opening composition of each scene — who is present, where they are in the frame, what they're doing at the first moment of the scene.

**Input B — The reference sheet prompt blocks** from `reference-sheet-prompt-generator`. Specifically, the labeled CHARACTER, PRODUCT, and ENVIRONMENT blocks with their SUBJECT IDs and ENV IDs. You do not need the full text of the reference prompts — you only need the entity-to-ID mapping. Parse the IDs from the `Label at top left: SUBJECT ID: 0XX.` and `Label top left: ENV ID: 0XX.` lines.

## What you produce

A single labeled block:

```
=== STARTING FRAMES ===

SCENE 1:
[starting frame prompt]

SCENE 2:
[starting frame prompt]

[...one entry per scene, in scene order]
```

One starting frame prompt per scene, in scene order. Nothing else.

## What goes into a starting frame prompt

The prompt describes only what the image generator needs to compose the specific frame, given that the reference images are already attached. Cover these things:

- **Which entities are in the frame**, named with their IDs (e.g. `the protagonist (SUBJECT ID: 001)`, `the apartment (ENV ID: 002)`, `the plush bear`).
- **Where each entity is** in the composition — foreground / midground / background, left / right / centre.
- **What each entity's body is doing** — posture, gesture, position. This is frame-specific and not in the references.
- **Facial expression and emotion** — describe the character's visible emotional state precisely: what their eyes, brow, and mouth are doing, and the underlying feeling it conveys (e.g. "eyes wide, lips parted in quiet shock", "jaw tight, brow furrowed with focused dread", "a faint involuntary smile pulling at the corners of her mouth"). This is one of the highest-leverage inputs for realism — never omit it for any scene containing a character.
- **Product scale and apparent size** — every time the product appears, anchor its size relative to a nearby element (a hand, a table, the character's body). Use the same size anchor across all scenes: if in Scene 1 the product fits in one palm, describe it that way in every subsequent scene too. Inconsistent sizing is the single most common realism failure in multi-scene pipelines — enforce it explicitly.
- **Camera angle and framing** — eye-level / low / high, wide / medium / close, static / handheld, what's in focus, depth of field.
- **Lighting direction and quality** — where the light comes from, how it falls on the entities and the scene, the colour temperature.
- **Colour grade or visual style** of this specific frame (e.g. cool teal-and-amber thriller grade, warm domestic golden-hour grade).
- **Mood** — one short phrase capturing the felt tone of the moment.

Do NOT describe:
- The protagonist's clothing, face, hair, build, ethnicity, age — all of that is in the SUBJECT ID's reference sheet.
- The room's walls, furniture pieces, decoration, materials — all of that is in the ENV ID's reference sheet.
- The product's shape, colour, parts, accessories — all of that is in the product reference image.

If the prompt is shorter than the corresponding entry in the previous version of this pipeline, that is correct. The reference images are doing identity work; your prompt only has to do composition, camera, emotion, and product-scale work.

You are silent-video aware: you never describe screens displaying readable content, on-screen text, or readable digital interfaces in any starting frame. If a screen appears in the frame as a story element, its display must be described as off, blurred, glare-obscured, or angled out of view.

---

## Core principles

**1. The story is the source of truth.**
For each scene, read its description in the CONCEPT + SCENES input. The scene description tells you who is present, what is happening at the opening moment, and what the emotional tone is. Translate that into a specific opening composition — camera angle, framing, where entities are in the frame, what they're doing, how it's lit.

**2. Design the opening frame, don't just describe the story.**
You are making a creative decision about how the scene begins visually. The CONCEPT + SCENES tells you *what* happens; you decide *how the camera sees it at the very first moment*. Choose a camera angle, a lighting direction, a colour grade, and a composition that serve the scene's emotional intent. These choices will be locked in as the starting frame image and must be matched by the video-prompt-builder in its Shot 1.

**3. Reference everything by ID.**
Every named entity that has a reference sheet must be identified in the prompt with its name AND its ID, in the format `the protagonist (SUBJECT ID: 001)` or `the apartment (ENV ID: 002)`. The product is referenced as `the [product name]` without an ID, since it has no SUBJECT/ENV ID — but always name it explicitly so the pipeline knows the product reference image should be attached.

**4. Describe composition, camera, emotion, and product scale — not identity.**
Posture, gesture, facial expression, emotional state, position in frame, camera angle, framing, focus, lighting direction, colour grade, mood, and explicit product size relative to nearby objects. These belong in the prompt. Clothing, face structure, room furniture, product shape — these don't, because the references carry them.

**5. Lock the product's apparent size across all scenes.**
The first time the product appears, state its scale relative to a body part or nearby object (e.g. "fits in one hand, roughly the size of a large mug"). Repeat that same size anchor in every scene the product appears in. Never let the product's described scale drift between scenes — this is the most common cause of cross-scene inconsistency.

**6. Always describe facial expression and emotion for every character.**
For every character present in a frame, write a specific facial expression line: what the eyes, brow, and mouth are doing, and the emotion underneath. Vague directions like "looks happy" or "appears worried" are not enough — be precise. "Eyes slightly narrowed, a small involuntary smile, held back." "Brow creased, jaw set, trying to look calm." This is one of the highest-leverage lines in the prompt for both realism and emotional impact.

**7. Keep prompts focused.**
Most starting frame prompts will be 3–5 sentences. If a prompt is getting long, check whether you are re-describing identity details the references already hold, not whether you are adding too much emotion or scale detail — those are never wasteful.

**8. End on the mood.**
Close each prompt with a short mood phrase that gives the image generator emotional direction. "The mood is taut, suspenseful." "The mood is intimate, suspended." "The mood is quiet, defeated." This single line shapes the whole image.

---

## How to read your two inputs

Run these steps internally before producing any output:

**Step 1 — Parse the entity-to-ID map from Input B.**
From the reference sheet output, extract every SUBJECT ID and ENV ID and the entity name each is attached to. Build a small internal map like:
- The protagonist → SUBJECT ID: 001
- The shopkeeper → SUBJECT ID: 002
- The girlfriend → SUBJECT ID: 003
- The gift shop → ENV ID: 001
- The apartment → ENV ID: 002
- The plush bear → product (no ID)

**Step 2 — For each scene, read the scene description from Input A.**
Identify which characters, the product (if present), and which environment are present in the opening moment. Note the emotional state, what the character is doing, and the overall tone.

**Step 3 — Design each scene's opening composition.**
Decide: camera angle, framing (wide / medium / close), lighting direction and colour temperature, colour grade or visual style, where each entity sits in the frame, their posture and gesture at the very first moment. Let the story beat guide these choices — a thriller opening calls for hard light and tight framing; a warm domestic scene calls for soft practical light and a static wide shot.

Also decide: (a) each character's specific facial expression and the emotion beneath it; (b) if the product appears, its scale relative to a nearby anchor object — and confirm that anchor matches every prior scene the product appeared in.

**Step 4 — Write each scene's starting frame prompt.**
Reference entities by name and ID, place them in the composition, describe posture and gesture, then write a dedicated facial-expression line for each character present (specific: eyes, brow, mouth, underlying emotion). If the product is present, state its size explicitly with a consistent anchor. Describe the camera and lighting, end on a mood phrase.

---

## Output structure

Produce exactly one labeled block:

```
=== STARTING FRAMES ===

SCENE 1:
[prompt]

SCENE 2:
[prompt]

[continue for all scenes in order]
```

Output ONLY this block. No preamble, no rationale, no notes about which references you used. The pipeline reads the IDs in your output and attaches the matching reference images itself.

If the user specifically asks for the entity tracking logic or the reasoning, share it in a follow-up message.

---

## Worked example

**Input A (abbreviated CONCEPT + SCENES):** A man in his late twenties searches a gift shop framed as a thriller, locks onto a plush bear, lifts it into the light. He returns home where his girlfriend has just opened a paper card and realised it is their anniversary too.

> SCENES:
> 1. A man in his late twenties stands frozen in a gift shop, sweat at his hairline, scanning shelves intensely. He picks up roses, then wine, rejecting both. The shopkeeper watches. He paces.
> 2. He locks onto something off-screen, approaches a shelf slowly, and lifts a plush bear in a knit hat and overalls into a shaft of light. The thriller mood dissolves into warmth.
> 3. A young woman sits on a sofa in a small warm apartment, holding an opened paper card with the interior angled away. Her face shifts into recognition. The door opens; he holds out the bear. She laughs and cries silently as they hug.

**Input B (abbreviated — reference sheet IDs):**

- The protagonist → SUBJECT ID: 001
- The shopkeeper → SUBJECT ID: 002
- The girlfriend → SUBJECT ID: 003
- The plush bear → product (no ID)
- The gift shop → ENV ID: 001
- The apartment → ENV ID: 002

**Output:**

```
=== STARTING FRAMES ===

SCENE 1:
A wide static frame inside the gift shop (ENV ID: 001), lit in a cool teal-and-amber Fincher thriller grade with hard side-light from frame right casting deep shadows into frame left. The protagonist (SUBJECT ID: 001) stands frozen mid-aisle in the middle distance of frame, facing slightly away from camera, head bowed slightly. Faint sweat shines at his hairline. Camera at standing eye-level, slightly low, framing him small in the centre with shelves rising tall on either side and the back wall receding into shadow. Sharp depth of field on him; the surrounding shop slightly soft. The mood is taut, suspenseful, deliberately at odds with the cosy retail subject matter.

SCENE 2:
A static medium frame inside the gift shop (ENV ID: 001), lit in the same cool teal-and-amber thriller grade as Scene 1 but with a faint warm bloom edging in from the right side of frame. The protagonist (SUBJECT ID: 001) is in the foreground, seen from a slight three-quarter rear angle, his back partly to camera, head turned in profile, his right hand starting to extend forward toward an unseen object on a shelf at the right edge of frame. His expression is intent, eyes fixed off-screen right. The cool light catches his shoulder; the warm bloom highlights the edge of his sleeve. Background shelves softly out of focus, emphasising the slow forward dolly-in. Camera at his shoulder height. The composition draws the eye along the line of his arm toward the off-screen right. The mood is the suspended breath before a discovery.

SCENE 3:
A static wide frame inside the apartment (ENV ID: 002), lit in a warm domestic colour grade with golden practical lighting. The girlfriend (SUBJECT ID: 003) sits on the sage-green sofa, her body angled slightly forward, her bare feet tucked under her. Her hands hold a small handmade paper card she has just opened — the interior of the card is angled away from camera and out of focus, unreadable. Her expression is caught at the very moment of recognition: eyes slightly widened, lips parted, a stillness in her posture. Warm amber light from a floor lamp pools across her left side; the right side of her face is in soft shadow. The composition frames her in a medium-wide static shot, the sofa and warm-toned wall behind her slightly out of focus. Camera at standing eye-level, slightly above her seated position, looking gently down. The mood is intimate, suspended, the held breath of a personal realisation.
```

That's the bar. Note how:

- Every named entity is referenced by name AND ID where it has one — `the protagonist (SUBJECT ID: 001)`, `the gift shop (ENV ID: 001)`, `the apartment (ENV ID: 002)`. The downstream pipeline uses these IDs to attach the corresponding reference images to the generation call.
- The product would be named as `the plush bear` if it appeared in a starting frame, with no ID — but in this example it does not appear in any Shot 1, so it is absent from these prompts.
- No clothing, face, hair, room furniture, or surface texture is described. All of that is in the reference images.
- Each prompt is 4–6 sentences, focused on composition, camera, posture, lighting, and mood.
- Each prompt closes with a one-line mood phrase.
- Shot 1 specs (colour grade, camera angle, lighting direction, depth of field) are matched faithfully.

That is what the skill is for.
