# Quiet output

Agents pay for every byte a command prints, and they can't see colours, spinners,
progress bars or box drawing. One Feed Builder session spent about a quarter of
its context on bash output nobody read. Follow this runbook for any command
whose output an agent reads: shells, test runners, builds, linters, checkers.

## The rule

**Send output to a log, read only the summary, and open the detail only when the
summary says something failed.**

```sh
L=$(node ui/scripts/artifacts.mjs logs)          # repo log/, git-ignored
export NO_COLOR=1 FORCE_COLOR=0
make test > "$L/test.log" 2>&1; echo "exit $?"
grep -E '×|FAIL|AssertionError|Error:|Tests ' "$L/test.log" | head -40
```

Grep first, then `sed -n` a narrow range around a hit. Never `cat` a whole log, and
never rerun a command just to see its output again: it's already in the log.

## Turn off eye candy

| Tool | Quiet form |
| --- | --- |
| Everything | `NO_COLOR=1 FORCE_COLOR=0` |
| npm | `npm run --silent <script>`; `ui/.npmrc` already sets `loglevel=warn` |
| make | `make -s` hides recipe echo |
| Vitest / `ng test` | redirect to a log; grep `×`, `FAIL`, `Tests ` |
| Angular build | `--progress=false`; the budget lines are all you need |
| Playwright | `--reporter=line` (or `dot`); traces and screenshots already go to OS temp |
| ESLint / `ng lint` | lint only the touched files; `--format compact` for one line per problem |
| Prettier | `--list-different` names files without a diff; `--check` is noisier |
| git | `git --no-pager`, `status --short`, `diff --stat` before a full diff, `log --oneline -n 20` |
| pytest | `-q --tb=short -p no:cacheprovider` |
| uv / pip | `-q` |
| Our checkers | print one summary line by default; `VERBOSE=1` lists details |

Don't set `CI=1` to quiet things down. Playwright configs change workers and
retries when `CI` is set, so you'd be testing something different.

**New scripts follow the same rule:** one line on success, the failures (capped)
on failure, the full listing only with `VERBOSE=1`. No banners, emoji, ASCII art or
progress bars. A green run says `ok: 412 keys checked` and nothing else.

## Writing files without fighting the shell

Most wasted turns here are broken heredocs and line-ending surprises.

- **Use the Write or Edit tool for multi-line text**, not a heredoc. Apostrophes,
  backticks and `$` inside an unquoted heredoc break it or get expanded. If you must
  use a heredoc, quote the delimiter (`<<'EOF'`) and keep the body short.
- **For a code change in many files**, write a small Node script to a scratch file and
  run it. Don't chain `sed -i` with nested quoting.
- **Line endings are LF everywhere** (`.gitattributes`, `.editorconfig`, Prettier
  `endOfLine: lf`). Don't write CRLF, don't "fix" files to CRLF, and don't treat a
  `^M` or "LF will be replaced" warning as a bug to chase. If a match fails because of
  `\r`, strip it from your pattern (`tr -d '\r'`) and move on.
- **Backslash escapes on Windows:** the Edit and Write tools turn ` `-style
  escapes into the literal characters, which fails lint (`no-irregular-whitespace`).
  Write those strings from a Node script using `String.fromCharCode(92)`.
- **Git Bash paths:** use `/c/github/...` in bash and quote anything with spaces.
  After a failed `cd`, the shell is back at the start folder, so use absolute paths.

## Background jobs

Run anything slower than a minute in the background with its output in a log, and
wait for the completion notice. Don't poll or `tail -f` it. A monitor should report
milestones and errors, not every line.
