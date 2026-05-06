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
  fixed one-liner "generate this product multi angle reference sheet image highlighting details visually"
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

**4. The product reference is one literal line.**
For the product, output exactly: `generate this product multi angle reference sheet image highlighting details visually`. Nothing more. The pipeline attaches the actual product photo to the image-generation call, so the generator works from the real object rather than a description.

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

Each character reference sheet follows this template. Adapt the panel layout and details to the character, but keep all the marked elements present.

```
CHARACTER: [character name or role description]

Character reference sheet, professional studio format. [Nationality / ethnicity if relevant to story], [gender], [age range], [build / body type]. [Hair color, length, texture]. [Eye color]. [Facial hair if any]. [Skin tone]. [Distinctive facial features, expression baseline]. Full body front view on left side, full body side profile on right side. Multiple face close-ups in bottom half — front view, 3/4 angle view, and [expression study relevant to the story]. Color palette swatches shown on side. Clothing: [every garment, fabric, color, fit, condition]. Posture [posture description tied to character's role in the story]. Expression [expression description — specific, observable, not abstract]. Annotations pointing to hair style, eye color, fabric material, [any other distinctive features]. Clean white background. Photorealistic, shot on Canon R5, professional lighting. Label at top left: SUBJECT ID: 0XX. Label at top right: [SHORT NAME OR ROLE LABEL IN ALL CAPS]. Small color swatches showing: [3-5 colors that define the character — clothing tones, skin tone, hair].
```

Required elements every character sheet must contain:
- Panel layout describing where each view sits in the composite image
- At least three face views (front, 3/4, plus one expression study tied to the story)
- Specific clothing description (every garment named with fabric and colour)
- Specific posture and expression notes
- Color palette swatches mentioned on the side
- Annotation lines mentioned, pointing to specific features
- Clean white background
- `Photorealistic, shot on Canon R5, professional lighting`
- ID labels in the exact format: `Label at top left: SUBJECT ID: 0XX.` and `Label at top right: [LABEL].`
- Small color swatches list (3-5 colors)

### Environment reference sheet format

```
ENVIRONMENT: [environment name and state]

Environment reference sheet, professional format. [Specific location with cultural / regional context], photorealistic photography style. Real interior photography, not illustrated, not drawn, not rendered. Shot on Canon R5, natural lighting.

MASTER SPATIAL MAP: Back Wall — [material / dominant fixed object pinned here]. Left Wall — [what defines it: window, shelving, door]. Right Wall — [what defines it]. Center Floor — [flooring material, central furniture or open space]. Anchor Objects: [Object A] pinned to [position]; [Object B] pinned to [position].

PROXIMITY CONSTRAINTS: [Object A] and [Object B] are not on the same wall — a clear [X]-metre open floor gap separates them. [Object C] does not touch [Object D]. Name the empty spaces; the void is part of the layout.

GLOBAL ANCHOR: [Window / ceiling fixture / architectural feature] is the Global Anchor — its light-cast and position must read consistently in all three panels.

LOCKED CAMERA POSITION: [Single fixed viewpoint for all three panels — the natural entry point or widest natural viewing angle, e.g. "standing in the doorway, camera facing the back wall." The camera does not move between panels; only the focal length changes.]

Panel 1 — Wide shot (full room): [Everything in frame from this locked position. Left third of frame: describe what's there. Center third: describe. Right third: describe. Global Anchor visible. All Anchor Objects visible and in their mapped positions.]
Panel 2 — Medium zoom (hero zone): [Zoom into the dominant furniture grouping or narrative-relevant area. Center-frame subject named. Background wall still partially visible behind, confirming room identity. Global Anchor still in frame or its light still reading.]
Panel 3 — Close-up (surface detail): [Zoom further into the key object or surface. Name the textures, objects, lived-in details. A slice of background — one wall, the flooring, a window edge — still visible to anchor the close-up in the same space.]

[Architectural specifics: walls, flooring, ceiling height]. [Window / lighting source — quality, direction, consistent with Global Anchor]. [Furniture and key objects — specific, named, positions matching Spatial Map]. [Clutter / state / lived-in quality]. [Overall mood]. [Color tone]. Color swatches bottom right. Annotation lines pointing to key elements. Photorealistic interior photography. Label top left: ENV ID: 0XX. Label top right: [SHORT LOCATION NAME] — [STATE OR MOOD DESCRIPTOR IN ALL CAPS]. Hyper-realistic, no illustration, no cartoon, no 3D render.
```

Required elements every environment sheet must contain:
- **MASTER SPATIAL MAP** block — Back Wall, Left Wall, Right Wall, Center Floor, named Anchor Objects with pinned positions
- **PROXIMITY CONSTRAINTS** block — explicit open floor gaps between key objects
- **GLOBAL ANCHOR** — one light source or architectural feature that reads consistently across all panels
- **LOCKED CAMERA POSITION** — one fixed viewpoint declared for all three panels; the camera never moves, only the focal length changes
- **Three panels in order: wide → medium zoom → close-up**, all from the same locked position, each describing what fills left / center / right third of frame (or center subject + periphery for panels 2 and 3)
- Photorealism declaration up front (`photorealistic photography style. Real interior photography, not illustrated, not drawn, not rendered.`)
- `Shot on Canon R5, natural lighting`
- Specific architectural detail consistent with Spatial Map
- Furniture and objects with positions matching Anchor Object pins
- Mood and color tone descriptors
- Color swatches (bottom right), annotation lines
- ID labels: `Label top left: ENV ID: 0XX.` and `Label top right: [LABEL] — [STATE].`
- Closing disclaimer: `Hyper-realistic, no illustration, no cartoon, no 3D render.`

### Product reference sheet format

Always exactly this, and nothing else:

```
PRODUCT: [product name]

generate this product multi angle reference sheet image highlighting details visually
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

Character reference sheet, professional studio format. Georgian man, late 20s, medium build, slightly tall and slim. Dark brown short hair, neatly cropped, slightly messy on top. Brown eyes, faint stubble beard along the jaw and chin. Light olive skin. Slightly thick eyebrows, calm symmetrical face, faint vertical line between the brows from worry. Full body front view on left side, full body side profile on right side. Multiple face close-ups in bottom half — front view, 3/4 angle view, and tense searching expression with eyes scanning. Color palette swatches shown on side. Clothing: dark navy wool single-breasted overcoat falling to mid-thigh, slim notch lapels, slightly wrinkled at the elbows; charcoal grey crew-neck wool sweater underneath; faded indigo straight-leg jeans; brown leather lace-up boots scuffed at the toes. Posture upright but slightly forward-leaning, shoulders carrying tension, arms slightly tense at sides. Expression strained, focused, lips pressed thin — the expression of a man under quiet pressure. Annotations pointing to hair style, eye color, overcoat fabric, stubble texture, scuffed boot toe. Clean white background. Photorealistic, shot on Canon R5, professional lighting. Label at top left: SUBJECT ID: 001. Label at top right: PROTAGONIST. Small color swatches showing: dark navy wool, charcoal grey, faded indigo, warm olive skin tone, dark brown.

CHARACTER: The shopkeeper (mid-60s, watchful retail veteran)

Character reference sheet, professional studio format. Georgian woman, mid-60s, medium build, soft and grounded posture. Silver-grey hair pulled back into a low loose bun, a few wisps loose at the temples. Hazel eyes, soft round face, gentle smile lines at the eyes and mouth. Pale skin lightly lined. No facial hair. Full body front view on left side, full body side profile on right side. Multiple face close-ups in bottom half — front view, 3/4 angle view, and gentle watchful expression with eyes tracking off-camera. Color palette swatches shown on side. Clothing: deep burgundy knit cardigan over a cream cotton blouse buttoned to the collar, thin gold chain at the neck, navy linen apron tied at the waist, knee-length charcoal wool skirt, opaque dark stockings, low-heeled black leather lace-up shoes. Posture upright, weight grounded, hands clasped lightly at hip height. Expression gently watchful, neither stern nor warm. Annotations pointing to silver bun hairstyle, gold neck chain, apron fabric, cardigan knit pattern. Clean white background. Photorealistic, shot on Canon R5, professional lighting. Label at top left: SUBJECT ID: 002. Label at top right: SHOPKEEPER. Small color swatches showing: deep burgundy, cream, navy linen, charcoal grey, silver-grey hair.

CHARACTER: The girlfriend (late 20s, the protagonist's partner)

Character reference sheet, professional studio format. Georgian woman, late 20s, slim build, slight and graceful. Long wavy dark brown hair falling past the shoulders, parted in the middle. Warm brown eyes, full lips, slightly heart-shaped face with high cheekbones, light olive skin. No facial hair. Full body front view on left side, full body side profile on right side. Multiple face close-ups in bottom half — front view, 3/4 angle view, and quiet realisation expression with eyes slightly widened and lips parted. Color palette swatches shown on side. Clothing: oversized cream cable-knit pullover sweater falling to mid-thigh with sleeves slightly long over the hands, dark grey cotton leggings, barefoot. A delicate gold chain at the collarbone. Posture relaxed, weight slightly on the left leg, hands tucked partly into the sweater sleeves. Expression open and slightly curious in baseline; the realisation study shows quiet recognition rather than shock. Annotations pointing to hair waves, sweater knit texture, gold chain, bare feet. Clean white background. Photorealistic, shot on Canon R5, professional lighting. Label at top left: SUBJECT ID: 003. Label at top right: GIRLFRIEND. Small color swatches showing: cream cable-knit, dark grey, warm olive skin tone, dark brown hair, gold.

=== PRODUCT REFERENCE SHEET ===

PRODUCT: The plush bear

generate this product multi angle reference sheet image highlighting details visually

=== ENVIRONMENT REFERENCE SHEETS ===

ENVIRONMENT: The gift shop (small Tbilisi-style independent retail interior)

Environment reference sheet, professional format. Small Tbilisi-style independent gift shop interior, photorealistic photography style. Real interior photography, not illustrated, not drawn, not rendered. Shot on Canon R5, natural lighting.

MASTER SPATIAL MAP: Back Wall — cream-painted plaster, wooden counter with brass cash register and low stool pinned to the rear-right corner. Left Wall — floor-to-ceiling honey-toned wooden shelves the full length of the left wall, wooden stepladder pinned mid-left two metres from rear. Right Wall — floor-to-ceiling wooden shelves. Center Floor — pale grey wood-plank flooring, open walking aisle front-to-back, no furniture crossing the aisle. Anchor Objects: counter pinned rear-right corner; front window with gauze curtains pinned front-right corner; stepladder pinned left wall mid-room.

PROXIMITY CONSTRAINTS: Counter (rear-right) and stepladder (left wall mid-room) are on opposite sides — a clear 2.5-metre open aisle separates them. Plush-toy cluster sits only on upper-left shelves, not on the counter. No shelving crosses the center aisle.

GLOBAL ANCHOR: The front window with gauze curtains (front-right corner) is the Global Anchor — its diffuse daylight wash falls left-to-right across the room and must read in all three panels, either directly in frame or as directional light on the shelves and floor.

LOCKED CAMERA POSITION: Standing just inside the front entrance at center, camera facing the back wall. All three panels shot from this position; only the focal length changes.

Panel 1 — Wide shot (full room): Full shop in frame from this entrance position. Left third: left-wall shelving run floor to ceiling, stepladder mid-left, shelves densely packed with candles, mugs, card displays. Center third: open grey wood-plank aisle receding to the back wall, a ceiling pendant lamp above, a handwritten paper sign hanging from the ceiling text-blurred. Right third: right-wall shelving, front window with gauze curtains in the foreground right letting diffuse daylight in, its light falling diagonally left across the floor. Counter with brass cash register visible rear-right. All Anchor Objects in mapped positions.
Panel 2 — Medium zoom (back-wall counter zone): Zoom toward the rear-right counter. Counter centered in frame with brass cash register and low stool. Left edge of frame: left-wall shelves with warm pendant light above. Right edge: corner of the right-wall shelves. Back plaster wall visible behind counter. Global Anchor window light still reading as warm-left directional fall across the counter surface. Low stool tucked under the counter right side.
Panel 3 — Close-up (shelf detail): Zoom into a dense mid-height section of the left-wall shelves. Center frame: woven baskets, glass vases with dried flowers, small framed botanical prints, paper-wrapped pillar candles. Upper shelf edge visible above with plush toys. The grey plank flooring visible at the very bottom of the frame, the open aisle behind confirming the room. Warm overhead pendant light falling from above-right.

Cream-painted plaster walls with slight wear and uneven patches, honey-toned wooden shelves floor to ceiling on three walls, pale grey wood-plank flooring slightly scuffed, low ceilings. Front-right window gauze curtains, diffuse soft daylight. Warm overhead pendant bulbs on simple cords. Counter rear-right: brass cash register, low stool, short glass display case. Shelves: paper-wrapped pillar candles, pastel ceramic mugs, framed botanical prints, woven baskets, dried-flower glass vases, paper card standing displays, plush toys upper-left shelves. Stepladder left wall. Trailing potted plant left rear corner. Handwritten paper ceiling sign, text blurred, angled from camera. Overall mood: cosy, slightly overstuffed, unchanged for thirty years. Warm honey and amber tone with cream highlights. Color swatches bottom right. Annotation lines pointing to honey-toned shelves, gauze window, brass cash register, stepladder, plush-toy upper shelf. Photorealistic interior photography. Label top left: ENV ID: 001. Label top right: GIFT SHOP — DAYTIME RETAIL STATE. Hyper-realistic, no illustration, no cartoon, no 3D render.

ENVIRONMENT: The apartment (small Tbilisi-style apartment living room, evening)

Environment reference sheet, professional format. Small Tbilisi-style one-bedroom apartment living room, photorealistic photography style. Real interior photography, not illustrated, not drawn, not rendered. Shot on Canon R5, natural lighting.

MASTER SPATIAL MAP: Back Wall — soft warm-white painted concrete, sage-green velvet two-seater sofa pinned flush against back wall center, framed botanical print on the wall directly above it. Left Wall — single window thin curtains mostly drawn, pinned left-wall center. Right Wall — wooden shelving unit with trailing plants and books pinned right wall. Center Floor — pale honey wood-plank flooring, cream area rug centered under the sofa, low wooden coffee table pinned on the rug 60 cm in front of the sofa. Anchor Objects: sofa back-wall center; floor lamp pinned left of sofa with 30 cm gap between lamp base and sofa arm; coffee table on rug center.

PROXIMITY CONSTRAINTS: Floor lamp (left of sofa) and shelving unit (right wall) are on opposite sides — a clear 2-metre open floor gap separates them. Coffee table does not touch the sofa; 60 cm of rug visible between them. No furniture crowds the left wall below the window.

GLOBAL ANCHOR: The tall floor lamp beside the sofa (left of center) is the Global Anchor — its warm amber uplight is the dominant practical light source and must read in all three panels, either directly visible or as warm amber fall across the sofa and rug surface.

LOCKED CAMERA POSITION: Standing at the room entrance (near the front door), camera facing the back wall. All three panels shot from this position; only the focal length changes.

Panel 1 — Wide shot (full room): Full living room from the entrance. Left third: left-wall window with thin curtains mostly drawn, cool blue evening light diffuse through them, floor lamp standing just right of window in front of the sofa left end. Center third: sage-green sofa against back wall, botanical print above it, cream throw draped over the right arm, cream area rug below with coffee table on it holding three stacked books, a ceramic mug, a white candle. Right third: right-wall shelving unit with trailing plants and blurred framed photographs, kitchen counter edge visible foreground-right with wooden cutting board. Global Anchor floor lamp warm amber uplight falling across the sofa center.
Panel 2 — Medium zoom (sofa and coffee table zone): Zoom toward the sofa. Sofa centered in frame, botanical print on back wall above it. Floor lamp prominent in left edge, its amber shade visible, warm light falling across the sofa left side. Coffee table in foreground center — three stacked books, ceramic mug, white candle lit. Left-wall window visible at far left edge, cool blue bleed. Cream rug texture filling the foreground. Right shelving unit just visible at right edge.
Panel 3 — Close-up (coffee table surface): Zoom to the coffee table top. Three stacked paperback books center frame, small ceramic mug right of stack, single white candle left of stack with soft wax pooling. Cream rug texture filling the frame below the table edge. The sofa's sage-green velvet visible just above the table in the upper portion of the frame, confirming position. Warm amber floor-lamp light falling from the left across the table surface.

Soft warm-white painted concrete walls with very slight unevenness, pale honey wood-plank flooring, cream area rug under the sofa, low ceilings. Left window thin curtains mostly drawn, cool blue evening diffuse light. Tall floor lamp warm amber bulb, dominant practical light. Kitchen pendant just out of frame right casting secondary amber glow. Sage-green velvet two-seater sofa, cream throw over one arm. Framed botanical print above sofa. Low wooden coffee table: three stacked books, ceramic mug, white candle. Wooden shelving unit right wall: trailing plants, blurred framed photographs, small books. Kitchen counter edge foreground right, wooden cutting board. Overall mood: intimate, lived-in, soft evening warmth. Warm amber and honey tones balanced against cool blue window bleed. Color swatches bottom right. Annotation lines pointing to sage-green sofa, floor lamp amber shade, left window cool bleed, coffee table candle, cream area rug. Photorealistic interior photography. Label top left: ENV ID: 002. Label top right: APARTMENT — EVENING DOMESTIC STATE. Hyper-realistic, no illustration, no cartoon, no 3D render.
```

That's the bar. That is what the skill is for.
