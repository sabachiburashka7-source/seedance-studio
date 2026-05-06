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

Each prompt has a fixed four-part structure:

**Part 1 — Reference extraction opener (1 sentence)**
Start every prompt with a sentence that explicitly tells the image generator what to take from each attached reference image, addressing each image by its position number (`Image 1`, `Image 2`, `Image 3`…). The pipeline always attaches reference images in this fixed order:

1. Subject references first, in ascending SUBJECT ID order (SUBJECT_001 → SUBJECT_002 → …)
2. Environment references next, in ascending ENV ID order (ENV_001 → ENV_002 → …)
3. Product reference last, if the product appears in the scene

Count the images for each scene using this rule and write the opener accordingly. Example — scene with protagonist (SUBJECT_001) + gift shop (ENV_001): `Use the protagonist's appearance from Image 1 and the gift shop's layout from Image 2.` Example — scene with protagonist (SUBJECT_001) + girlfriend (SUBJECT_002) + apartment (ENV_001) + product: `Use the protagonist's appearance from Image 1, the girlfriend's appearance from Image 2, the apartment's layout from Image 3, and the product from Image 4.` This positional referencing is the signal Seedream needs to bind each attached image to the correct entity in the generated frame — descriptive references alone are not enough.

**Part 2 — Subject + action + environment backbone (1 sentence)**
Write one clear natural-language sentence: `[subject] [action] [in/at environment]`, naming every entity in the frame with its ID. This is the compositional spine of the prompt. Example: `The protagonist (SUBJECT ID: 001) stands frozen mid-aisle inside the gift shop (ENV ID: 001), facing slightly away from camera, head bowed.`

**Part 3 — Composition, camera, lighting, emotion, product scale (3–5 sentences)**
Expand on the backbone with the frame-specific details the references don't carry:

- **Where each entity sits** in the composition — foreground / midground / background, left / right / centre.
- **Camera angle and framing** — eye-level / low / high, wide / medium / close, static / handheld, depth of field.
- **Lighting direction and quality** — where the light comes from, how it falls, colour temperature.
- **Colour grade or visual style** of this specific frame (e.g. cool teal-and-amber thriller grade, warm domestic golden-hour grade).
- **Facial expression and emotion** — one dedicated sentence per character: what the eyes, brow, and mouth are doing, and the underlying feeling (e.g. "brow furrowed, jaw tight, eyes scanning with the look of a man running out of time"). Never omit this for any scene with a character — it is one of the highest-leverage lines for realism.
- **Product scale and apparent size** — every time the product appears, anchor its size relative to a nearby element (e.g. "fits in one hand, roughly the size of a large mug"). Use the same anchor in every scene. Inconsistent sizing is the most common cross-scene realism failure.

Keep Part 3 to 5 sentences maximum. If it is growing longer, you are re-describing identity details the references already carry — trim those first.

**Part 4 — Style line + mood (2 sentences)**
End every prompt with these two lines in order:
1. `Photorealistic, cinematic photographic style, sharp focus.` — the quality directive that pulls Seedream toward realism and away from illustration.
2. `The mood is [X].` — one short phrase giving emotional direction to the whole frame.

Do NOT describe:
- The protagonist's clothing, face structure, hair, build, ethnicity, age — all of that is in the SUBJECT ID's reference.
- The room's walls, furniture pieces, decoration, surface materials — all of that is in the ENV ID's reference.
- The product's shape, colour, parts, accessories — all of that is in the product reference image.

The reference opener and the style+mood closer are not optional and do not count toward the 5-sentence Part 3 limit.

You are silent-video aware: you never describe screens displaying readable content, on-screen text, or readable digital interfaces in any starting frame. If a screen appears in the frame as a story element, its display must be described as off, blurred, glare-obscured, or angled out of view.

---

## Core principles

**1. The story is the source of truth.**
For each scene, read its description in the CONCEPT + SCENES input. The scene description tells you who is present, what is happening at the opening moment, and what the emotional tone is. Translate that into a specific opening composition — camera angle, framing, where entities are in the frame, what they're doing, how it's lit.

**2. Design the opening frame, don't just describe the story.**
You are making a creative decision about how the scene begins visually. The CONCEPT + SCENES tells you *what* happens; you decide *how the camera sees it at the very first moment*. Choose a camera angle, a lighting direction, a colour grade, and a composition that serve the scene's emotional intent. These choices will be locked in as the starting frame image and must be matched by the video-prompt-builder in its Shot 1.

**3. Reference everything by ID.**
Every named entity that has a reference sheet must be identified in the prompt with its name AND its ID, in the format `the protagonist (SUBJECT ID: 001)` or `the apartment (ENV ID: 002)`. The product is referenced as `the [product name]` without an ID, since it has no SUBJECT/ENV ID — but always name it explicitly so the pipeline knows the product reference image should be attached.

**4. Every prompt follows the four-part structure.**
Part 1 (reference opener) → Part 2 (subject + action + environment backbone) → Part 3 (composition, camera, lighting, emotion, product scale — max 5 sentences) → Part 4 (style line + mood). Every prompt. No exceptions. The opener and closer are not optional add-ons — they are structurally required for Seedream to lock identity to the references and to produce photorealistic output.

**5. The opener uses positional image numbers, not descriptions.**
Seedream reads multi-image inputs by position. The pipeline attaches images in this fixed order: subjects (ascending SUBJECT ID) → environments (ascending ENV ID) → product (if present). Count images per scene and write the opener with `Image 1`, `Image 2`, etc.: `Use the protagonist's appearance from Image 1 and the gift shop's layout from Image 2.` Do not write "from the attached character reference" or similar — Seedream does not parse descriptive labels, only positional numbers. Getting the numbering wrong assigns the wrong reference to the wrong entity.

**6. The style line is always `Photorealistic, cinematic photographic style, sharp focus.`**
Write it verbatim as the first line of Part 4, before the mood phrase. Do not paraphrase it, drop it, or merge it into another sentence. It is the quality directive that pulls Seedream toward realism.

**7. Lock the product's apparent size across all scenes.**
The first time the product appears, state its scale relative to a body part or nearby object (e.g. "fits in one hand, roughly the size of a large mug"). Repeat that same anchor in every scene the product appears in. Never let the described scale drift.

**8. Always describe facial expression and emotion for every character.**
One dedicated sentence per character: eyes, brow, mouth, and the underlying feeling. Vague directions ("looks happy", "appears worried") are not enough. Be precise: "Eyes slightly narrowed, a small involuntary smile pulled back, not yet released." This is one of the highest-leverage lines for realism and emotional impact.

**9. Keep Part 3 to 5 sentences maximum.**
If it is growing longer, you are re-describing identity details the references already carry. Trim those first — never trim the emotion or product-scale sentences.

**10. End on the mood.**
The last line is always a short mood phrase: "The mood is taut, suspenseful." "The mood is intimate, suspended." "The mood is quiet, defeated." One line. It shapes the emotional register of the whole image.

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

**Step 4 — Write each scene's starting frame prompt using the four-part structure.**

- **Part 1 (opener):** Count the attached images for this scene (subjects in ascending ID order, then envs in ascending ID order, then product if present) and write one sentence using positional numbers: `Use the protagonist's appearance from Image 1 and the gift shop's layout from Image 2.` Do not use descriptive labels — use `Image N`.
- **Part 2 (backbone):** One sentence — `[subject] [action] [in/at environment]` — naming every entity with its ID, describing posture, and anchoring them spatially.
- **Part 3 (details, max 5 sentences):** Camera angle and framing. Lighting direction and colour grade. Facial expression per character (eyes, brow, mouth, underlying emotion). Product scale with consistent anchor if product is present.
- **Part 4 (closer):** `Photorealistic, cinematic photographic style, sharp focus.` Then: `The mood is [X].`

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
[Images attached by pipeline: Image 1 = protagonist (SUBJECT_001), Image 2 = gift shop (ENV_001)]
Use the protagonist's appearance from Image 1 and the gift shop's layout from Image 2.
The protagonist (SUBJECT ID: 001) stands frozen mid-aisle inside the gift shop (ENV ID: 001), facing slightly away from camera, head bowed, hands at his sides.
Wide static frame, camera at standing eye-level slightly low, framing him small in the centre with shelves rising tall on either side and the back wall receding into shadow; sharp focus on him, surrounding shop slightly soft.
Hard side-light from frame right in a cool teal-and-amber thriller grade casts deep shadows across the aisle.
Brow furrowed, jaw tight, eyes fixed downward — the look of a man running out of time, sweat faint at his hairline.
Photorealistic, cinematic photographic style, sharp focus.
The mood is taut, suspenseful.

SCENE 2:
[Images attached by pipeline: Image 1 = protagonist (SUBJECT_001), Image 2 = gift shop (ENV_001)]
Use the protagonist's appearance from Image 1 and the gift shop's layout from Image 2.
The protagonist (SUBJECT ID: 001) reaches slowly toward a shelf at the right edge of frame inside the gift shop (ENV ID: 001), his body in three-quarter rear angle, head turned in profile, right arm extending forward.
Static medium frame, camera at shoulder height, background shelves soft and out of focus, the composition drawing the eye along the line of his extended arm toward the off-screen right.
Same cool teal-and-amber thriller grade as Scene 1, but a faint warm bloom enters from the right edge of frame — the colour grade beginning its turn toward warmth.
Eyes fixed off-screen right, jaw unclenched slightly, the rigid tension of Scene 1 releasing into focused intent.
Photorealistic, cinematic photographic style, sharp focus.
The mood is the suspended breath before a discovery.

SCENE 3:
[Images attached by pipeline: Image 1 = girlfriend (SUBJECT_003), Image 2 = apartment (ENV_002)]
Use the girlfriend's appearance from Image 1 and the apartment's layout from Image 2.
The girlfriend (SUBJECT ID: 003) sits on the sofa inside the apartment (ENV ID: 002), her body angled slightly forward, hands holding a small handmade paper card she has just opened — the card's interior angled away from camera, unreadable.
Medium-wide static frame, camera at standing eye-level looking gently down at her seated position; the sofa and wall behind her slightly out of focus.
Warm amber light from a floor lamp pools across her left side; her right side falls into soft shadow; warm domestic golden-hour colour grade.
Eyes slightly widened, lips parted, a stillness in her whole posture — the precise moment of recognition before any reaction has formed.
Photorealistic, cinematic photographic style, sharp focus.
The mood is intimate, suspended, the held breath of a personal realisation.
```

That's the bar. Note how:

- **Part 1 (opener)** uses positional image numbers (`Image 1`, `Image 2`) matching the pipeline's fixed attachment order: subjects (ascending ID) → envs (ascending ID) → product. The bracketed annotation `[Images attached by pipeline: ...]` in the example is for illustration only — do not include it in actual output. Write only the `Use ... from Image N` sentence.
- **Part 2 (backbone)** is one clean subject + action + environment sentence with all IDs present.
- **Part 3 (details)** covers camera, lighting/colour grade, and a precise facial-expression sentence — max 5 sentences, no identity re-description.
- **Part 4 (closer)** ends with `Photorealistic, cinematic photographic style, sharp focus.` then the mood phrase, always in that order.
- No clothing, face structure, hair, room furniture, or surface texture is described — all of that is in the reference images.
- The plush bear would appear as `the plush bear` with no ID, plus a product-scale sentence, if it appeared in any opening frame.

That is what the skill is for.
