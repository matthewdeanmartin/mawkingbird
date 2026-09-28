# Sprint 4 — dialogs and transient interaction

Preview dialog surfaces, action menus, disclosure/popover panels and inline
notices. Establish focus entry/return, Escape, backdrop behavior, keyboard
navigation, scroll containment and accessible naming. Inspect existing focus
utilities before choosing whether Angular CDK is warranted.

After approval, integrate existing dialogs and popovers in small batches. Keep
destructive confirmation flows and existing click-versus-hover behavior intact.
Check touch, small viewports, reduced motion, nested focus and async errors.

Require interaction tests for adopted patterns; remove per-screen implementations
only after behavior parity. Done: migrated overlays have one documented behavior
contract, no lost focus, approved screenshots and a fresh drift audit.

## Preview checkpoint

Five widgets and the [Sprint 4 review](../REVIEW-4.md) are implemented. The
[opening audit](../audits/04-overlays.md) records existing focus behavior and
integration boundaries. Native dialog/popover primitives and existing dependencies
are sufficient for this preview; no CDK dependency was added. Application overlay
migrations, duplicate CSS removal and the post-integration audit await review.
