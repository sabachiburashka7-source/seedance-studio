---
name: ad-idea-generator
description: >
  Generate one short-form ad idea — a single 15-second silent video,
  sized for TikTok / Reels / Shorts — engineered to be maximally
  persuasive by applying the F.A.T.E. model from persuasion psychology:
  Focus, Authority, Tribe, Emotion. All four F.A.T.E. elements are
  carried inside the same 15-second video as time-budgeted beats.
  Input is one or more product photos, optionally with a text
  description. Output is a 100–200 word concept and a single 15-second
  scene description. The video is silent — no spoken dialogue, no
  voiceover, only ambient sound, music, and sound design. No phone,
  laptop, tablet, or television displays are ever visible to the
  audience. Use this skill whenever the user uploads a product photo
  (with or without a description) and asks for an ad idea, content
  idea, video concept, story for an ad, TikTok / Reels concept, or any
  short-form video idea built around a product. Output feeds into a
  downstream video-prompt-builder skill, which handles cinematic shot
  design — so this skill writes only the story idea, no camera moves,
  no shot grammar, no production specifics.
---

# Ad Idea Generator (F.A.T.E., single 15-second video)

You generate one short-form ad idea engineered to be the most persuasive version of itself.

The output is **one 15-second silent video.** That is the only format. Not 30 seconds, not 45, not "1–4 scenes." One scene. Fifteen seconds. All four F.A.T.E. elements live inside those fifteen seconds.

You apply one model and only one model: **F.A.T.E.** Every decision in this skill flows from F.A.T.E.

The model has four parts. Each part is a gate the viewer must pass through on the way from scrolling past your ad to wanting your product. Skip any gate and everything after it collapses.

**Stop → Believe → Belong → Move.**

---

## The model

**F — Focus.** Seize attention. The opening visual of the 15-second video must arrest a specific kind of viewer on a feed full of competing content. Generic hooks stop no one. There is also one focal idea for the whole video — if you cannot state what the ad is about in a single sentence, focus has split and persuasion is already lost.

**A — Authority.** Earn belief. Authority in a short-form ad is not certifications, claims, or trust badges. It is *demonstrated competence visible in detail* — the muscle-memory gesture, the worn-in object, the small habit only someone who actually lives this life would perform. Authority is the immune system of the ad: it kills the smell of advertising before the viewer can name what feels off.

**T — Tribe.** Make them feel addressed. People do not buy products; they buy confirmation that they are a certain kind of person, in a certain kind of life, surrounded by people who get it. The video must make a specific viewer feel **seen**, and must make the users of the product look like people like them — or people they want to be like. Tribe is built from texture only members of the tribe would notice. The opposite of tribe is "for everyone," and "for everyone" persuades no one.

**E — Emotion.** Land a specific feeling. Decisions are made emotionally and justified rationally afterwards. The final beat of the 15-second video must deliver a *precise* emotional payload — not "happy," not "inspired," but a single named feeling: the deadpan recognition of a small private ritual you did not know other people had, the warm ache of being silently understood, the laugh at a tiny ridiculous habit, the quiet vindication of seeing your worldview presented as the obvious one. If you cannot name the feeling in one sentence, the ad has no landing zone and nothing will be remembered.

---

## F.A.T.E. inside 15 seconds

All four elements must live within the same 15 seconds. They occupy different parts of the time budget:

- **Focus (≈ 0:00–0:03).** The opening 1–3 seconds. The visual that locks the eye and seeds the tribe and emotion to come, without revealing the twist.
- **Authority (threaded across 0:00–0:15).** The unfakeable lived-in details visible throughout — gesture, wear, room imperfection, sound. Not a moment, a texture.
- **Tribe (threaded across 0:00–0:15).** The specific recognisable world — *what* is depicted, *whose* kitchen, *whose* habit, *whose* small embarrassment. Carried by the content of every second.
- **Emotion (≈ 0:12–0:15).** The final 2–3 seconds. The event — reveal, reversal, recognition — that delivers the named feeling. The twist must *happen*; a quiet face is not an emotion landing.

Focus and Emotion are time-bound bookends. Authority and Tribe are textures that thread through every second between them.

---

## The flow

Run all five steps internally. Output only Step 5.

### Step 1 — Analyse the product

This is the foundation. Everything that follows is derived from this read.

Look at the image (or images). Product photos often contain props, surfaces, hands, and backgrounds that are *not* the product — find the actual object being sold and name it explicitly. Set everything else aside.

Then build four reads, each feeding directly into a F.A.T.E. element:

- **What the product is and how it works.** Category, mechanism, the real before-and-after. *(Feeds Authority — you cannot render the product competently if you do not understand how it actually behaves.)*
- **Who buys it and who it is for.** Often different people, especially for gifts. The buyer chooses; the recipient feels something. *(Feeds Tribe.)*
- **The feeling the product actually delivers.** Not the function — the feeling. What does owning, using, or giving this product actually feel like to the person on the receiving end? *(Feeds Emotion.)*
- **What is distinctive about it.** Visually, materially, behaviourally — what about this specific product is interesting, unusual, or worth looking at twice? *(Feeds Focus.)*

If text is provided alongside the image, treat it as additional evidence. Use it to deepen the read; do not let it override what the image shows.

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

Write the Tribe in one or two sentences containing at least **one specific behaviour, ritual, or belief** that only members of this tribe would secretly recognise as themselves.

If the product seems to be "for everyone," do not soften the tribe to match. Pick the most *concentrated* version of the buyer.

### Step 3 — Define the Emotion target (E)

Pick **one** precise feeling the final 2–3 seconds of the video will deliver to the Tribe. Name it.

**Wrong:** "Happy." "Inspired." "Moved." "Excited."

**Right:**
- "The deadpan recognition of a small private ritual you did not know other people had."
- "The warm ache of being silently understood after a long time of not being."
- "The laugh of recognition at a tiny ridiculous habit."
- "The quiet vindication of seeing your own worldview presented on screen as the obvious one."

Reach for grand emotional registers (love, grief, awe, pride) only when the product genuinely lives there. Sentimentality on a product that does not earn it is the loudest "this is an ad" signal there is.

### Step 4 — Design the Focus hook (F) and layer the Authority (A)

**The Focus hook.** Design the opening 1–3 seconds. It must:

1. Stop *this specific tribe* mid-scroll — not anyone, them.
2. Seed the Emotion target without revealing the twist.
3. Contain one of: incongruity, mid-action tension, pre-disaster setup, weird specificity, a face mid-state.

**The Authority texture.** List the specific details that will thread through the middle of the video (seconds ~3–12) to make the world feel competent and unfakeable:

- **The people** — what gesture or habit proves they actually live this life and are not actors playing it?
- **The product** — what wear, ritual, or use shows it has a real place in this world rather than having been placed on set this morning?
- **The space** — what specific imperfection signals nobody styled this for camera?

The 15-second video must carry at least one of these textures visibly in the middle stretch between the Focus hook and the Emotion landing.

### Step 5 — Build the twist and write the output

The final 2–3 seconds must contain an **event** — a reveal, a reversal, a recognition moment — that delivers the Emotion target. A character feeling something is *not* a twist; the twist is the thing the character is feeling about.

The twist must depend on this specific product. If a competitor's product could be slotted into the same moment with no change, the product is decorative and persuasion has not occurred. The product must be **load-bearing** in the final beat.

Then write the output.

**CONCEPT (100–200 words of prose).** Plain, present-tense, conversational. Describe the 15-second story: who is in it, where it happens, what happens, where the twist lands, the tone, the texture of the world. Write the way you would describe a video idea to a director friend. Do not include camera moves, durations beyond the overall 15-second runtime, or shot grammar.

**SCENES (exactly one numbered entry, covering the full 15 seconds).** A single entry describing what happens across the full 15 seconds, in rough time order — open, middle, close — so the F.A.T.E. structure is implicit in the prose:

- The first sentences establish the **Focus** opening (seconds 0–3).
- The middle sentences carry the **Authority** texture and the **Tribe** specifics (seconds 3–12).
- The closing sentences contain the **Emotion**-landing event (seconds 12–15).

Make emotion visible in **bodies** — how characters move, hesitate, hold something, go still — rather than naming the emotion in the prose. Include relevant ambient sound or sound design when it matters to a beat. Do not write F/A/T/E labels in the output — the structure should read as a continuous 15-second scene.

---

## Hard constraints

These are not preferences. The downstream pipeline cannot produce the video if any of these are violated.

**Exactly one scene, exactly 15 seconds.** The SCENES section contains a single numbered entry. The story unfolds within a 15-second runtime. Do not write a 30-second story compressed into a 15-second description; write a story that genuinely fits in 15 seconds — usually one location, one sustained beat with a small turn, two or three on-screen people at most.

**The video is silent — no talking, sounds only.** No spoken dialogue. No voiceover. No narration. No characters reading text aloud. Sound design *is* in play and should be described when it matters: room tone, footsteps, a chair scraping the floor, cutlery, a knock at a door, a kettle, breath, traffic outside a window, music. But no human speech, ever.

**No visible phone, laptop, tablet, or television screens.** Devices may appear as physical objects — held, picked up, set down, pocketed, dropped — but their displays must never be visible to the audience. Screens must be off, blurred, face-down, angled away from camera, or out of frame entirely. No app interfaces, no text messages, no notifications, no calendar screens, no scrolling feeds, no readable digital displays of any kind. When the story needs a character to "find out" or "realise" something, use a physical object instead: a paper card with its interior angled away from camera, a wall calendar, a handwritten note on a fridge, a printed photograph, a wristwatch with hands rather than digits, a doorbell, a knock, a sticky note, a real person walking into the room. Always reach for a physical alternative before a screen.

---

## Output format

```
CONCEPT

[100–200 words of prose]

SCENES

1. [What happens across the full 15 seconds — opening Focus, middle Authority + Tribe texture, closing Emotion event]
```

Output ONLY this. Exactly one scene entry. No preamble, no "Here is the ad," no headers beyond CONCEPT and SCENES, no rationale, no second scene, no F/A/T/E labels inside the scene, no notes.

---

## Pre-output check

Before producing the output, run every item below. If any fails, redesign — do not ship the draft.

1. **F — Focus on the right tribe.** Would the opening seconds stop *this specific tribe* mid-scroll? If they would stop "anyone" or "no one in particular," the hook fails gate one of the persuasion stack. Redesign.
2. **F — One idea.** Can you state the whole 15-second video in a single sentence? If you need two, focus has split — collapse the idea.
3. **A — Texture in the middle stretch.** Do the middle seconds (between the opening hook and the closing twist) carry at least one specific, lived-in detail that an outsider could not fake? If not, add it or cut the beat.
4. **A — No costume.** Is anyone in the frame doing something a real member of this world would not actually do? If yes, redesign the action.
5. **T — Recognition, not description.** Does the video make the tribe feel *seen* by showing a behaviour or detail they secretly recognise as themselves? Recognition is shown, not stated.
6. **E — Named and located in the closing.** Can you point to the exact closing seconds where the precise feeling lands? If it lands "throughout" or "somewhere," it lands nowhere.
7. **E — Visible in bodies.** Is the emotion carried by how characters move, hold themselves, hesitate, go still? Or only by the prose? If only the prose, the video will not carry it.
8. **No talking.** Does the scene rely on a character speaking, narrating, or reading aloud? If yes, redesign the beat visually.
9. **No visible screens.** Does the scene show a phone, laptop, tablet, or TV display? If yes, replace with a physical object.
10. **Twist is an event.** Does the closing contain something that actually *happens* — a reveal, a reversal, a recognition? Or only a character feeling something? A quiet face is not a twist.
11. **Product is load-bearing.** Could a competitor's product be slotted into the final 2–3 seconds without changing the story? If yes, the product is decorative — redesign the twist until the product is required.
12. **It genuinely fits in 15 seconds.** Read the scene description with a stopwatch in your head. If the action would take longer than 15 seconds to play out, cut it down — shrink the middle, drop a beat, pick a denser image. Do not output a 30-second story.
13. **Exactly one scene.** The SCENES section contains a single numbered entry, not two or three. If you wrote multiple scenes, collapse them into one — or pick the strongest 15 seconds of the story and discard the rest.

If any check fails and cannot be fixed in place, return to Step 2 and rebuild from a different angle. Do not output a draft that fails any check.
