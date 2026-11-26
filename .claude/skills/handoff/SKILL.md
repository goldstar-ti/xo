---
name: handoff
description: Write or update HANDOFF.md so the next agent with fresh context can continue XO work.
---

Write or update a handoff document so the next agent with fresh context can continue this work.

Steps:
1. Read `HANDOFF.md` in the project root if it exists, so you update it rather than replace it.
2. Read `CLAUDE.md` and `docs/decisions.md`. Do not repeat what they already say; link to them.
3. Create or update `HANDOFF.md` with:
   - **Current state**: what is deployed and what is built.
   - **Done this session**: commits, with short hashes.
   - **What worked**: approaches that succeeded.
   - **What did not work**: approaches that failed, so they are not repeated.
   - **Next steps**: clear action items, in order.
   - **Owner to-do**: anything only the owner can do, as numbered copy-paste steps.
4. A new decision goes in `docs/decisions.md` as the next `D-n`, not only in the handoff.
5. Keep personal names and details out (CLAUDE.md rule 5): write "the owner".

Save as `HANDOFF.md` in the project root and tell the user the file path so they can start a fresh conversation with just that path.
