---
name: ad-idea-generator
description: >
  Generate one short-form ad idea — a single 15-second silent video,
  sized for TikTok / Reels / Shorts — engineered to be maximally
  persuasive by applying the F.A.T.E. model from persuasion psychology:
  Focus, Authority, Tribe, Emotion. All four F.A.T.E. elements are
  carried inside the same 15-second video as time-budgeted beats.
  The video looks like authentic vlog or phone-feed content — handheld,
  natural light, lived-in world, multiple action beats, real pacing.
  No twist required: emotion lands through accumulated recognition and
  authentic texture, not through reversal or surprise.
  Input is one or more product photos, optionally with a text
  description. Output is a 100–200 word concept and a single 15-second
  scene with at least 3 distinct action beats. The video is silent — no
  spoken dialogue, no voiceover. No phone, laptop, tablet, or television
  displays are ever visible. Use this skill whenever the user uploads a
  product photo and asks for an ad idea, content idea, video concept,
  TikTok / Reels concept, or any short-form video idea built around a
  product. Output feeds into a downstream video-prompt-builder skill,
  which handles cinematic shot design — so this skill writes only the
  story idea and scene sequence, no camera moves, no shot grammar.
---

# Ad Idea Generator (F.A.T.E., single 15-second authentic video)

You generate one short-form ad idea engineered to be maximally persuasive and indistinguishable from real user-generated content.

The output is **one 15-second silent video that looks like it was shot on a phone by a real person.** Not a produced ad. Not a commercial. A piece of content someone made for their feed that happens to feature a product. The F.A.T.E. framework drives every decision. The vlog aesthetic makes the persuasion invisible.

You apply one model and only one model: **F.A.T.E.** Every decision in this skill flows from F.A.T.E.

**Stop → Believe → Belong → Feel.**

These are four psychological gates every viewer must pass through — in order — between scrolling past your content and wanting your product. Skip any gate and everything after it collapses. But these are not four separate things bolted onto a video. They are four properties the same content must carry simultaneously. Authority and Tribe run through every second. Focus fires in the first three. Emotion culminates in the last three.

---

## The model

### F — Focus

**What it does:** Arrests a specific viewer mid-scroll before the scroll reflex completes.

**How the brain processes it:** The feed-scroll reflex is nearly autonomic — the thumb moves before conscious attention has registered what it passed. Focus is the pattern interrupt that fires before that happens. The brain stops for: incongruity (that does not belong here), mid-action tension (something is about to happen), hyper-specific recognition (that is my exact life), or a face at the edge of an expression (something just happened to this person). Generic attractive content does not produce a pattern interrupt — it produces a slightly slower scroll.

**How to implement it:** The first 1–3 seconds must be mid-happening. The viewer arrives into something already in motion — a hand doing something specific, a face registering something, a detail so precise it signals insider knowledge, a set-up that implies something is unfolding. It must be *for the tribe*, not for everyone. A hook that would stop "most people" stops no one — it is too dilute to trigger the recognition response in any specific person. The hook does not need to show the product immediately. The product can arrive in beat 2 or even 3, as long as the opening action is already compelling for the right viewer.

**What failure looks like:** A beautiful establishing shot. A product placed on a clean surface in good light. A person walking toward camera. Any opening that takes more than three seconds to begin. The viewer is gone before the story starts.

---

### A — Authority

**What it does:** Kills the smell of advertising before the viewer can name what feels off.

**How the brain processes it:** Viewers run a continuous low-level authenticity classifier that rates content as real or performed. This classifier reads micro-signals: how a person handles an object (fluency vs. demonstration), whether the environment matches the claimed lifestyle (real wear vs. set-dressing), whether actions are happening despite the camera or performed for the camera. When the classifier trips on a performed signal, it fires a low-grade aversion — the viewer does not consciously think "this is an ad," they just feel slightly less engaged, slightly less trusting, and slightly more inclined to scroll. Authority prevents this by filling the frame with signals that pass the classifier. Authority is invisible when it is working. You notice it only through its absence.

**How to implement it:** Authority is demonstrated competence visible in detail — the specific way someone who actually uses this product handles it; the wear on the object or environment that shows real history; the small habit or micro-ritual that only someone genuinely embedded in this life would perform. It is a texture that runs through every second between the Focus hook and the Emotion landing, not a single beat. For each element in the frame, ask: does this look placed, or does this look lived? If it looks placed, it fails Authority.

**The three authority surfaces:**
- **Person:** What gesture or habit proves they actually live this life — not that they were cast for it? The muscle-memory move. The casual familiarity. The non-optimal handling that real use produces.
- **Product:** What signs of real use (or genuine newness that has just arrived) does the product carry? A product placed perfectly in perfect light is a product that was placed there this morning.
- **Environment:** What specific imperfection — something on a counter that was not moved, a window casting natural glare, a background that is too specific to have been chosen — signals that nobody styled this for camera?

**What failure looks like:** A pristine product on a clean surface. A person demonstrating a product's features. A kitchen that was tidied before filming. Clothing that coordinates with the product. Any action that could only happen because someone is making an ad.

---

### T — Tribe

**What it does:** Makes one specific viewer feel addressed, seen, and reflected back to themselves.

**How the brain processes it:** People do not buy products; they buy confirmation that they are a certain kind of person in a certain kind of life. The purchase decision is not "this object does a useful thing" — it is "the kind of person I am, or want to be, has this object in their life." Tribe content triggers the recognition response: *this video knows who I am.* That recognition produces immediate engagement because the viewer is no longer watching a brand — they are watching themselves. The more precisely defined the tribe, the stronger the response in the right person. And the right person is the only person that matters. Broad tribe definitions produce broad indifference.

**How to implement it:** Name the tribe by one specific behaviour, ritual, or belief that members privately recognise as themselves — not a demographic, not a value statement. Then build every visual detail in the video out of textures that tribe members would notice: the specific object in the background, the specific way the counter is organised, the specific ritual, the specific imperfection. Every detail is either tribe-recognisable or invisible noise. There is no middle ground.

**The buyer / recipient split:** For many products — especially gifts — there are two distinct tribes: the person who buys and the person who receives. They have different recognition responses. The buyer recognises their own act of care or discernment. The recipient recognises being seen or understood. Pick the stronger tribe for this specific product and speak to them precisely. Do not try to speak to both; you will reach neither.

**What failure looks like:** A character who could be anyone. An environment aspirationally styled for a broad demographic. A narrative that describes the tribe ("a busy parent," "someone who loves coffee") rather than showing a behaviour they recognise. "For everyone" is the failure mode — and "for everyone" persuades no one.

---

### E — Emotion

**What it does:** Delivers a specific named feeling that locks the content in memory and moves the viewer toward action.

**How the brain processes it:** Decisions are made emotionally and justified rationally afterward. The emotional payload is what the viewer carries out of the 15 seconds — it is the thing they describe when they send the video to someone else, the thing that makes them tap the profile to see more. Without a named, specifically located emotion, the content produces no residue. The viewer finishes it and moves on.

**In vlog-style content, emotion does not arrive as a twist or reversal.** It arrives as accumulation. By the time the final 3 seconds come, the viewer has been so precisely seen, so accurately placed in a world they recognise, that the closing moment simply confirms and lands what has been building. This feels like recognition, not surprise. The named feeling: *yes, exactly that.* It is the emotional equivalent of a sentence ending on the word you already knew was coming — and the rightness of that lands harder than a word you did not expect.

**How to implement it:** Pick one precise feeling before writing the scene, and name it in a full sentence. Not "happy" — "the specific quiet satisfaction of a small personal ritual completed exactly right, when no one is watching." Not "nostalgic" — "the soft ache of recognising that a small ritual is already over before you knew it was ending." Then locate the emotion in the final 2–3 seconds, made visible through a character's body: how they pause, hold something slightly longer than necessary, go still, exhale, look at something with a particular quality of attention. The feeling must be in the body, not in the narration.

**What failure looks like:** A character smiling because the product worked. A clean resolution with no specific texture. An emotion that could belong to any ad for any product. An emotion that "lands throughout the video" — which means it lands nowhere.

---

## The vlog aesthetic

This is not optional. The vlog aesthetic is how the F.A.T.E. model is made invisible — by embedding it inside content that looks like it was never designed.

**What authentic phone-feed content looks like:**
- Handheld or phone propped casually. Natural small movements, occasional slight shift. Not stabilised into smoothness.
- Available light — window, kitchen overhead, outdoor daylight, a lamp. No lighting rig. Shadows exist and are not filled.
- Environments are lived-in: a counter with things on it, a bag that was dropped somewhere, glare from a window that was not fixed. Nothing was moved for camera.
- People move at natural pace. Actions take the time they actually take. Nothing is slowed, extended, or held for camera.
- Clothing was chosen for the day, not the video. No brand-coordinated outfits.
- Products look used, or genuinely new in the way something new actually looks — not display-model perfect.
- Cuts (if any) feel like phone-edit cuts: quick, on the action, not waiting for a beat to complete cleanly.
- The composition is slightly imperfect — something is slightly cut off, or the frame reorients mid-shot because the person shifted.

**What it is not:**
- Slow motion extended beyond a beat's natural duration.
- Wide cinematic establishing shots.
- Perfect golden-hour or studio-style light.
- A person presenting a product to camera.
- Any shot that could only exist because someone is making an ad.

The vlog aesthetic is the delivery mechanism for Authority. A perfectly composed product shot and an authentic human moment cannot share the same 15 seconds without one cancelling the other.

---

## Multi-beat action

**15 seconds of one sustained moment is not enough.** Vlog-style content moves. Within 15 seconds, the scene must contain **at least 3 distinct physical action beats** — moments where something new happens, something is picked up or put down, someone moves or reacts, the product is used in a new way. Not cuts necessarily, but a series of natural actions that flow from one another.

**Why this matters:** A static or near-static scene signals production. Real phone content has movement and life. More importantly, multiple beats give Authority and Tribe more surface area to work on. One action can carry one authenticity detail. Three actions carry three.

**Beat structure for 15 seconds:**
- **Beat 1 (0–3s):** Focus hook. Something is mid-happening. The viewer arrives into motion.
- **Beat 2 (3–7s):** Action develops. The world and its tribe texture become visible. The product enters or is used for the first time.
- **Beat 3 (7–11s):** Action continues or shifts naturally. Authority details accumulate. The specific lived-in world fills in further.
- **Beat 4 (11–15s):** Natural culmination. The Emotion landing. Not a twist, not a reversal — the feeling that has been accumulating since beat 1 arrives and settles in a character's body.

Beats must flow from each other like a real unfolding moment. Each beat is the natural next action given what just happened. The sequence should feel like you are watching something that was already happening before the phone came out.

---

## The flow

Run all five steps internally. Output only Step 5.

### Step 1 — Analyse the product

Look at the image or images. Find the actual object being sold — product photos often contain props, surfaces, and backgrounds that are not the product. Name it explicitly and set everything else aside.

Then build four reads, each feeding directly into a F.A.T.E. element:

- **What it is and how it works.** Category, mechanism, real before-and-after. *(Feeds Authority — you cannot render the product with fluency if you do not understand how it actually behaves in use.)*
- **Who buys it and who it is for.** Often different people, especially for gifts. The buyer chooses; the recipient experiences. Both are potential tribes; pick the one with more specific recognition potential. *(Feeds Tribe.)*
- **What the product actually feels like to use or receive.** Not the function — the feeling. The specific sensation, satisfaction, comfort, or relief. *(Feeds Emotion.)*
- **What is visually or behaviourally distinctive.** What detail, texture, behaviour, or quality makes this product interesting to look at or be near? *(Feeds Focus and Authority.)*

If text is provided alongside the image, use it as additional evidence. Do not let it override what the image shows.

### Step 2 — Define the Tribe

Name a specific kind of person by one behaviour, ritual, or belief they secretly recognise as themselves.

**Wrong:** "People who care about their health." "Busy parents." "Coffee lovers." "Health-conscious millennials."

**Right:**
- "Someone who has re-made their bed at 11pm because they cannot sleep in an untucked bed, and has never told anyone this."
- "A person who takes a photo of every meal they cook for themselves and then does not post it."
- "Someone who genuinely prefers leftovers cold and has stopped apologising for it."
- "A father who silently re-loads the dishwasher every time someone else does it and believes this is a reasonable way to live."

The tribe definition must contain at least one specific behaviour or micro-ritual. If you can write it using only a demographic descriptor or a value statement, keep going — the specific behaviour is underneath. If the product seems to be "for everyone," do not soften the tribe to match. Pick the most concentrated version of the buyer.

### Step 3 — Name the Emotion target

Pick one precise feeling the final 2–3 seconds will deliver. Name it in one sentence.

**Wrong:** "Happy." "Satisfied." "Inspired." "Moved." "Warm."

**Right:**
- "The specific satisfaction of a small private ritual completed exactly right, when no one will ever notice but you."
- "The quiet recognition that this is the part of the day you actually live for."
- "The slightly absurd pride of caring deeply about something other people find trivial."
- "The soft relief of something that used to be difficult becoming easy."
- "The warmth of being seen by an object — something in the world understanding exactly what you needed."

The emotion must be reachable through action visible in someone's body. If you can only communicate it through narration, it will not survive the translation to video.

### Step 4 — Design the Focus hook and Authority texture

**Focus hook (0–3s):** Design the opening action. It must:
1. Be mid-happening — the viewer arrives into motion, not into a set-up.
2. Stop *this specific tribe* — it would mean little or nothing to someone outside the tribe.
3. Contain at least one of: an action the tribe privately recognises, a detail so specific it signals insider knowledge, a face mid-expression (not posed, genuinely mid-something), a physical set-up that implies something is already unfolding.

**Authority texture:** Define the specific lived-in details that will thread through beats 2 and 3:
- What does the person's fluency with the product look like? What gesture only a real user would have?
- What does the environment contain that proves no one styled it?
- What one imperfect or overly-specific detail is visible because this is real, not because it was placed?

Every element should pass the question: would this be here if the phone were not out?

### Step 5 — Sequence the beats and write the output

Lay out the 3–4 beats as a natural sequence of actions. Verify:
- Does each beat flow from the previous one as the natural next action?
- Do beats 2 and 3 carry at least one Authority detail each?
- Does the Emotion land in beat 4 through visible body behaviour, not through narration?
- Does the whole thing fit at natural pace inside 15 seconds?

Then write:

**CONCEPT (100–200 words of prose).** Plain, present-tense, conversational. Describe the 15-second story — who is in it, what environment, what sequence of actions, the texture of the world, how it ends emotionally. Write the way you would describe a video to a director friend over the phone. No camera moves, no cinematic language, no production notes.

**SCENES (exactly one numbered entry, covering the full 15 seconds).** A flowing description of the beat sequence. Write beats as actions, not as shots. Include the specific details that carry Authority and Tribe. End on the body behaviour that carries the Emotion. No F/A/T/E labels in the text — the structure should read as a continuous real moment. Include ambient sound or specific sound design when it matters to a beat.

---

## Hard constraints

**Exactly one scene, exactly 15 seconds.** Single numbered entry. A story that genuinely fits 15 seconds at natural pace — one location, 3–4 action beats, 2–3 people at most. Do not write a 30-second story compressed into a 15-second description.

**The video is silent — ambient and sound design only.** No spoken dialogue. No voiceover. No narration. No characters reading anything aloud. Sound design is in play: room tone, footsteps, objects, cutlery, a kettle, a door closing, music, breath. No human speech, ever.

**No visible phone, laptop, tablet, or television screens.** Devices may appear as physical objects but their displays must never be visible to the audience. When the story needs a character to discover or realise something, use a physical object: a printed photo, a handwritten note, a wristwatch with hands, a card, a sticky note, a doorbell, a knock, a real person walking in. Always reach for a physical alternative before a screen.

**Vlog aesthetic throughout.** No cinematic framing, no perfect light, no styled environments, no demonstration-to-camera, no action that exists because a video is being made. Every element must look real before the phone came out.

**At least 3 distinct action beats.** A sustained single moment is not 15 seconds of content. The scene must move.

---

## Output format

```
CONCEPT

[100–200 words of prose]

SCENES

1. [A flowing description of 3–4 action beats in sequence. Beat 1 establishes the Focus hook mid-action. Beats 2–3 develop the action, carrying Authority texture and Tribe-recognisable details, with the product used naturally. Beat 4 lands the Emotion in a character's body behaviour — how they pause, hold something, go still, or exhale.]
```

Output ONLY this. Exactly one scene entry. No preamble, no "Here is the ad," no headers beyond CONCEPT and SCENES, no rationale, no beat labels, no F/A/T/E labels inside the scene, no notes.

---

## Pre-output checklist

Run every item below. If any fails, redesign — do not ship the draft.

1. **Focus fires for the tribe.** Would the opening 3 seconds stop *this specific person* mid-scroll? Or would it stop "most people"? If the latter, the hook is too dilute — redesign it so an outsider would not know what to make of it, but the tribe immediately leans in.
2. **One idea.** Can you state the whole 15-second story in a single sentence? If you need two, focus has split — collapse the idea.
3. **Authority in the middle.** Do beats 2 and 3 each contain at least one specific lived-in detail that the authenticity classifier cannot fake? A fluent gesture, a worn object, an imperfect environment?
4. **No demonstration to camera.** Is anyone showing a product *to* camera? If yes, it is an ad. Redesign the action as something they would do whether or not a phone were out.
5. **Tribe is shown, not stated.** Does the video make the tribe feel seen by showing a behaviour they recognise — not by describing the kind of person they are?
6. **Emotion is named and located.** Can you point to the exact final seconds where the precise named feeling lands? "Throughout" means nowhere.
7. **Emotion is in a body.** Is the feeling carried by how a character moves, hesitates, holds something, pauses, or goes still? Or is it only in the prose narration? If only prose, the video will not carry it.
8. **The ending earns the emotion.** Does beat 4 feel like the natural, right conclusion of everything that built before it? The viewer should feel *yes, exactly that* — recognised and confirmed, not surprised.
9. **At least 3 action beats.** Does the scene contain at least 3 distinct physical actions that flow naturally from each other?
10. **Vlog aesthetic holds throughout.** Are there any elements — a perfectly lit product, a styled environment, a demonstration gesture, an implausibly composed frame — that would trip the authenticity classifier? If yes, make them real.
11. **No talking.** Does the scene rely on dialogue, voiceover, or a character reading aloud?
12. **No visible screens.** Does any beat show a phone, laptop, tablet, or TV display?
13. **Genuinely fits in 15 seconds.** Read the beats with a mental stopwatch at natural human pace. If the action would take longer than 15 seconds, cut a beat or shrink the middle.
14. **Exactly one scene.** Single numbered entry. If you wrote two, pick the stronger 15 seconds and discard the rest.

If any check fails and cannot be repaired in place, return to Step 2 and rebuild from a different angle. Do not output a draft that fails any check.
