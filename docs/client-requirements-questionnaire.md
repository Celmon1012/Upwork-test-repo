# Oral evaluation UI — client requirements questionnaire

Use this document to lock direction before the next build. You do not need to be a designer: answer in bullets, pick options, or attach 1–2 annotated screenshots. Where you are unsure, write **“dealer’s choice”** and the developer will propose one option for you to approve.

---

## Message you can send as-is (intro)

> To match your direction—a real DPE-style evaluation moment, not a quiz UI—I need a few decisions in writing. Below is a short checklist. You don’t need to be a designer: where you’re unsure, pick one or two screenshot references and circle what you like. If you can’t answer a line, say **dealer’s choice** and I’ll propose one option for you to approve.

---

## 1) Success criteria (“done” for this pass)

Reply in **short paragraphs or bullets**:

1. **What does “feels like a real evaluation” mean to you?** (Give **3 bullets**, e.g. judgment before teaching, natural pause, follow-up challenge, examiner tone.)

2. **What would make you say “this still feels like a quiz app”?** (Give **2 bullets**, e.g. loud progress, instant score as hero, form-like layout, sectioned report.)

3. **What is explicitly out of scope for this delivery?** (e.g. only the one reference scenario; no new routes/features.)

**Client answers**

- Real evaluation means:
  - [ ]
  - [ ]
  - [ ]

- Still a quiz app if:
  - [ ]
  - [ ]

- Out of scope:

---

## 2) Reference products (avoid “clone vs inferior” debates)

Name products only as **references for specific dimensions**, not as something to copy wholesale.

1. **Product / URL (optional):** _______________________  
   **Reference dimension:** (e.g. typography, button hierarchy, density, video layout, card chrome—not “everything”)  
   **What may be similar:** _______________________  
   **What must NOT be copied:** _______________________

2. **Second product (optional):** _______________________  
   **Reference dimension:** _______________________  
   **What may be similar:** _______________________  
   **What must NOT be copied:** _______________________

**Optional:** Attach **2 screenshots** with arrows or short notes on the **exact** UI pieces you want to move toward.

---

## 3) Layout and structure (feedback / evaluation moment)

They affect whether the screen reads as **evaluation** vs **question + form**.

1. **Feedback layout:** Which model do you want?
   - [ ] **A.** Fixed regions (e.g. judgment pinned, examiner transcript scrolls, actions pinned)
   - [ ] **B.** One continuous flowing column (everything scrolls together)
   - [ ] **C.** Other (describe): _______________________

2. **Continue button:** It must stay visible without scrolling the examiner text.
   - [ ] Pinned bottom dock / rail  
   - [ ] Inline only (may scroll away)  
   - [ ] Other: _______________________

3. **During feedback, should the original question prompt stay visible?**
   - [ ] Yes — recap strip at top  
   - [ ] No — feedback only  
   - [ ] Dealer’s choice

4. **Reading order** (confirm or reorder):
   - [ ] Judgment first → examiner explanation → optional model answer (behind “Show me answer”)

**Notes**

---

## 4) Interaction and timing (examiner “presence”)

1. **Pause after submit** before feedback begins:  
   - [ ] About **1–2 seconds** fixed  
   - [ ] Scales with length of evaluation  
   - [ ] Other: _______________________

2. **Feedback presentation:**
   - [ ] Stream / type in gradually  
   - [ ] Appear in blocks / chunks  
   - [ ] Dealer’s choice  

3. **Auto-scroll** as new examiner lines appear:
   - [ ] Yes — keep newest text in view  
   - [ ] No — user scrolls manually  
   - [ ] Yes, but **do not** jump scroll if the user has scrolled up (respect manual reading)

**Notes**

---

## 5) Visual design without Figma

Pick **one** way to answer (or combine lightly):

| Option | What you provide |
|--------|------------------|
| **A. Mood** | **3 adjectives** for the UI (e.g. cockpit, calm, premium) + **1 anti-adjective** (e.g. not playful, not gamified) |
| **B. Tokens** | Primary button: light vs dark feel; corner radius: small / medium / large; density: compact vs comfortable |
| **C. Annotated refs** | Screenshots with notes on spacing and how strong the primary button should feel vs secondaries |

**Optional ranges** (easier than exact pixels):

- Title size on desktop: closer to **24px** / **32px** / **don’t care**
- Button style personality: closer to **iOS solid primary** / **Material outlined** / **custom / premium pill** / **don’t care**

**Client choices**

- Mood (A): _______________________
- Tokens (B): _______________________
- Annotated refs (C): *(attach or link)*

---

## 6) Controls and microcopy

Confirm or edit labels:

| Control | Default label | Keep? | If no, use |
|---------|----------------|-------|------------|
| Primary forward | Continue | [ ] | |
| Retry | Try again | [ ] | |
| Model answer | Show me answer / Hide | [ ] | |
| Bookmark | Review later | [ ] | |

**Review later** presentation:

- [ ] Small text link **below** Try again / Show me answer (not a fourth outline button)

**Score (0–3):**

- [ ] Stays **secondary** — only after examiner content, never the hero  
- [ ] Placement OK near footer / action area only  
- [ ] Other: _______________________

---

## 7) Content — lock the one reference scenario

Target: **airspace / Class B entry** style flow — **3 questions** with **at least one follow-up challenge** (per prior direction).

Deliver **one** of:

- [ ] Final question texts (paste below), **or**
- [ ] Edits to developer draft (attach), **or**
- [ ] Approval: “use developer draft after one revision round”

**Paste or attach**

- Question 1:  
- Question 2:  
- Question 3:  
- Follow-up challenge (minimum one):  
- **Pass cue** — what a satisfactory answer must include (bullets OK):

---

## 8) Review process (reduce iteration loops)

Agree in writing:

1. **Bundled feedback:** One round per build with **2 things you like** and **2 changes** (numbered).
2. **Review artifact:** Short **Loom** (or similar) walking **one full pass** through the scenario + **Vercel link**.
3. **Consolidation:** Feedback within **48 hours**, grouped into **numbered items** that map to sections above.

**Acknowledged:** [ ] Client  [ ] Developer

---

## 9) What not to use as the only brief

- Vague “make it feel real” without answering sections **1–4** and **7**.
- Binary “is it better than [brand]?” — instead use **1–5 ratings** after each milestone on:
  - Sophistication of controls  
  - Clarity of hierarchy  
  - “Evaluation moment” (not quiz)

**Ratings after next build** (optional):

| Criterion | 1–5 | Comment |
|-----------|-----|---------|
| Sophistication | | |
| Clarity | | |
| Evaluation feel | | |

---

## 10) One-page approval template

| Area | Client choice | Notes |
|------|----------------|-------|
| References (§2) | | |
| Layout — feedback (§3) | | |
| Pinned actions / Continue (§3) | | |
| Interaction / timing (§4) | | |
| Visual direction (§5) | | |
| Labels / score rules (§6) | | |
| Scenario copy (§7) | | |
| Review rules (§8) | | |
| **Sign-off for build #** | | **Date:** |

---

### Bottom line for stakeholders

Pixel-perfect specs are optional. **Written decisions**, **references with boundaries**, and **acceptance rules** are required so implementation stays aligned and feedback stays fair.
