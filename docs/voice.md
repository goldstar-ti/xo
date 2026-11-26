# XO voice guide

How every piece of text in XO reads: labels, buttons, prompts, reminders, errors, empty states, docs and commit messages. The reader is one person, using the app on a phone, often on a hard day. Write for that person.

## 1. Rules that XO adds

These win over anything below.

1. Australian English. Sentence case everywhere.
2. No emojis. No exclamation marks.
3. The app holds the user's own words. It does not write the plan, score the user, or interpret answers. No praise, no verdicts, no streak language.
4. Notifications stay discreet. The default wording is neutral (`NEUTRAL` in `static/sw.js`). Nothing on a lock screen names a person, a place, a case or a condition.
5. Buttons say what they do: `Save check-in`, `Mark paid`, `Add task`. Not `OK`, `Submit` or `Yes`.
6. Errors say what happened and what to do next. Never blame the user.
7. No personal names or details anywhere in source, tests, docs or commit messages. Write "the owner" for the person who runs XO.
8. Never use an em-dash or en-dash. Use a hyphen, comma, colon or a new sentence.

## 2. Plain writing

1. **Full sentences, with articles.** `Add the first small step.` not `Add first step`.
2. **Say "you".** `You can change this in Appearance.`
3. **Start with what the reader sees or wants to do**, not with how the app works inside.
4. **Be specific.** Give the number, the name, the place to tap. `Reminder in 15 minutes` beats `Reminder soon`.
5. **Use the words on the screen.** Name a control exactly as it is labelled.
6. **One name per thing.** The kinds are appointment, task, routine, bill, obligation, check-in, plan. Do not rename them in prose.
7. **The reader is not stupid.** Do not explain what a clearly named control does. Say a thing once, where the reader will look for it. Do not tell them to "click the button".
8. **Give the reason only when it changes what the reader does:** warnings, anything that cannot be undone, anything that looks wrong but is not.
9. **Say the next step.** An error or an empty state ends with what to do, when there is something to do.
10. **Never state a fact you cannot find in the code.** Do not guess causes.
11. **Leave good text alone.** A label that already reads naturally stays.
12. **Contractions where you would say them aloud** (`can't`, `don't`). None in warnings about losing data.
13. **Internal names stay out of sentences.** Write `Done`, not `done`; kind names such as `checkin` appear only in technical docs, in backticks.

## 3. Sentence length

One idea per sentence. The Australian Government Style Manual sets an average of 15 words and no sentence over 25. GOV.UK uses the same ceiling.

- Average 15 words or fewer in any prompt, help text or document.
- No sentence over 25 words. Split at `and`, `so`, `which` or `because`, and start again with the subject.
- Screen text and notifications average nearer 10.
- A semicolon may join two closely linked statements. Never chain more than one in a sentence.
- Vary the length. A 6-word sentence next to a 14-word one reads better than two of 10.
- A paragraph is one to three sentences.

## 4. Signs of AI writing: avoid all of these

**Words and phrases:**
delve, leverage, seamless, robust, comprehensive, streamline, empower, unlock, harness, crucial, vital, essential, navigate, foster, elevate, landscape, tapestry, journey, nuance, powerful, effortless, intuitive, simply, just, easily, quickly, at a glance, a wide range of, various, tailored, insights, designed to, allows you to, enables you to, lets you, helps you, stay on top of, whether you're, it's worth noting, note that, keep in mind, importantly, in order to, in summary, in other words, overall, please note, feel free, rest assured, oops, sorry, great, all set, successfully.

**Shapes:**

| Trope | Example | Instead |
|---|---|---|
| Opening that restates the title | `The Tasks screen is a screen that shows tasks.` | Start with what the title does not say |
| "This page lets you..." | `This screen allows you to manage bills.` | `Add bills, set the due date, mark them paid.` |
| Not X, but Y | `It's not a to-do list, it's a plan.` | Say what it is |
| Groups of three | `calm, simple and private` | Keep the one true, specific word |
| Paired synonyms | `quick and easy`, `clear and concise` | One word or none |
| Colon reveal | `The result: a calmer day.` | A plain sentence |
| Question then answer | `Why does this matter? Because...` | State the answer |
| Closing moral | `...so you always know where you stand.` | Stop at the last fact |
| Participle tail | `..., making it easy to plan.` | Cut it, or write a new sentence with a fact |
| Hedge stack | `may potentially help to` | `can`, or the plain claim |
| Intensifiers | `very`, `really`, `extremely`, `highly` | Cut |
| Abstract noun for a verb | `provides visibility of due bills` | `shows bills that are due` |
| Bold lead on every bullet | `**Speed:** ...` `**Safety:** ...` | Bullets only for real lists |
| Cheer and apology | `Oops!` `Sorry, something went wrong.` `Great, all done!` | Say what happened |
| Rhetorical question | `Ready for the day?` | A statement or nothing |
| Exclamation marks, emoji | | Never |

Terse tells go too: dropped articles, noun piles (`Failed save: cell reversion`), `Label: value` for whole explanations, `->` in prose, `(s)` plurals, undefined abbreviations.

## 5. Budgets by text type

| Text | Budget and pattern |
|---|---|
| Label, button, tab | 1 to 3 words. Buttons start with a verb. |
| Title attribute | Only where the name does not say it all. One sentence, 12 words or fewer. An icon button's `title` and `aria-label` match. |
| Field hint | One or two sentences, 25 words or fewer: what to put here, with an example. |
| Empty state | Title says what is missing (`No tasks today`). One sentence says what to do. |
| Toast, success | What happened, 8 words or fewer: `Check-in saved.` |
| Toast or error, failure | What did not happen, the reason if known, the next step: `The reminder was not saved. Try again.` |
| Validation error | The rule with the exact value, using **must**: `The passphrase must be at least 12 characters. This one is 9.` |
| Confirm dialog | Title is the question naming the thing (`Delete this appointment?`). Body says what happens and whether it can be undone. The button is the verb (**Delete**). |
| Check-in prompt | One question, plain words, chips before free text. No interpretation of the answer. |
| Notification | Neutral by default: a kind and a time. No names, places or content. Detailed wording only when the owner turns it on. |
| Docs | Plain sentences. Identifiers verbatim in backticks. Keep every decision, reason, gotcha and command. |
| Commit message | A plain sentence subject. The body says why. No personal details. |

## 6. Before and after

| Type | Now | New |
|---|---|---|
| Empty state | `No items` | `No tasks today` / `Add one small first step.` |
| Toast | `Error saving` | `The check-in was not saved. Try again.` |
| Toast | `Success!` | `Check-in saved.` |
| Button | `Submit` | `Save check-in` |
| Confirm | `Are you sure?` | `Delete this bill?` / `This cannot be undone.` / **Delete** |
| Validation | `Invalid passphrase` | `The passphrase must be at least 12 characters. This one is 9.` |
| Help | `Leverage routines to stay on top of your day.` | `Routines repeat every day. Tick one when it is done.` |
