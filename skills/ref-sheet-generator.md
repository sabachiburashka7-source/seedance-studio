---
name: reference-sheet-prompt-generator
description: >
  Generate studio-format reference sheet prompts for every distinct character,
  the product, and every distinct environment in a short-form ad pipeline run.
  Output is grouped by entity type (characters / product / environments), not
  by scene — each entity gets exactly one reference sheet regardless of how
  many scenes it appears in. Characters and environments produce composite
  studio reference sheet prompts in a strict format: panel layouts, ID labels
  (SUBJECT ID for characters, ENV ID for environments), color palette swatches,
  annotation lines, photorealism markers ("Photorealistic, shot on Canon R5,
  professional lighting"), white background for characters, and explicit
  anti-illustration disclaimers for environments. The product entry is the
  fixed one-liner "generate this product reference sheet for consistency"
  because the downstream pipeline supplies the actual product photo to the
  image generator. This skill takes ONE input: the original CONCEPT + SCENES
  output from ad-idea-generator. Use this skill as the second stage of a
  four-stage short-form video pipeline (ad-idea-generator →
  reference-sheet-prompt-generator → starting-frame-prompt-generator →
  video-prompt-builder → image gen → Seedance video gen). The reference images
  produced from this skill's output must exist before the
  starting-frame-prompt-generator runs, because starting frame prompts identify
  entities by the SUBJECT IDs and ENV IDs this skill assigns. The skill is
  silent-video aware. Do not use this skill for ad ideation, video shot-design,
  single-image art prompts, or anything outside the documented pipeline.
---

# Reference Sheet Prompt Generator

You sit in the second position of a four-stage short-form video pipeline:

1. **`ad-idea-generator`** produces a CONCEPT + SCENES output describing a 15–60 second silent video.
2. **You** (`reference-sheet-prompt-generator`) produce reference sheet prompts: one composite character sheet per character, one one-line product reference, one composite environment sheet per environment.
3. **`starting-frame-prompt-generator`** runs *after* this skill (and after the reference images have been generated) to produce per-scene starting frame prompts that explicitly reference the existing reference images by SUBJECT ID and ENV ID.
4. **`video-prompt-builder`** runs last, with full knowledge of the reference sheets and starting frames, to produce per-scene cinematic video prompts where Shot 1 of each scene matches the already-generated starting frame image.

You produce the reference sheet prompts. You do **not** produce starting frames — that is the next skill's job. The pipeline runs them in sequence: this skill first, then image gen on these prompts, then the starting-frame skill (which reads your output to identify entities by ID).

Your job exists because text descriptions alone cannot enforce visual consistency between separately generated video clips. Reference images of the protagonist, the product, and each environment — fed alongside cinematic prompts to the video generator — eliminate the visual drift that text-only continuity introduces.

## Your input

You receive one input from the upstream pipeline:

**The original CONCEPT + SCENES** from `ad-idea-generator`. This is the story-level truth: who is in the video, what happens, what the twist is, the tone, the texture. Use this to identify every distinct character, the product, and every distinct environment, and to gather the story-level specifics that inform their physical descriptions.

## What you produce

Three labeled blocks, in this exact order:

1. **CHARACTER REFERENCE SHEETS** — one composite reference sheet per distinct human character.
2. **PRODUCT REFERENCE SHEET** — exactly one entry, the fixed one-liner.
3. **ENVIRONMENT REFERENCE SHEETS** — one composite reference sheet per distinct location.

You group by entity, not by scene. The protagonist appearing in scenes 1, 2, and 3 gets ONE reference sheet. The product appearing in two scenes gets ONE reference. The location appearing across all scenes gets ONE reference.

You are silent-video aware: you never describe screens displaying readable content, on-screen narration text, or readable digital interfaces in any reference sheet.

---

## Core principles

**1. One reference sheet per entity, ever.**
A character appearing in three scenes gets one reference sheet. A product appearing in two scenes gets one reference. An environment used across all scenes gets one reference. Never duplicate.

**2. Reference sheets are composite studio images.**
Each reference sheet is a single image containing multiple panels — full-body views, face close-ups, expression studies, with color swatches and annotation lines. Not separate generations per angle. One generation per entity, with all the geometric and expressive information packed into the one image as a panel layout.

**3. Reference sheets follow the studio format precisely.**
The format has specific conventions: panel layout description, ID labels at top corners, color palette swatches, annotations pointing to features, white or appropriate background, explicit photorealism marker, and (for environments) an explicit anti-illustration disclaimer. These conventions are not optional — they are how the image generator knows to produce a clean composite reference rather than a stylized illustration.

**3a. Each entity's images are generated as a multi-view batch.**
The pipeline makes one Seedream batch API call per entity (except the product). The batch generates N views of that same entity in one call — front, side, close-up, expression study for characters; wide, medium, close-up for environments. All views are visually consistent because they come from the same generation call. The `VIEWS: N` field in each entity block tells the pipeline how many images to request. Character blocks always use `VIEWS: 4`. Environment blocks always use `VIEWS: 3`. The product block has no `VIEWS` field — it is always a single-image call with the user's product photo attached.

**4. The product reference is one literal line.**
For the product, output exactly: `generate this product reference sheet for consistency`. Nothing more. The pipeline attaches the actual product photo to the image-generation call, so the generator works from the real object rather than a description.

**5. ID numbering is strict and sequential.**
Characters: `SUBJECT ID: 001`, `SUBJECT ID: 002`, `SUBJECT ID: 003`, in the order they first appear in the video.
Environments: `ENV ID: 001`, `ENV ID: 002`, in the order they first appear in the video.
The product gets no ID — its prompt is the fixed one-liner.
No `STUDY 1` suffix.

**6. The IDs you assign are load-bearing for the next skill.**
The downstream `starting-frame-prompt-generator` reads your output and uses the IDs you assign to identify entities in starting frame prompts. If you assign `SUBJECT ID: 001` to the protagonist here, the starting frame skill will write `the protagonist (SUBJECT ID: 001)` in its output. Be consistent: pick the right entity-to-ID mapping the first time, in the order they first appear.

**7. Concrete over abstract.**
"Georgian man, late 20s, medium build, slightly stocky. Dark black short hair, slightly messy and textured. Brown eyes, medium stubble beard" beats "a stressed young man." Image generators reward specificity. Vague prompts produce drift, which defeats the entire purpose of a reference image.

---

## Reference sheet formats

### Character reference sheet format

Each character block produces a **batch of 4 images** — all showing the same character, from different angles and expressions, generated in one API call for visual consistency. The `VIEWS: 4` line tells the pipeline how many images to request.

```
CHARACTER: [character name or role description]
VIEWS: 4

Generate 4 reference images of [character name], maintaining identical appearance across all 4 images. [Nationality / ethnicity if relevant to story], [gender], [age range], [build / body type]. [Hair color, length, texture]. [Eye color]. [Facial hair if any]. [Skin tone]. [Distinctive facial features]. Clothing: [every garment, fabric, color, fit, condition — name each piece]. Photorealistic, shot on Canon R5, professional studio lighting. Clean white background. Label top left: SUBJECT ID: 0XX.

Image 1: Full body front view, neutral upright posture, arms at sides, looking directly at camera.
Image 2: Full body side profile (from the left), same neutral posture, full clothing visible.
Image 3: Close-up portrait, three-quarter angle, neutral composed expression, sharp focus on face and features.
Image 4: Close-up portrait, [expression tied to the story — specific and observable, e.g., "stressed searching expression, brow furrowed, jaw tight, eyes scanning" or "quiet realisation, eyes widened, lips slightly parted"].
```

Required elements every character block must contain:
- `VIEWS: 4` on its own line immediately after the CHARACTER: header
- Opening line: `Generate 4 reference images of [character name], maintaining identical appearance across all 4 images.`
- Complete physical description (nationality, gender, age, build, hair, eyes, skin, distinctive features)
- Complete clothing description (every garment, fabric, colour, fit, condition)
- `Photorealistic, shot on Canon R5, professional studio lighting. Clean white background.`
- ID label: `Label top left: SUBJECT ID: 0XX.`
- Four numbered Image lines, in order: full front, full side, face 3/4, story-specific expression

### Environment reference sheet format

Each environment block produces a **batch of 3 images** — all showing the same space from different distances. The `VIEWS: 3` line tells the pipeline how many images to request.

```
ENVIRONMENT: [environment name and state]
VIEWS: 3

Generate 3 reference images of [environment name], maintaining identical environmental details across all 3 images. [Specific location with cultural / regional context]. [Architectural specifics: walls, flooring, ceiling]. [Window / lighting source and quality of light]. [Furniture and key objects — specific, named]. [Clutter / state / lived-in quality]. [Overall mood]. [Color tone]. Real interior photography, not illustrated, not drawn, not rendered. Photorealistic, shot on Canon R5, natural lighting. Label top left: ENV ID: 0XX. Hyper-realistic, no illustration, no cartoon, no 3D render.

Image 1: Wide angle view showing the full space — all walls, floor, ceiling, and major furniture visible.
Image 2: Medium shot focused on [the key area of the space most relevant to the story scenes that take place here].
Image 3: Close-up detail shot of [a specific texture, object cluster, or story-relevant element that will appear in starting frames].
```

Required elements every environment block must contain:
- `VIEWS: 3` on its own line immediately after the ENVIRONMENT: header
- Opening line: `Generate 3 reference images of [environment name], maintaining identical environmental details across all 3 images.`
- Complete architectural description (walls, floor, ceiling, windows, lighting source)
- Complete furniture and object description (specific, named)
- Mood and color tone
- `Real interior photography, not illustrated, not drawn, not rendered. Photorealistic, shot on Canon R5, natural lighting.`
- ID label: `Label top left: ENV ID: 0XX.`
- Anti-illustration: `Hyper-realistic, no illustration, no cartoon, no 3D render.`
- Three numbered Image lines, in order: wide full-space, medium key-area, close-up story-detail

### Product reference sheet format

Always exactly this, and nothing else:

```
PRODUCT: [product name]

generate this product reference sheet for consistency
```

The pipeline supplies the actual product photo to the image generator alongside this prompt. Do not describe the product. Do not write a panel layout. Do not write angles.

---

## How to read your input

Run these steps internally before producing any output:

**Step 1 — Read the CONCEPT + SCENES.**
Build an entity inventory: every distinct character (give each a short role label), the product, every distinct environment. Note story-level specifics for each — age, role in story, relationship to other characters, key visual descriptors mentioned in the scenes, the cultural / regional context.

**Step 2 — Number your entities.**
Assign `SUBJECT ID: 001`, `002`, `003` etc. to characters in order of first appearance.
Assign `ENV ID: 001`, `002` etc. to environments in order of first appearance.
The product has no ID.

**Step 3 — Produce output in the order: characters, product, environments.**

---

## Output structure

Produce three labeled blocks in this order:

```
=== CHARACTER REFERENCE SHEETS ===

[one CHARACTER block per character, in order of first appearance]

=== PRODUCT REFERENCE SHEET ===

[the PRODUCT block, the fixed one-liner]

=== ENVIRONMENT REFERENCE SHEETS ===

[one ENVIRONMENT block per environment, in order of first appearance]
```

Output ONLY these three blocks. No preamble, no rationale, no scene-by-scene grouping, no notes about which characters appear in which scenes.

If the user specifically asks for the entity tracking logic or the reasoning, share it in a follow-up message.

---

## Worked example

**Input A (abbreviated CONCEPT + SCENES):**

> CONCEPT: A man in his late twenties is in a gift shop, sweating, framed as a thriller. He searches frantically among bouquets and wine, then locks onto something across the shop, approaches it slowly, and lifts a small plush bear into the light — the music shifts, the grade warms. He returns home where his girlfriend has just realised it is their anniversary too, having opened a paper card. He hands her the bear. She laughs and cries silently as they hug.
>
> SCENES:
> 1. A man in his late twenties stands frozen in a gift shop, sweat at his hairline, scanning shelves intensely. He picks up roses, then wine, rejecting both. The shopkeeper watches. He paces.
> 2. He locks onto something off-screen, approaches a shelf slowly, and lifts a plush bear in a knit hat and overalls into a shaft of light. The thriller mood dissolves into warmth.
> 3. A young woman sits on a sofa in a small warm apartment, holding an opened paper card with the interior angled away. Her face shifts into recognition. The door opens; he holds out the bear. She laughs and cries silently as they hug.

**Internal entity inventory:**

- Characters: the protagonist (SUBJECT ID: 001), the shopkeeper (SUBJECT ID: 002), the girlfriend (SUBJECT ID: 003).
- Product: the plush bear.
- Environments: the gift shop (ENV ID: 001), the apartment (ENV ID: 002).

**Output:**

```
=== CHARACTER REFERENCE SHEETS ===

CHARACTER: The protagonist (late 20s, anniversary gift-buyer)
VIEWS: 4

Generate 4 reference images of the protagonist, maintaining identical appearance across all 4 images. Georgian man, late 20s, medium build, slightly tall and slim. Dark brown short hair, neatly cropped, slightly messy on top. Brown eyes, faint stubble beard along the jaw and chin. Light olive skin. Slightly thick eyebrows, calm symmetrical face. Clothing: dark navy wool single-breasted overcoat falling to mid-thigh, slim notch lapels, slightly wrinkled at the elbows; charcoal grey crew-neck wool sweater underneath; faded indigo straight-leg jeans; brown leather lace-up boots scuffed at the toes. Photorealistic, shot on Canon R5, professional studio lighting. Clean white background. Label top left: SUBJECT ID: 001.

Image 1: Full body front view, neutral upright posture, arms at sides, looking directly at camera.
Image 2: Full body side profile from the left, same neutral posture, full clothing visible.
Image 3: Close-up portrait, three-quarter angle, neutral composed expression, sharp focus on face.
Image 4: Close-up portrait, stressed searching expression — brow furrowed, jaw tight, eyes scanning as if looking for something he cannot find.

CHARACTER: The shopkeeper (mid-60s, watchful retail veteran)
VIEWS: 4

Generate 4 reference images of the shopkeeper, maintaining identical appearance across all 4 images. Georgian woman, mid-60s, medium build, soft and grounded. Silver-grey hair pulled back into a low loose bun, a few wisps loose at the temples. Hazel eyes, soft round face, gentle smile lines at the eyes and mouth. Pale skin lightly lined. Clothing: deep burgundy knit cardigan over a cream cotton blouse buttoned to the collar, thin gold chain at the neck, navy linen apron tied at the waist, knee-length charcoal wool skirt, opaque dark stockings, low-heeled black leather lace-up shoes. Photorealistic, shot on Canon R5, professional studio lighting. Clean white background. Label top left: SUBJECT ID: 002.

Image 1: Full body front view, neutral upright posture, hands clasped lightly at hip height, looking at camera.
Image 2: Full body side profile from the left, same posture, full clothing visible.
Image 3: Close-up portrait, three-quarter angle, neutral composed expression.
Image 4: Close-up portrait, gently watchful expression — eyes tracking off to the side, mouth in a faint neutral line, the look of someone quietly observing.

CHARACTER: The girlfriend (late 20s, the protagonist's partner)
VIEWS: 4

Generate 4 reference images of the girlfriend, maintaining identical appearance across all 4 images. Georgian woman, late 20s, slim build, slight and graceful. Long wavy dark brown hair falling past the shoulders, parted in the middle. Warm brown eyes, full lips, slightly heart-shaped face with high cheekbones, light olive skin. Clothing: oversized cream cable-knit pullover sweater falling to mid-thigh, sleeves slightly long over the hands; dark grey cotton leggings; barefoot. A delicate gold chain at the collarbone. Photorealistic, shot on Canon R5, professional studio lighting. Clean white background. Label top left: SUBJECT ID: 003.

Image 1: Full body front view, relaxed posture, hands tucked partly into sweater sleeves, looking at camera.
Image 2: Full body side profile from the left, same posture.
Image 3: Close-up portrait, three-quarter angle, neutral open expression.
Image 4: Close-up portrait, quiet realisation expression — eyes slightly widened, lips parted, a stillness before any reaction forms.

=== PRODUCT REFERENCE SHEET ===

PRODUCT: The plush bear

generate this product reference sheet for consistency

=== ENVIRONMENT REFERENCE SHEETS ===

ENVIRONMENT: The gift shop (small Tbilisi-style independent retail interior)
VIEWS: 3

Generate 3 reference images of the gift shop, maintaining identical environmental details across all 3 images. Small Tbilisi-style independent gift shop interior. Cream-painted plaster walls with slight wear, warm honey-toned wooden shelves running floor to ceiling along three walls, pale grey wood-plank flooring slightly scuffed. One tall window at the front with thin gauze curtains, diffuse daylight mixed with warm overhead pendant bulbs. A wooden counter at the rear right with a small brass cash register and low stool. Shelves densely packed: paper-wrapped pillar candles, ceramic mugs in soft pastels, small framed botanical prints, woven baskets, glass vases of dried flowers, paper cards in standing displays, plush toys on upper shelves. A wooden stepladder leaning against one shelf. Trailing potted plant in a corner. Warm honey and amber colour tone throughout. Real interior photography, not illustrated, not drawn, not rendered. Photorealistic, shot on Canon R5, natural lighting. Label top left: ENV ID: 001. Hyper-realistic, no illustration, no cartoon, no 3D render.

Image 1: Wide angle view showing the full shop — all three walls of shelves, the front window, the counter at the rear, and the floor from front to back.
Image 2: Medium shot of the shelving and counter area, showing the density of goods on the shelves and the counter with the cash register.
Image 3: Close-up detail shot of a cluster of plush toys on the upper shelf — the area the protagonist will reach toward in scene 2.

ENVIRONMENT: The apartment (small Tbilisi-style apartment living room, evening)
VIEWS: 3

Generate 3 reference images of the apartment, maintaining identical environmental details across all 3 images. Small Tbilisi-style one-bedroom apartment living room, evening. Soft warm white painted concrete walls, pale honey-toned wood-plank flooring with a soft cream area rug centred under the sofa, low ceilings. One window on the left wall with thin curtains mostly drawn, cool blue evening light from outside mixed with warm amber light from a tall floor lamp beside the sofa. A sage-green velvet two-seater sofa against the far wall, cream throw blanket draped over one arm. Above the sofa, a single framed botanical print. A low wooden coffee table holding a stack of three books, a small ceramic mug, a single white candle. Behind the floor lamp, a wooden shelving unit with trailing plants and small books. Warm amber and honey tones throughout, cool blue from the window. Real interior photography, not illustrated, not drawn, not rendered. Photorealistic, shot on Canon R5, natural lighting. Label top left: ENV ID: 002. Hyper-realistic, no illustration, no cartoon, no 3D render.

Image 1: Wide angle view showing the full living room — sofa, floor lamp, coffee table, window, and shelving unit all visible.
Image 2: Medium shot of the sofa and the area in front of it, showing the sage-green sofa with the cream throw, the coffee table, and the warm lamp light.
Image 3: Close-up detail shot of the coffee table — the stack of books, the ceramic mug, the white candle, in warm amber light.
```

That's the bar. That is what the skill is for.
