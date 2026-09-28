# Design-system drift audit

Run at sprint start/end and after changes to a shared widget. An LLM audit is a
review with evidence, not an automatic approval or a substitute for deterministic
lint. Do not claim rendered correctness from source inspection alone.

1. Read `AGENTS.md`, this directory, UI contribution rules and the active sprint.
2. Inventory eligible controls in maintained `ui/`. Read templates AND styles,
   including global CSS, inline styles and bindings. Do not touch the frozen fork.
3. Compare consumers with approved widget APIs and actual stories. Find duplicate
   implementations, manual offsets, internal restyling, unsupported variants,
   undocumented colors, inaccessible labels and divergence from save behavior.
4. Inspect affected rendered stories/screens in light/dim, narrow/wide and long
   text. Record what was actually run, screenshot locations and any unchecked cases.
5. Classify each finding: reuse an existing solution; extend a reviewed variant;
   propose a missing widget; preserve a justified product-specific difference.
6. Write an audit record with path/line, evidence, severity, approved replacement,
   owner/sprint, and verification. Report counts of eligible/adopted consumers,
   unresolved violations and justified exceptions. Never substitute gross file
   counts for adoption coverage.
7. Fix within authorized sprint scope. New visual variants return to preview
   review. Convert recurring findings into narrow lint rules with positive and
   negative fixtures. Do not blindly suppress violations or update screenshots.

Suggested record:

| Location  | Evidence                   | Classification                      | Replacement/action          | Owner/sprint | Verified           |
| --------- | -------------------------- | ----------------------------------- | --------------------------- | ------------ | ------------------ |
| file:line | source + rendered scenario | duplicate / drift / gap / exception | widget + story or rationale | assignee     | command/screenshot |

At the next audit, reconcile previous findings explicitly. A renamed file or a
lower total must not conceal unresolved drift. Approval decisions belong in the
sprint review record; an LLM must not invent user approval.
