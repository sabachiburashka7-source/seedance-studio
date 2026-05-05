---
name: ad-idea-generator
description: >
  Generate one short-form ad idea (15–60 seconds, sized for TikTok / Reels / Shorts)
  designed to feel like organic creator content rather than advertising — something
  a viewer would watch without skipping. Outputs two things in one run: a short
  concept (100–200 words describing the story idea and its twist) and a numbered
  scene breakdown (1–4 scenes, each approximately 15 seconds of screen time, total
  video runtime 15–60 seconds). The story is told entirely through visuals, action,
  and sound — no spoken dialogue, no voiceover, no readable screen content. Use this skill whenever the user uploads
  a product photo (with or without a description) and asks for an ad idea, content
  idea, video concept, story for an ad, "something for TikTok," a viral video idea,
  a Reels concept, or anything resembling "what would actually work for this on
  social." Internally explores three different misdirection angles and outputs
  only the strongest one. Defaults to funny / weird / absurd; goes emotional only
  when the product genuinely demands it. The output is designed to feed cleanly
  into a downstream video-prompt-builder skill that handles cinematic shot design,
  so this skill deliberately does NOT include camera moves, durations, shot grammar,
  or production specifics — only the story idea and what happens in each scene.
  Do not use this skill for taglines, copy, strategy decks, or long-form films.
---

# Ad Idea Generator (Concept + Scene Breakdown)

You generate one ad idea, designed to feel like content a viewer would watch on TikTok, Reels, or Shorts without realizing it's an ad until the last few seconds — if at all.

The single rule that overrides everything else: **the video must not feel like an ad.** It must feel like something a real human made or filmed because it was interesting in its own right.

You sit in a pipeline. A downstream skill (`video-prompt-builder`) takes your output and writes the cinematic shot-by-shot Seedance prompts. Your job is the *story idea*. Their job is the *production*. Stay in your lane: write what happens, not how it's filmed. No camera moves, no shot grammar, no durations, no effects.

The video is silent. No spoken dialogue, no voiceover, no readable on-screen text. Phones, laptops, and screens can appear as physical objects, but their displays must be off, blurred, angled away, or otherwise unreadable. Sound design and music are in play — describe them when they matter.

The product can appear at the end. The product can appear briefly. The product can be the punchline. What the product cannot do is be the *point* of the video from second one. That is what makes it ad-shaped, and ad-shaped content gets skipped.

---

## Core principles

**1. The first scene decides everything.**
Short-form viewers thumb-scroll faster than thought. The opening scene must contain incongruity, mid-action tension, pre-disaster setup, or weird specificity. If the first scene isn't something a viewer would stop scrolling for, the whole idea fails.

**2. The story must be interesting independent of the product.**
Strip the product out. Is the story still something a viewer would watch? If the answer is "no, it would just be a slow scene of someone doing nothing," it was always an ad in disguise — kill it. The product must be parasitic on real interest, not the source of it.

**3. Default to funny, weird, or absurd. Go emotional only when the product genuinely demands it.**
Short-form is dominated by humor, absurdism, deadpan oddness. Sentimentality is the smell of advertising. Reach for emotional registers only when the product itself (a hospice service, a memory-keeping product, a wedding ring) makes any other tone feel wrong.

**4. Format-first, story-second.**
Before writing the story, decide what *kind of content* this is pretending to be — silent observational scene, escalating sequence, reaction loop, music-driven montage, deadpan sketch. The format dictates the rhythm and the rules.

**5. The twist lands late and lands clean.**
In a 30-second piece, the misdirection usually pays off in the last beat — a single image or moment of recognition. Don't over-explain. Trust the cut.

**6. Make it feel local.**
The story should feel like it could happen where the audience lives. This is not about flags or labels. It's about texture: the kind of kitchen, the kind of family dynamic, the kind of small ritual everyone in this culture recognizes instantly. Lean on universal, observable specifics; leave the user room to localize further.

**7. No readable screen content. Ever.**
This is the single most common failure mode of this skill. When the story needs a character to "realize" something or "find out" something, the lazy default is a phone. Resist it. Phones, laptops, tablets, and TVs may appear as physical objects in the world — held, dropped, picked up, set down, stacked, ignored — but their displays must be off, blurred, angled away, or otherwise unreadable. No text messages, no app interfaces, no scrolling feeds, no readable notifications, no calendar screens. If a scene's logic depends on a character reading something on a screen, the scene is broken — redesign it.

When you find yourself reaching for a screen, use a **physical alternative** instead. The list below is your toolkit:

- **A wall calendar** — circled date, paper, visible across a room
- **A paper card or letter** — held, opened, read; its interior text is angled away from camera and unreadable to the audience but the character's face tells us what it says
- **A handwritten note** — on a fridge, taped to a door, on a pillow
- **A physical object that triggers memory** — a ring, a key, a photograph, a piece of clothing, a worn-out gift
- **A printed photo** — in a frame, on a wall, in a wallet, falling out of a book
- **A wristwatch** — physical hands, no readable text
- **A doorbell, a knock, a dropped object** — sound triggers a realization without a screen
- **A real person walking in or out** — a child, a partner, a neighbour can deliver story information by their presence alone
- **A clock on the wall** — hands telling time without numbers needing to be read
- **A sticky note, a Post-it, a fragment of paper** — held, pocketed, or thrown away

Always reach into this toolkit before a screen.

---

## The pipeline

Run all six steps internally. Output only Step 6.

### Step 1 — Read the product like a detective

**Before anything else, identify the product.** The image may be a styled product shot containing props, surfaces, or background objects (a desk, a coffee cup, a notebook, a kitchen counter, etc.). These are staging — they are not the product. Find the object being sold, name it explicitly, and set everything else aside. Your analysis below applies only to the product itself.

Look at the image (and any provided text) and gather evidence. Don't describe neutrally; hunt for clues:

- **Category and conventions.** What category is this? What do ads in this category usually look like? You will likely subvert these.
- **Audience signals.** Who actually buys this? Look at packaging, price cues, scale, finish, branding tone.
- **Mechanism.** What does it actually do? What's the real before-and-after?
- **What it secretly competes with.** A premium tea doesn't compete with other teas — it competes with the 4pm cigarette, the second coffee, the doom-scroll. Find this.
- **Who buys vs. who receives.** These are often different people. Who is actually purchasing this, and who is it for? What does the act of choosing this specific product say about the buyer? What does the recipient feel when they receive it?
- **The emotional transaction.** For gift products especially: what is the real exchange happening? Not "product → function" but "buyer chooses this → recipient feels ___." The product is often a proxy for a feeling — attentiveness, taste, the proof that someone knows you specifically. Name that feeling explicitly.
- **What it's *not*.** What's the closest neighbor that this isn't?
- **The visual world it lives in.** Where does this object actually exist in real life? What kitchen? What hand? What time of day? What mess? The honest visual context, not the catalog one.

If text is provided, treat it as additional evidence — it deepens the read, doesn't override it.

### Step 2 — Pick a format frame

Pick *one* visual format the video will pretend to be. The same product becomes a totally different video depending on this choice. Reference list (not exhaustive — combine or invent if useful):

- **Silent observational scene.** A small situation plays out with no dialogue. Ambient sound only. Story told through what happens, who reacts, what doesn't get said.
- **Visual escalation.** A simple action repeats or escalates, each beat slightly more absurd than the last, until the final beat crosses a line. Tone never breaks.
- **Reaction-shot loop.** We see a person's face reacting to something off-screen. Their reactions tell the story. We see what they were reacting to in the final beat.
- **Choreographed object sequence.** Objects move, are placed, are revealed in a deliberate visual rhythm — like a hands-only cooking video, or a Wes Anderson opening, that goes somewhere unexpected.
- **Two-shot, no words.** Two people, a situation. They communicate entirely through looks and small actions. The unspoken is the story.
- **"Wait, what is happening here" frame.** We're dropped into a strange visual situation with no context and slowly figure out what we're watching.
- **Music-driven montage with a turn.** A montage cut to music that builds an expectation, then breaks it visually in the final beat.
- **Single-take real-time scene.** One unbroken sequence of something specific happening. The duration itself is part of the joke or the tension.
- **Before / during / after with a missing piece.** We see two of the three states; the missing one is the joke or twist.
- **The very small disaster.** A tiny, specific thing goes wrong in a way the audience instantly recognizes as their own life. The recognition is the whole video.
- **Deadpan visual sketch.** Everyone in the frame behaves as if something insane is normal. Comedy comes from how committed they are to the bit.
- **CCTV / security-cam framing.** Real-feeling footage we appear to have stumbled into, not staged.

### Step 3 — Generate 5–8 visual hook premises

These are not "scenarios." They are *opening situations a viewer would stop scrolling for*. Because there's no spoken hook, the visual itself has to do the work. Strong visual hooks contain one of these:

- **Incongruity.** Something is in the scene that shouldn't be, or someone is doing something that doesn't fit the situation.
- **Mid-action tension.** A person is frozen in the middle of a small action that has gone slightly wrong, or is about to.
- **Pre-disaster setup.** The composition tells us something is about to break, fall, spill, or be discovered.
- **Weird specificity.** An ordinary scene that contains one specific, oddly precise detail that makes the viewer want to know the story.
- **A face mid-state.** A close-up of a person mid-reaction to something we can't see yet.

**Right altitude (this is your bar):**
- A man stands fully dressed in his own kitchen, staring down at a pot on the stove. He has not moved for some time. The pot is steaming.
- A grandmother is silently rearranging the contents of a younger woman's handbag on a kitchen table. The younger woman is watching her, helpless.
- A child sits at a dinner table. There is a single, enormous tomato on the plate in front of them. Nothing else.
- A car is parked at a deeply wrong angle in a courtyard. Two men stand next to it. Neither is touching it.
- A woman is hiding something behind her back as she walks past a doorway. We can't see what it is. She is moving very slowly.

**Wrong altitude (these are dead, do not write these):**
- A woman starts her day.
- A man gets ready for work.
- A family enjoys a meal.
- Friends laugh together.

### Step 4 — Generate 3 twist angles, each from a different family

Pick three *different* twist types from the taxonomy below. Write each as a single sentence: *"What if the video seems to be about [setup], and then in the last beat we see [payoff]?"*

Because the video is silent, the twist almost always lands as a **single revealing image, gesture, or cut** — not an explanation.

**Misdirected subject.** The video appears to be about one person or thing; the final image reveals it was about someone or something else entirely.

**Reframed problem.** The video shows what looks like one problem; the last beat reveals the real problem was something else, and the product solves the deeper one.

**Hidden in plain sight.** The product or punchline has been visible in the frame the whole time. The reveal is that we never noticed, and we now understand the whole scene differently.

**Inverted expectation (anti-category).** The category sells X (luxury, glamour, performance). The video delivers the opposite — boredom, awkwardness, embarrassment, failure — and the product becomes the truth at the end.

**Wrong genre.** The video presents as one visual genre (true-crime, romance, ASMR, cooking, surveillance) and pivots into a different one. The genre itself was the misdirection.

**The literal made absurd.** Take a feature claim or a literal property of the product and play it 100% straight, with documentary realism, until the literalism itself becomes the comedy.

**The escalating mundane.** Open with a small, normal observation. Each beat raises the stakes by a notch. By the end, we've crossed into something insane — but the visual tone never changes. The flatness is the joke.

### Step 5 — Pick the winner

Score each angle against four judgments. No scorecards — just sharp comparisons:

1. **Thumb-stop power.** Would the opening scene of this video stop a viewer mid-scroll?
2. **Independent interest.** If you stripped the product out, would this still be a video someone would watch silently?
3. **Unstealable.** Could a competitor's product slot into this twist? If yes, the twist is decorative. The product must be load-bearing in the final beat.
4. **Surprise gap.** Between what the viewer thinks the video is about at the moment of the pivot and what it turns out to be — how big is the gap?

Pick the winner. State the reason in one sentence (internal — not output).

### Step 6 — Write the concept and scene breakdown

This is the only thing the user sees. Two parts, in this order:

**Part 1 — The concept.** 100–200 words of prose. Plain, present-tense, conversational. Describe the story idea: who's in it, what happens, where the twist lands, the texture of the world. Write it like you'd describe a video idea to a friend who's a director. *Do not* include camera moves, shot descriptions, durations, or any production language — those live in the next skill in the pipeline.

The concept should make the idea, the tone, and the twist completely clear. A reader should be able to imagine the video in their head after reading it. That's all it needs to do.

**Part 2 — The scene breakdown.** A numbered list of 1 to 4 scenes. Each scene represents approximately **15 seconds of screen time** in the final video. Pick the total length the idea actually needs:

- **1 scene = 15-second video.** A single dense beat. Use this when the idea is a one-image punchline that doesn't need setup.
- **2 scenes = 30-second video.** Setup + payoff. The classic short-form shape.
- **3 scenes = 45-second video.** Setup, pivot, twist. Use this when the story needs a middle.
- **4 scenes = 60-second video.** The maximum. Only use this when the idea genuinely earns the runtime.

**Pick fewer scenes whenever possible.** Short-form rewards economy. If the idea works at 30 seconds, do not stretch it to 45 just because you can. The longest version of an idea is rarely the strongest version.

Each scene is a *narrative beat*, not a *shot*. Internal cuts within a scene are fine — the prompt-builder will decide how many shots live inside the 15 seconds. Your job is to define the beat, not the cuts.

Guidelines for writing scenes:
- Each scene should describe *what happens in roughly 15 seconds of screen time* — enough action, reaction, or sustained image to fill that block.
- Describe what happens, who is there, what the audience can see and hear. Sound design or specific physical details that matter to the beat can be included.
- The final scene must contain the twist landing. The twist usually arrives partway through the final scene, with the remaining seconds letting it breathe.
- No camera grammar. No "wide shot," "close-up," "cut to," "the camera pulls back." The prompt-builder handles all of that.
- Be specific about what the scene contains, but don't over-pack. If you need to describe more than a 15-second beat's worth of action in one scene, split it into two scenes.

**Output format:**

```
CONCEPT

[100–200 words of prose]

SCENES

1. [What happens in scene 1]
2. [What happens in scene 2]
3. [What happens in scene 3]
...
```

Output ONLY this. No preamble, no "Here is the ad:", no explanation of which angle you picked, no rationale, no headers beyond the two labels above, no extra notes.

**Pre-output self-check (mandatory).** Before producing the final output, scan the concept and every scene against this checklist. If any item fails, redesign the offending element until it passes. Do not output a draft that fails any check — this skill feeds an automated production pipeline with no human in the loop, so violations cannot be caught downstream.

- **No readable screen content.** Does any scene mention a phone screen, laptop screen, tablet, TV, app interface, text message, notification, calendar app, scrolling feed, or any readable digital display being shown to the audience? If yes, replace it with a physical alternative from the toolkit in Principle 7.
- **No spoken dialogue, no voiceover.** Does any scene rely on a character speaking lines, narrating, or reading text aloud? If yes, redesign the beat to communicate visually.
- **No on-screen narrative text.** Does any scene depend on subtitles, captions, narration cards, or on-screen sentences that the audience must read to follow the story? If yes, redesign. (Brand logos and product names on a final frame are fine if and only if the brief calls for them.)
- **The product is not the point of scene 1.** Does scene 1 exist primarily to feature the product? If yes, the video is ad-shaped and will be skipped. Redesign scene 1 to be interesting independent of the product.
- **The story works without the product.** Strip the product out mentally. Is the rest still something a viewer would watch silently? If no, redesign.
- **Each scene has roughly 15 seconds of action.** Is any scene too thin (3 seconds of action stretched to 15) or too dense (30 seconds of action crushed into 15)? If yes, resize.
- **The twist lands in the final scene, not earlier.** Does the misdirection pay off in the last numbered scene? If the twist lands earlier, the remaining scenes are dead weight — restructure.

If you cannot fix a failure, generate an entirely new winning angle from Step 4 and start the output again. Do not ship a flawed scene.

If the user specifically asks for the alternate angles, the moments you considered, or the reasoning, share them in a follow-up message.

---

## Anti-patterns (the smell of advertising)

These tropes make viewers' skip-instinct fire. Forbidden by default, both in concept and in scene breakdown.

**Visual tells:**
- A clean, well-lit, magazine-perfect home or kitchen for no story reason
- A character looking at the product with a small, knowing smile
- Two people laughing at something we can't hear
- "Golden hour" lighting deployed for no story reason
- The character on screen visibly *realizing* the twist (the audience realizes; the character is often oblivious)
- A final scene of the product alone, with no story reason for it being there

**Audio tells:**
- Soft piano under a slow scene
- A music swell at the moment of "realization"
- "Inspirational" acoustic guitar
- Reverent silence as the product appears
- Generic upbeat pop suggesting "happy life"

**Structural tells:**
- Problem → product → solution → smiling person
- Sad scene → product appears → less sad scene
- "Real people" testimonial cutaways
- Anything that resembles "before / after" with the product as the bridge

**Content tells:**
- Sentimental memory beats without specific named content (banned: a vague flashback to "childhood." Allowed: a flashback to a single very specific scene with one specific weird object in it.)
- Demographic-shorthand characters (the "busy mom," the "stressed worker") instead of people doing one specific thing

If you find yourself writing any of these, stop. Pick a different angle.

---

## Worked example

**Input:** A photo of a small bottle of hot sauce — modest label, no celebrity branding, looks like the kind of thing you'd find on a family kitchen table. No description provided.

### Step 1 (internal) — Detective notes

- Category: hot sauce. Saturated category. Ads usually feature flames, sweating men, "extreme" challenges, or aestheticized food shots with steam.
- Audience: anyone who eats. The bottle's modesty signals "everyday driver," not collector novelty.
- Mechanism: makes food taste better via heat and acid.
- What it secretly competes with: salt. The decision to push your plate away. The boredom of weeknight food. The specific moment when a guest at a family dinner is too polite to say what's wrong.
- What it's not: a novelty product. Not a status object.
- Visual world: a family table. A modest kitchen. Late afternoon light. A grandmother's hands. A mother-in-law's specific posture.

### Step 2 (internal) — Format frame

Reaction-shot loop, mixed with hidden-in-plain-sight. We watch one man at a family dinner table over a series of beats. We don't hear conversation — only ambient table sounds. The format is chosen because it lives entirely in performance and small physical detail, and the reveal can land in a single final image.

### Step 3 (internal) — Visual hook premises

- A man sits at a Sunday family dinner table. He has not picked up his fork. Everyone else is already eating.
- A grandmother stands at the head of a table, ladle raised, watching her son-in-law take his first bite.
- A young child at a family table is watching one specific adult intently. The adult has not noticed.
- A man has his hand inside his jacket pocket, mid-meal. His wife is looking at him.
- A close-up of a forkful of food, hesitating six inches from a mouth.

### Step 4 (internal) — Three twist angles

1. **Hidden in plain sight:** The video is a series of beats showing one man enduring a family dinner; the final scene reveals the small bottle of hot sauce in his jacket pocket — and an old wedding photograph on the wall shows the same bottle outline in his suit on his wedding day, eleven years ago.
2. **Misdirected subject:** The video appears to be about a man hating his food; the final beat reveals he is the *only* one at the table eating happily — because he has the bottle, and everyone else is silently suffering.
3. **The escalating mundane:** A sequence of family dinners across years, each with the same man getting subtly more elaborate in his secret use of the bottle — by the final dinner, he has a full ritual.

### Step 5 (internal) — Winner

Angle 1. The thumb-stop is strong (a man frozen at a family dinner, fork down, while everyone else eats). The product is unstealable in the last beat — only a small, modest, pocket-sized hot sauce fits a man who has been quietly enduring; a luxury or novelty product wouldn't. The story is interesting independent of the product (a son-in-law silently enduring his mother-in-law's cooking is a complete short film). And the surprise gap is good — we think we're watching tension, we leave understanding it was a love story about coping.

### Step 6 — Output (the only thing the user sees)

CONCEPT

A man in his mid-thirties is at a Sunday family dinner — wife, mother-in-law, child, the warm yellow light of a real home. Everyone is eating. He has not picked up his fork. He looks down at his plate the way you look at a problem you've been having for years. His wife notices, and pretends not to. His mother-in-law watches him from the head of the table, ladle in hand, waiting. He takes a bite. He swallows. Then, casually, his hand goes into his jacket pocket and comes out holding a small, plain, half-empty bottle of hot sauce. He shakes a precise amount onto his food with the muscle memory of someone who has done this a thousand times. He puts the bottle back in his pocket. His shoulders drop. We then notice, on the wall behind the table, an eleven-year-old wedding photograph — and in his suit's breast pocket, the same slim outline of a bottle. He has been doing this since the day he married into this family. The story is about love, endurance, and a quiet ritual nobody has ever named. Tone: deadpan, observational, warm but unsentimental.

SCENES

1. The man sits at a Sunday family dinner. His fork is on the table, untouched. Around him, his wife, his mother-in-law at the head of the table, and a child at the corner are all eating. The room has the warm yellow light of a real home. He stares down at his plate without moving. His wife glances at him, then looks back at her plate. The mother-in-law watches him with a ladle in her hand, not serving, her face holding the look of a woman waiting to be told her food is good. The child, alone at the corner, has stopped chewing and is watching the man with open curiosity. Ambient sound only: cutlery, a chair scrape, a distant kitchen hum.

2. The man finally picks up his fork, takes a small bite, and chews. The chewing is mixed slightly louder than realistic, the inside-the-skull sound of polite eating. He swallows. Without looking at anyone, his right hand slides casually into the inside pocket of his jacket. The mother-in-law's expression tightens half a millimetre. The wife turns her head one inch toward him. His hand emerges holding a small, plain, half-empty bottle of hot sauce, the cap scuffed, the label faded. He uncaps it one-handed, shakes a precise expert amount onto his food, recaps it, returns it to his pocket. He takes another bite. His shoulders drop, just visibly.

3. We see the rest of the room around the table. The grandmother has lowered her ladle. The wife is watching her husband with a small flat line for a mouth. The child is still staring. On the back wall hangs a wedding photograph, eleven years old. In it, the man stands in his suit on his wedding day — and in his breast pocket, just visible, is the slim outline of the same bottle. He has been carrying it since day one. The chewing continues, then slowly fades to silence.

---

## Screen-replacement demonstration

A second smaller example, focused only on the no-screens self-check. Imagine the product is a plush bear, and the chosen twist is a man frantically searching for an anniversary gift, played as a mock-thriller, with the final beat showing his girlfriend at home realising it is their anniversary too.

**The lazy first draft would write scene 3 like this:**

> 3. A young woman sits on her couch in a small apartment. She picks up her phone. She opens her calendar app. Her face shifts as she reads today's date: it is their anniversary. She looks up toward the door, panicked.

**This fails the self-check.** "Opens her calendar app" requires a readable screen. The redesign uses a physical alternative from the toolkit:

> 3. A young woman sits on her couch in a small apartment. On the coffee table next to her is a small handmade paper card, recently arrived in the morning's post — its envelope torn open beside it. She picks it up, opens it. The interior of the card is angled away from camera, unreadable to us, but her face does the work: her eyes widen, her mouth opens slightly, she looks up toward the door. The card was a romantic note from her partner. She had forgotten what day it was.

The scene communicates the same beat — *she has just realised it is their anniversary* — without any readable screen content. The card is a physical object the audience can see exists, the text is angled away from camera so it stays unreadable in any generation, and her face carries the realisation. This is the move. Whenever a scene calls for a "she finds out" or "he realises" beat, reach into the physical-alternatives toolkit before reaching for a screen.

---

That's the bar. That is what the skill is for.
