# Reviewing agent guidance

How to check up on what agents are told: AGENTS.md files, CLAUDE.md, memories and
skills. Do this every month or two, or whenever agents keep going off on side quests.
First done on 2026-11-28: 29 memories went down to 9, the gate rules were merged into
one section, and procedures moved into skills.

## What gets loaded, and what it costs

| Where | Loaded | Cost |
| --- | --- | --- |
| `~/.claude/CLAUDE.md`, `C:\github\AGENTS.md`, this repo's `AGENTS.md` | every session | every line, forever |
| `MEMORY.md` index (`~/.claude/projects/<repo>/memory/`) | every session | one line per memory |
| A memory file | when it looks relevant | the file |
| A skill's `description` (`.claude/skills/*/SKILL.md`) | every session | one line |
| A skill's body | when a task matches | the file |
| `ops/`, `spec/`, `docs/` | only when something points there | nothing until read |

So: **always-loaded files hold tripwires, skills hold procedures, `ops/` holds the long
detail, and memories hold dated owner preferences.**

## What goes wrong

1. **One incident becomes a permanent order.** "design-verify was slow today" turned
   into "never run gates". Each rewrite got stricter, and nothing said when it ended.
2. **"How to apply" lines create work.** "Check neighbours too", "every sprint in every
   roadmap", "count it among the required gates".
3. **Exceptions pile up.** By 2026-11-28, i18n had a base rule plus four exceptions in
   four different files.
4. **The same rule in two places drifts apart.** Memory and AGENTS.md gave different
   log folders. A memory listed a check that `check:static` no longer ran.
5. **Rules about one moment outlive it:** "other developers keep changing the menu",
   "the large uncommitted tree is yours".
6. **Dangling pointers:** scripts telling agents to load a skill that never existed,
   memories linking to deleted memories, indexes that don't exist.

## Steps

1. **Read everything that's always loaded,** in full: both AGENTS.md files, CLAUDE.md,
   MEMORY.md and every memory file. Note each rule's date and its reason.
2. **Sort each rule** into one of:
   - **a value** (lasting product taste, such as "Twitter, never X"): keep it as a
     memory or AGENTS.md line;
   - **a procedure** (steps for one kind of task): move it to a skill or `ops/` runbook;
   - **enforced by code** (a check script, spec assertion or lint rule): delete the
     prose, or leave a one-line pointer;
   - **a moment that has passed:** delete it;
   - **private** (business, design or consent discussion): move it to a private repo's
     `spec/` (`../mawkingbird_native/spec`, `../mawkingbird_starters/spec`).
3. **Find contradictions.** Grep the always-loaded files, skills and runbooks for the
   same topic (`make test`, `log`, `i18n`, `push`, `menu`). Each topic should be stated
   in one place. Ask the owner which version wins. Don't pick one yourself.
4. **Check pointers.** Every file, skill, script, make target and `[[memory]]` link
   named in guidance must exist. Grep scripts and Makefiles for skill names too.
5. **Check facts against code.** If guidance says a check covers X, read the
   `package.json` or Makefile. If it gives timings, time it.
6. **Check skills.** The description names the task that triggers it, not the topic. The
   body has under ~80 lines, links to `ops/` for detail, and nothing a check already
   enforces. Every skill is listed in the AGENTS.md skills table.
7. **Ask the owner, don't decide.** Bring a list: what to delete, what to merge, what
   contradicts what, plus questions. Make changes only after they answer.
8. **After changes,** list the follow-up tasks you created (stale docs, code that
   enforces an old rule) in your report or in a `spec/sprint/` file.

## Writing new guidance

- Say what the owner wants and why, with a date. Don't write "always" or "every" unless
  they said it.
- Limit "how to apply" to the task where the rule comes up. Never "also sweep the rest
  of the app".
- Add to the existing place for a topic. Don't create a second one.
- If a check can enforce it, write the check and keep the prose to one line.

## Not yet reviewed (2026-11-28)

- `C:\github\AGENTS.md` (the workspace file loaded in every repo): its HTTPX2, Python
  3.15 and wheels sections don't apply to this Angular repo. Candidates for skills.
- `../mawkingbird_native/AGENTS.md` and `../mawkingbird_starters` guidance.
- Docs that still require heavy gates as routine. Grep `ops/`, `spec/` and Makefile
  comments for "make test".
