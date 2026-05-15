---
name: video-prompt-builder
description: Generate detailed, shot-by-shot AI video prompts for Seedance 2.0 from a creative brief. Use this skill whenever the user wants to create a video prompt, write a shot list, plan a video sequence, describe a video concept for AI generation, or mentions Seedance. Also trigger when the user describes a scene, ad concept, brand film, product video, or any visual sequence they want turned into structured prompts — even if they don't explicitly say "video prompt." Trigger on phrases like "write me a video prompt", "Seedance prompt", "shot list", "plan a video", "video concept", "create a sequence", "brand film prompt", "ad prompt", or any time the user describes what they want to happen in a video and needs it translated into generation-ready prompts.
---

# Video Prompt Builder for Seedance 2.0

Build cinematic, shot-by-shot video prompts from a creative brief. Every output follows a structured effects breakdown format designed to give Seedance 2.0 maximum detail on camera work, effects, transitions, pacing, and energy arc.

## How this skill works

1. The user provides a **creative brief** — this can be as simple as "a runner in a stadium for a Nike-style ad" or as detailed as a full storyboard description. They may also provide a reference video, mood, brand context, or specific effects they want.
2. Read the reference file at `references/effects-breakdown-reference.txt` to internalise the structure and level of detail expected.
3. Generate a complete video prompt in plain text, structured into the four mandatory sections below.

## Input expectations

The user's brief can include any combination of:
- Subject/talent description (who or what is on screen)
- Setting/environment
- Mood, tone, energy level
- Brand or product context
- Specific effects or camera moves they want
- Duration target
- Reference to existing ads, films, or visual styles
- Colour palette or grade preferences

If the brief is too vague to build a full prompt (e.g. "make something cool"), ask one focused clarifying question before proceeding. Don't over-interrogate — work with what you're given and make creative decisions where the user hasn't specified.

## Output structure

**Always use the per-scene format below**, regardless of input shape. Whether the input is a single creative brief, a paragraph with embedded timestamps, or a CONCEPT+SCENES block, always output one self-contained document per scene (or one document for a single-scene input) with the `=== SCENE [N] OF [TOTAL] ===` header. Never produce a headerless "combined document" — the downstream pipeline depends on the header to parse output.

- **Single creative brief or single-scene input** (a one-off video idea, a description, a paragraph with embedded timestamps) → treat it as a single scene and output exactly one per-scene document with header `=== SCENE 1 OF 1 — [short title] ===`.
- **Concept + scenes input** (a CONCEPT block followed by a numbered SCENES list, the format produced by `ad-idea-generator`, optionally with reference sheet prompts and starting frame prompts appended) → output **one self-contained document per scene**, in scene order.

### Per-scene output format

For each scene in the input, produce a complete document with FIVE sections in this order. Repeat the full structure for every scene. Do not produce a single combined document — each scene must stand alone.

**The four sections per scene:**

1. **SHOT-BY-SHOT EFFECTS TIMELINE**
2. **MASTER EFFECTS INVENTORY**
3. **EFFECTS DENSITY MAP**
4. **ENERGY ARC**

Each scene's document begins with a clear header: `=== SCENE [N] OF [TOTAL] — [short scene title] ===`

Visual continuity for **environments and products** is handled by the downstream pipeline — those reference images are supplied to the video generator and you don't need to re-describe their identity in prose.

Character continuity, however, is **not** carried by reference images. The video generator's real-person classifier rejects AI-generated portraits, so character reference sheets are intentionally not sent. This has two consequences for every per-scene document you produce:

1. **Every scene that contains a character must describe that character in full visual prose** — face shape, age, ethnicity, hair (colour, length, style, texture), eye colour, build, clothing, posture, distinguishing features, anything that would make the character recognisably the same person across scenes. Do not assume a reference image will fill in the gaps — there is none. Repeat the description in every scene where the character appears, even if it feels redundant. **All human characters must be Caucasian / white European in appearance** — light skin tone, European facial features, hair colour drawn from the European range (blond, brown, black, auburn, red, grey), eye colour from the European range (blue, green, hazel, grey, brown). This applies to every character in every scene without exception, regardless of setting or story. Write these traits into the character description in every scene.
2. **From Scene 2 onward, explicitly state that the character should match the protagonist from the previous scene's video.** The previous scene's finished video is supplied as a continuity reference to the generator, so a line like "matching the protagonist from the previous scene's video reference — the same woman, identical face, hair, build, and clothing" tells the generator to lock onto that look. Pair this with the full prose description so the generator has both the visual reference and the textual anchor.

Do not include CONTINUITY blocks or "identical to Scene 1" framing notes about effects or shot choices — only the character description and the previous-video callback. Stay focused on shot grammar, effects, and energy for everything else.

#### Section 1: SHOT-BY-SHOT EFFECTS TIMELINE

Same format as the standard output, with one critical difference: **timestamps reset to 00:00 at the start of each scene.** The first shot of every scene starts at 00:00, not at the cumulative position in the full video. The total time within one scene's timeline should land at approximately 15 seconds (the scene length).

Each shot gets its own block:

```
SHOT [N] ([timestamp within this scene]) — [Shot Name / Description]
• EFFECT: [Primary effect name] + [secondary effects if stacked]
• [Detailed description of what's happening visually]
• [Camera behaviour — angle, movement, lens if relevant]
• [Speed/timing information]
• [How this shot connects to the next — transition type]
```

Shot numbers also reset per scene — Scene 1's shots are numbered Shot 1, Shot 2, Shot 3...; Scene 2 starts again at Shot 1. This keeps each per-scene document self-contained.

Guidelines for writing shots:
- Each shot should be 1-4 seconds unless the scene calls for longer holds
- Total shot durations within a scene should add up to approximately 15 seconds
- Name effects precisely: "speed ramp (deceleration)" not just "speed ramp"; "digital zoom (scale-in)" not just "zoom"
- Describe stacked effects explicitly — if 3 things happen at once, list all 3
- Include transition logic for shots within the scene: how does this shot EXIT and how does the next shot ENTER?
- For the final shot of a scene, describe how it should end so the next scene can pick up cleanly (does the audio carry? does the grade hold? does it cut to black?)
- Use language Seedance 2.0 can interpret: describe the visual result, not the editing software technique
- Note the scene's most impactful shot with a callout like "This is the SIGNATURE VISUAL EFFECT of this scene"
- Be specific about speed percentages when using slow-motion (e.g. "approximately 20-25% speed")
- Describe motion blur, light behaviour, and atmospheric effects where relevant

#### Section 2: MASTER EFFECTS INVENTORY

A numbered list of every distinct effect used **within this scene only**, with:
- Effect name
- How many times it's used in this scene (e.g. "used 2x")
- Which shots in this scene it appears in
- A one-line description of its role in this scene

This is per-scene, not video-wide. Each scene's inventory is self-contained.

#### Section 3: EFFECTS DENSITY MAP

Break this scene's 15-second timeline into 3–5 second chunks and rate each as:
- **HIGH DENSITY** — 4+ effects stacked or rapid-fire
- **MEDIUM DENSITY** — 2-3 effects
- **LOW DENSITY** — 1 effect or clean/simple footage

Format:
```
[timestamp range within scene] = [DENSITY LEVEL] ([brief list of effects] — [count] effects in [duration])
```

Per-scene only. Timestamps within the scene's 00:00–00:15 range.

#### Section 4: ENERGY ARC

Describe this scene's internal energy arc — how the 15 seconds builds, peaks, and resolves into a state ready for the next scene. Most scenes follow a small two- or three-beat arc within their 15 seconds (setup → development → handoff). The final scene of the video is the only one whose arc must fully resolve; intermediate scenes hand off to the next.

Be specific about the **emotional and energetic state** the scene leaves the viewer in. Intermediate scenes should not feel "complete" — they should land on a beat that creates appetite for the next scene to begin.



## Creative principles

These principles should guide every prompt you write:

1. **Contrast drives impact.** Alternate high-density and low-density moments. A slow-motion shot after a speed ramp hits harder than two speed ramps back-to-back.
2. **Signature moments matter.** Every video should have at least one "hero" effect — something visually distinctive that makes it memorable. Call it out explicitly. If the brief already flags a signature visual moment, honour it.
3. **Transitions are shots.** Don't treat transitions as throwaway connectors. A whip pan, a bloom flash, a motion blur smear — these are creative moments, not just cuts.
4. **Specificity over vagueness.** "The frame rotates clockwise by approximately 15-20°" is better than "the camera tilts." "Approximately 20-25% speed" is better than "slow motion."
5. **Energy must resolve.** No matter how intense the opening, the video needs to land. The final moments should feel intentional, not like the effects budget ran out.

## Set geometry and character life

Two recurring failure modes in generated video — fix both at the prompt level.

### Set geometry must be consistent across every shot

When characters share furniture (a table, a couch, a counter, a car) or when their relative positions matter to the scene, every shot that references position must:

1. **Spell out the shared geometry on first appearance** — "seated opposite her at the same table," "sharing the booth, her on the left, him on the right," "standing shoulder-to-shoulder at the counter." Never write "across the table" without "from her" attached — the bare phrase can be read as "across the room at a different table," and the model will render two tables.
2. **Maintain the geometry in every subsequent shot** that mentions either character's position. Re-anchor with the same wording each time, even if it feels redundant. Singular phrases like "the table" are not enough on their own — pair them with the relational anchor ("opposite her at the same table") at least once per shot.
3. **Keep the camera position consistent with the geometry.** If the camera is across the table from Character A, then Character B (who is sitting opposite A at the same table) is *behind the camera*, not "behind her." Common mistakes that force the model to invent a second table or break the layout:
   - Describing a character as "behind her" while the camera is on an across-table eyeline.
   - Switching the camera from "near side" to "across-table eyeline" between shots without rotating the spatial language to match.
   - Describing a character as "in the background" when the established geometry would put them out of frame or behind the lens.

Before finalising any per-scene document where two or more characters share a confined space, mentally place the camera and confirm each character's described position is reachable from that camera angle. If a shot needs the second character visible behind the first, the camera must be on a side angle looking down the shared furniture — not opposite either character.

### Characters must be visibly alive in every shot

Default failure mode: the model renders waxwork faces with locked, unchanging expressions because the prompt only describes the *primary* action ("she reads," "he stares") and never tells the model the face should evolve. Without explicit micro-life written into the shot, the face freezes for the entire duration.

In every shot that holds on a character's face for more than about a second, write at least one of the following alongside the primary action:

- A blink, or eyes flicking briefly to a different point and back
- A subtle expression shift — the corner of the mouth softening, brow easing, jaw releasing, a quick swallow
- A small head movement — a tilt, a slight turn, a settle
- A breath — a visible inhale, an exhale through the nose
- A weight shift — leaning forward an inch, settling back, adjusting in the chair

Phrase these as natural, unforced beats: "she blinks slowly once, eyes returning to the page," "his jaw releases as he exhales through his nose," "she shifts her weight and her shoulders settle." Never write a character as "expressionless," "frozen," "arrested," "suspended," or "held" unless the comedic or dramatic *gag* of the shot is the unnatural stillness itself (e.g. a deliberate freeze-frame effect). Even in an outwardly "still" shot, the character should be *alive in stillness* — breathing, blinking, micro-shifting — not a mannequin.

For any shot longer than ~3 seconds on the same face, describe two distinct micro-beats so the expression visibly evolves across the shot rather than locking into a single fixed look. Vary the beats across shots within a scene — a blink in Shot 1, a swallow in Shot 2, a brow shift in Shot 3 — so the character reads as a continuously living person rather than a series of identical poses.

## Brief-driven constraints

Some briefs come with hard constraints — the video is silent, the audience speaks a language the model can't generate well, the product is unbranded, etc. **Read the brief for these signals and apply the matching constraints below before writing a single shot.** If any of these constraints apply, they override the default behaviours of this skill.

**Language-free / silent video.**
Triggers: the brief explicitly says no dialogue, no voiceover, no spoken language, "silent," "language-free," targets an audience whose language the model can't generate (Georgian, Armenian, etc.), or describes a treatment in pure visual prose with no quoted lines.

When triggered:
- Do not write any shot that includes spoken dialogue, voiceover narration, or characters delivering lines.
- Do not write any shot that includes readable on-screen text overlays — no subtitles, no captions, no narration cards, no animated text reveals containing sentences. Brand logos and a product name on a final frame are fine if the brief calls for them.
- Sound design (music, ambient sound, sound effects, deliberate silence) is fully in play — describe it explicitly in the relevant shot blocks. Music and SFX are how the video carries rhythm and mood without language.
- Specify timing of musical hits and sonic accents in the shot blocks where they land, not in a separate audio section.

**No readable screen content.**
Triggers: the brief says no phone screens, no laptop screens, no app interfaces, no readable digital displays, or describes a video where screens appear but their content shouldn't be shown.

When triggered:
- Phones, laptops, tablets, TVs, and other screens may appear as physical objects in shots — held, set down, slid across surfaces, dropped, stacked — but their displays must be off, blurred, glare-obscured, angled away from camera, or framed so the screen surface is out of view.
- Do not write shots that include UI mockups, scrolling app feeds, text message threads, notification animations, or any readable digital interface. If a shot needs a screen interaction to make sense, redesign the shot.
- A screen lighting up the user's face with a generic glow (no readable content) is acceptable.

**Concept + scenes input from `ad-idea-generator`.**
If the brief is structured as a CONCEPT block followed by a numbered SCENES list (the output format of the `ad-idea-generator` skill), assume:
- The CONCEPT block tells you the story, the tone, and where the twist lands. Honour all of it.
- The SCENES list defines the *narrative beats*. Each numbered scene corresponds to **approximately 15 seconds of screen time** in the final video. The total video runtime is 15 seconds × number of scenes.
- **Output one self-contained document per scene**, in the per-scene format defined in the Output Structure section above. Each scene will be sent to Seedance as a separate generation call, so each per-scene document must stand alone with its own timeline (timestamps reset to 00:00), its own inventory, density map, and energy arc. Visual continuity across scenes is handled by the downstream image-prompt pipeline supplying reference images and starting frames to Seedance — do not attempt to enforce continuity through text descriptions in the per-scene output.
- Within each scene, you decide the shot count, camera moves, lens choices, durations, and effects density. Internal cuts within a scene are fine. The scene tells you *what happens*; you decide *how it's shot*.
- Do not collapse scenes, do not skip scenes, do not invent extra scenes that change the story. The number of per-scene documents you output must equal the number of scenes in the input.
- The final scene contains the twist. Pace it so the twist lands partway through the scene with enough remaining time for the moment to breathe — don't crush the reveal into the last second.
- Treat both the "language-free / silent video" and "no readable screen content" constraints above as automatically active for any concept-and-scenes input, unless the input explicitly contradicts them. These inputs are designed for silent organic-feeling content by default.

**When reference sheet prompts are provided.**
If the input includes a REFERENCE SHEET PROMPTS block (output of `reference-sheet-prompt-generator`), use the ENV IDs and product entries to identify environments and products in your shot descriptions where helpful — e.g. "the gift shop (ENV ID: 001)". Do not re-describe environment details (room furnishings, walls, lighting fixtures) or product appearance — the environment and product reference images carry that identity for the video generator.

**Character SUBJECT entries are different.** Character reference images are intentionally not sent to the video generator (its real-person classifier rejects AI-generated portraits). You may still use the SUBJECT label for clarity (e.g. "the protagonist (SUBJECT 001)"), but the descriptive prose has to carry the entire identity — face shape and features, age, ethnicity, hair (colour, length, style), eye colour, body type, clothing, posture, distinguishing features. Read the SUBJECT entry from the reference sheet prompts and faithfully embed those details into your shot prose. From Scene 2 onward, also include the explicit "matching the protagonist from the previous scene's video reference" callback.

**When starting frame prompts are provided.**
If the input includes a STARTING FRAME PROMPTS block (output of `starting-frame-prompt-generator`), these describe the literal first frame of each scene as an image that has already been generated. **Shot 1 of each scene must match its starting frame prompt exactly** — same camera angle, same framing, same colour grade, same lighting direction, same entity positions, same mood. The starting frame is the seed the video generator animates from; Shot 1 is the text description of that same image. Treat the starting frame as the locked visual contract for how each scene opens.

**When no starting frame prompts are provided.**
If the input has CONCEPT + SCENES (and optionally REFERENCE SHEET PROMPTS) but no STARTING FRAME PROMPTS block, there is no pre-rendered first frame for the video generator to seed from. In that case:
- Do not write Shot 1 as if matching a locked frame. Design Shot 1 freely from the scene description — choose the opening camera angle, framing, lens, lighting direction, and entity positions yourself, guided by the mood and energy the scene calls for.
- The video generator will receive only **environment and product** reference images (no character refs) plus the previous scene's video for continuity. Environment and product refs carry identity for those entities; character identity must be carried entirely by your shot prose.
- Make Shot 1's opening visual concrete and specific in your text — describe the literal first second the way you'd describe a starting frame, since this scene's text prompt is the only source of opening-frame guidance the generator will get. Camera height, distance to subject, what's in foreground vs background, lighting key direction, dominant colour, and the subject's exact pose/action at t=0.
- For environments and products, continuity across scenes comes from the reference images, so you don't need to re-describe their identity in prose.
- For characters, continuity across scenes is carried by (a) the full character description you write into every scene's prose, and (b) from Scene 2 onward, the previous scene's video supplied as a continuity reference. Always pair both: the prose description AND, on Scene 2+, the explicit "matching the protagonist from the previous scene's video" callback.

## Tone and style

- Write in a direct, technical tone — like a director's shot notes, not a marketing brief
- Use bullet points within each shot block for clarity
- Be concise but complete — every detail should earn its place
- No hype language, no "stunning" or "breathtaking" — describe what happens and let the visuals speak

## Duration calibration

For **single-brief input**, adjust the number of shots and effects density to match the target duration:
- **5-10 seconds**: 4-7 shots, lean and punchy, 1 signature effect
- **10-20 seconds**: 8-14 shots, room for contrast and build, 1-2 signature effects
- **20-30 seconds**: 12-20 shots, full three-act arc, 2-3 signature effects
- **30+ seconds**: Scale accordingly, but maintain density contrast — don't fill every second with effects

If the user doesn't specify a duration, default to 15-20 seconds.

For **concept + scenes input**, the per-scene calibration is fixed at ~15 seconds per scene:
- **Per-scene shot count: 4-8 shots** within each 15-second scene
- **Per-scene signature effect: 0-1** — most scenes don't need a hero effect; the final scene usually has the twist as its signature beat
- **Density:** balance high-density and low-density beats within the 15 seconds. A scene that holds at high density for the full 15 seconds will exhaust the viewer; a scene at low density throughout will feel thin
- The final shot of each scene should land on a clean energetic beat — not feel cut off mid-action, not feel completely resolved (unless it's the final scene of the video)

## Example workflows

### Example 1: Single-brief input (single-scene output)

**User says:** "I want a dramatic brand film for a trail running shoe. Mountain setting, golden hour, single runner. Make it feel epic but not over-the-top. About 15 seconds."

**You do:**
1. Read `references/effects-breakdown-reference.txt` to calibrate detail level
2. Treat as a single scene — output one per-scene document beginning with `=== SCENE 1 OF 1 — Trail Run ===` (or similar short title)
3. Four sections: shot-by-shot timeline (4-8 shots across 15 seconds), master effects inventory, density map, and energy arc
4. Present in plain text in chat

### Example 2: Concept + scenes input (per-scene-document output)

**User pastes:**
```
CONCEPT
[100-200 words of story]

SCENES
1. [first beat]
2. [second beat]
3. [third beat]
```

**You do:**
1. Read `references/effects-breakdown-reference.txt` to calibrate detail level
2. Detect the CONCEPT and SCENES markers — auto-activate the language-free, no-readable-screens, and concept+scenes constraints from the Brief-driven constraints section
3. Generate **three separate self-contained per-scene documents** in scene order, each with four sections (timeline, inventory, density map, energy arc) and timestamps reset to 00:00 within each scene
4. Each scene's document begins with a header like `=== SCENE 1 OF 3 — The Gift Shop Panic ===`
5. Do not include CONTINUITY blocks or character-match prose — the downstream pipeline handles visual consistency via reference images and starting frames
6. Present all three documents back-to-back in plain text in chat, separated by clear scene headers
