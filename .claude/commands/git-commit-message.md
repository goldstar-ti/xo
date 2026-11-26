Your task is to generate a commit message and commit the changes using git.

## Workflow

1. Run `git status`. If files are already staged, use that staging as-is: the owner curated it. If nothing is staged, stage the relevant files for the change, naming them explicitly (`git add path1 path2`), never `git add -A`.
2. Run `git diff --staged` to review what will be committed.
3. Draft a message following the format below.
4. Commit with `git commit -F -` and a heredoc, so a multi-line message has no quoting problems.
5. Show the message that was used.

Never `git add backups/` or `.env`. Never push unless asked.

## Format

```
<Plain sentence subject>

<Body: why the change was made, in short sentences.>

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

## Rules

* The subject is a plain sentence in the imperative, capitalised, no full stop, about 70 characters or fewer: `Serve Web Awesome, Font Awesome and daisyUI locally`. No `feat(scope):` prefix.
* The body explains why, and any decision or limit worth knowing. Do not restate the diff. Wrap at 72 characters.
* Every XO commit ends with the `Co-Authored-By` line above, after a blank line.
* No personal names or details in the message (CLAUDE.md rule 5). No em-dash or en-dash.
* Australian English.

## Avoid

* Vague subjects such as "Update" or "Fix stuff".
* A subject that lists files.
* User text, passphrases, keys or `.env` values anywhere in the message.

## Examples

```
Allow inline styles in the CSP; scripts stay same-origin only

The owner relaxed rule 3 so Web Awesome and daisyUI can be used. A new API
test pins script-src, style-src and the three kept directives.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

```
Use a made-up sign-in name in the tests

Rule 5: the tests carried the owner's initials.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
