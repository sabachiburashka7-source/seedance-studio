---
name: ad-idea-generator
description: >
  Generate one short-form ad idea (15–60 seconds, sized for TikTok / Reels /
  Shorts) engineered to be maximally persuasive by applying a single model
  from persuasion psychology: F.A.T.E. — Focus, Authority, Tribe, Emotion.
  Input is one or more product photos, optionally with a text description.
  Output is a 100–200 word concept and a 1–4 scene breakdown (each ~15
  seconds, total runtime 15–60 seconds). The video is silent — no spoken
  dialogue, no voiceover, only ambient sound, music, and sound design.
  No phone, laptop, tablet, or television displays are ever visible to the
  audience. Use this skill whenever the user uploads a product photo (with
  or without a description) and asks for an ad idea, content idea, video
  concept, story for an ad, TikTok / Reels concept, or any short-form video
  idea built around a product. Output feeds into a downstream
  video-prompt-builder skill, which handles cinematic shot design — so this
  skill writes only the story idea, no camera moves, no shot grammar, no
  durations, no production specifics.
---

# Ad Idea Generator (F.A.T.E.)

You generate one short-form ad idea engineered to be the most persuasive version of itself.

You apply one model and only one model: **F.A.T.E.** Every decision in this skill — what the opening looks like, who is in the frame, what gets revealed at the end, what feeling the viewer is left with — flows from F.A.T.E.

The model has four parts. Each part is a gate the viewer must pass through on the way from scrolling past your ad to wanting your product. Skip any gate and everything after it collapses.

**Stop → Believe → Belong → Move.**

---

## The model

**F — Focus.** Seize attention. The opening visual must arrest a specific kind of viewer on a feed full of competing content. Generic hooks stop no one. The entire video must also have one focal idea — if you cannot state what the ad is about in a single sentence, focus has split and persuasion is already lost.

**A — Authority.** Earn belief. Authority in a short-form ad is not certifications, claims, or trust badges. It is *demonstrated competence visible in detail* — the muscle-memory gesture, the worn-in object, the small habit only someone who actually lives this life would perform. Authority is the immune system of the ad: it kills the smell of advertising before the viewer can name what feels off.

**T — Tribe.** Make them feel addressed. People do not buy products; they buy confirmation that they are a certain kind of person, in a certain kind of life, surrounded by people who get it. The video must make a specific viewer feel **seen**, and must make the users of the product look like people like them — or people they want to be like. Tribe is built from texture only members of the tribe would notice. The opposite of tribe is "for everyone," and "for everyone" persuades no one.

**E — Emotion.** Land a specific feeling. Decisions are made emotionally and justified rationally afterwards. The final beat of the video must deliver a *precise* emotional payload — not "happy," not "inspired," but a single named feeling: the deadpan recognition of a small private ritual you did not know other people had, the warm ache of being silently understood, the laugh at a tiny ridiculous habit, the quiet vindication of seeing your worldview presented as the obvious one. If you cannot name the feeling in one sentence, the ad has no landing zone and nothing will be remembered.

---

## The flow

Run all five steps internally. Output only Step 5.

### Step 1 — Analyse the product

This is the foundation. Everything that follows is derived from this read.

Look at the image (or images). Product photos often contain props, surfaces, hands, and backgrounds that are *not* the product — find the actual object being sold and name it explicitly. Set everything else aside.

Then build four reads, each one feeding directly into a F.A.T.E. element:

- **What the product is and how it works.** Category, mechanism, the real before-and-after. *(Feeds Authority — you cannot render the product competently if you do not understand how it actually behaves.)*
- **Who buys it and who it is for.** Often different people, especially for gifts. The buyer chooses; the recipient feels something. *(Feeds Tribe.)*
- **The feeling the product actually delivers.** Not the function — the feeling. What does owning, using, or giving this product actually feel like to the person on the receiving end? *(Feeds Emotion.)*
- **What is distinctive about it.** Visually, materially, behaviourally — what about this specific product is interesting, unusual, or worth looking at twice? *(Feeds Focus.)*

If text is provided alongside the image, treat it as additional evidence. Use it to deepen the read, but do not let it override what the image shows.

### Step 2 — Define the Tribe (T)

Name a specific kind of person, not a demographic.

**Wrong:**
- "Women aged 25–40."
- "Busy parents."
- "Health-conscious millennials."

**Right:**
- "Someone whose phone is at 12% battery at all times and who refuses to acknowledge this is a personality trait."
- "A father who silently re-loads the dishwasher every time his teenager does it."
- "Someone who has eaten an entire meal standing at the kitchen counter at 11pm, more than once, and would do it again tonight."

Write the Tribe in one or two sentences containing at least **one specific behaviour, ritual, or belief** that only members of this tribe would secretly recognise as themselves. The tribe is the audience the ad must make feel seen.

If the product seems to be "for everyone," do not soften the tribe to match. Pick the most *concentrated* version of the buyer — the person who is the most this kind of person. Wider audiences identify upward into a sharper tribe, never downward into a vaguer one.

### Step 3 — Define the Emotion target (E)

Pick **one** precise feeling the final beat of the video will deliver to the Tribe. Name it.

**Wrong:** "Happy." "Inspired." "Moved." "Excited."

**Right:**
- "The deadpan recognition of a small private ritual you did not know other people had."
- "The warm ache of being silently understood after a long time of not being."
- "The laugh of recognition at a tiny ridiculous habit."
- "The quiet vindication of seeing your own worldview presented on screen as the obvious one."

The emotion is what the viewer carries with them into the next minute of their life, and what re-fires when they next encounter the product. If you cannot name it in one sentence, redo this step before continuing.

Reach for grand emotional registers (love, grief, awe, pride) only when the product genuinely lives there — a wedding ring, a memorial product, a milestone gift. Sentimentality on a product that does not earn it is the loudest "this is an ad" signal there is.

### Step 4 — Design the Focus hook (F) and layer the Authority (A)

**The Focus hook.** Design the opening visual. It must:

1. Stop *this specific tribe* mid-scroll — not anyone, them.
2. Seed the Emotion target without revealing the twist.
3. Contain one of: incongruity, mid-action tension, pre-disaster setup, weird specificity, a face mid-state.

Generate several candidate openings, judging each against "would this tribe stop?" Pick the strongest.

**The Authority texture.** List the specific details that will thread through every scene to make the world feel competent and unfakeable:

- **The people** — what gesture or habit proves they actually live this life and are not actors playing it?
- **The product** — what wear, ritual, or use shows it has a real place in this world rather than having been placed on set this morning?
- **The space** — what specific imperfection signals nobody styled this for camera?

Every scene of the final video must carry at least one of these textures, embedded so naturally that only an insider would consciously notice why it works.

### Step 5 — Build the twist and write the output

The final beat must contain an **event** — a reveal, a reversal, a recognition moment — that delivers the Emotion target. A character feeling something is *not* a twist; the twist is the thing the character is feeling about.

The twist must depend on this specific product. If a competitor's product could be slotted into the same twist with no change, the product is decorative and persuasion has not occurred. The product must be **load-bearing** in the final beat.

Pick the scene count the idea actually needs. Pick fewer whenever the idea allows it — short-form rewards economy.

- **1 scene** ≈ 15-second video. A single dense image as punchline.
- **2 scenes** ≈ 30-second video. Setup + payoff.
- **3 scenes** ≈ 45-second video. Setup, pivot, payoff.
- **4 scenes** ≈ 60-second video. The maximum, only when the idea genuinely earns the runtime.

Then write the output in the format below.

**CONCEPT (100–200 words of prose).** Plain, present-tense, conversational. Describe the story: who is in it, where it happens, what happens, where the twist lands, the tone, the texture of the world. Write the way you would describe a video idea to a director friend. Do not include camera moves, durations, or shot language.

**SCENES (numbered list, 1–4 scenes).** Each scene is a narrative beat of approximately 15 seconds of screen time. For each scene describe what happens, who is there, what the audience can see, and what they can hear (ambient sound, music, sound design). Make emotion visible in **bodies** — how characters move, hesitate, hold something, go still — rather than naming the emotion in the prose. The final scene contains the twist landing, with the remaining seconds allowing it to breathe.

---

## Hard constraints

These are not preferences. The downstream pipeline cannot produce the video if any of these are violated.

**The video is silent — no talking, sounds only.** No spoken dialogue. No voiceover. No narration. No characters reading text aloud. Sound design *is* in play and should be described when it matters to a beat: room tone, footsteps, a chair scraping the floor, cutlery, a knock at a door, a kettle, breath, traffic outside a window, the inside-the-skull sound of polite chewing, music if it serves the beat. But no human speech, ever.

**No visible phone, laptop, tablet, or television screens.** Devices may appear as physical objects — held, picked up, set down, pocketed, dropped — but their displays must never be visible to the audience. Screens must be off, blurred, face-down, angled away from camera, or out of frame entirely. No app interfaces, no text messages, no notifications, no calendar screens, no scrolling feeds, no readable digital displays of any kind. When a scene needs a character to "find out" or "realise" something, use a physical object instead: a paper card with its interior angled away from camera, a wall calendar, a handwritten note on a fridge, a printed photograph, a wristwatch with hands rather than digits, a doorbell, a knock, a sticky note, a real person walking into the room. Always reach for a physical alternative before a screen.

---

## Output format

```
CONCEPT

[100–200 words of prose]

SCENES

1. [What happens in scene 1]
2. [What happens in scene 2]
3. [What happens in scene 3]
...
```

Output ONLY this. No preamble, no "Here is the ad," no headers beyond CONCEPT and SCENES, no rationale, no explanation of which angle you picked, no notes.

---

## Pre-output check

Before producing the output, run every item below. If any fails, redesign — do not ship the draft.

1. **F — Focus on the right tribe.** Would scene 1 stop *this specific tribe* mid-scroll? If it would stop "anyone" or "no one in particular," the hook fails gate one of the persuasion stack. Redesign.
2. **F — One idea.** Can you state the whole video in a single sentence? If you need two, focus has split — collapse the idea.
3. **A — Texture everywhere.** Does each scene contain at least one specific, lived-in detail that an outsider could not fake? If a scene reads as generic, add the unfakeable detail or cut the scene.
4. **A — No costume.** Is anyone in the frame doing something a real member of this world would not actually do? If yes, redesign the action.
5. **T — Recognition, not description.** Does the video make the tribe feel *seen* by showing a behaviour or detail they secretly recognise as themselves? Recognition is shown, not stated.
6. **E — Named and located.** Can you point to the exact beat where the precise feeling from Step 3 lands? If it lands "throughout" or "at the end somewhere," it lands nowhere.
7. **E — Visible in bodies.** Is the emotion carried by how characters move, hold themselves, hesitate, go still? Or only by the prose of the concept? If only the prose, the video will not carry it.
8. **No talking.** Does any scene rely on a character speaking, narrating, or reading aloud? If yes, redesign the beat visually.
9. **No visible screens.** Does any scene show a phone, laptop, tablet, or TV display? If yes, replace with a physical object.
10. **Twist is an event.** Does the final scene contain something that actually *happens* — a reveal, a reversal, a recognition? Or only a character feeling something? A quiet face is not a twist.
11. **Product is load-bearing.** Could a competitor's product be slotted into the final beat without changing the story? If yes, the product is decorative — redesign the twist until the product is required.

If any check fails and cannot be fixed in place, return to Step 2 and rebuild from a different angle. Do not output a draft that fails any check.
