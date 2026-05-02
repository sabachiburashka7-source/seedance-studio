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

The output structure depends on the input shape:

- **Single creative brief input** (a one-off video idea, a description, a reference film) → output one combined document covering the whole video, with all four sections (timeline, inventory, density, arc) computed across the entire runtime.
- **Concept + scenes input** (a CONCEPT block followed by a numbered SCENES list, the format produced by `ad-idea-generator`) → output **one self-contained document per scene**, in scene order. Each per-scene document is a complete standalone prompt with its own timeline, inventory, density map, and arc — because each scene will be sent to Seedance as a separate generation call. See the per-scene format below.

### Per-scene output format (for concept + scenes input)

For each scene in the input, produce a complete document with FIVE sections in this order. Repeat the full structure for every scene. Do not produce a single combined document — each scene must stand alone.

**The four sections per scene:**

1. **SHOT-BY-SHOT EFFECTS TIMELINE**
2. **MASTER EFFECTS INVENTORY**
3. **EFFECTS DENSITY MAP**
4. **ENERGY ARC**

Each scene's document begins with a clear header: `=== SCENE [N] OF [TOTAL] — [short scene title] ===`

Visual continuity between scenes (matching the bear's appearance, the protagonist's look, the location's lighting) is **not handled in this skill**. The downstream pipeline supplies reference images and a starting frame to Seedance for each scene, which controls visual consistency far more reliably than text descriptions could. Do not include CONTINUITY blocks, character-match notes, or "identical to Scene 1" prose in the per-scene output. Focus only on the shot grammar, effects, and energy of the scene itself.

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

### Combined output format (for a single creative brief, not concept + scenes)

When the input is a single creative brief rather than concept + scenes, output one combined document with these four sections covering the whole video:

1. SHOT-BY-SHOT EFFECTS TIMELINE
2. MASTER EFFECTS INVENTORY
3. EFFECTS DENSITY MAP
4. ENERGY ARC

The same shot-block format applies. Timestamps run continuously across the whole video. Use this combined format only when the input is not in concept + scenes shape.



## Creative principles

These principles should guide every prompt you write:

1. **Contrast drives impact.** Alternate high-density and low-density moments. A slow-motion shot after a speed ramp hits harder than two speed ramps back-to-back.
2. **Signature moments matter.** Every video should have at least one "hero" effect — something visually distinctive that makes it memorable. Call it out explicitly. If the brief already flags a signature visual moment, honour it.
3. **Transitions are shots.** Don't treat transitions as throwaway connectors. A whip pan, a bloom flash, a motion blur smear — these are creative moments, not just cuts.
4. **Specificity over vagueness.** "The frame rotates clockwise by approximately 15-20°" is better than "the camera tilts." "Approximately 20-25% speed" is better than "slow motion."
5. **Energy must resolve.** No matter how intense the opening, the video needs to land. The final moments should feel intentional, not like the effects budget ran out.

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

### Example 1: Single-brief input (combined-document output)

**User says:** "I want a dramatic brand film for a trail running shoe. Mountain setting, golden hour, single runner. Make it feel epic but not over-the-top. About 15 seconds."

**You do:**
1. Read `references/effects-breakdown-reference.txt` to calibrate detail level
2. Generate the full four-section combined output: shot-by-shot timeline (8-12 shots), master effects inventory, density map, and energy arc
3. Present in plain text in chat

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
