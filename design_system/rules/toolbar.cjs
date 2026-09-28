// Angular template AST: applies to external templates and processed inline templates.
module.exports = {
  rules: {
    "prefer-shared-local-tabs": {
      meta: {type:"problem", schema:[], messages:{shared:"Use mb-tabs and mbTab for the adopted local panels; retain native links for route navigation."}},
      create(context) { return { Element(node) {
        const attrs = [...node.attributes, ...node.inputs];
        const local = attrs.some(a => (a.name === "role" && a.value === "tablist") ||
          (a.name === "class" && typeof a.value === "string" &&
            ((node.name === "button" && a.value.split(/\s+/).includes("tab")) ||
             (node.name === "div" && a.value.split(/\s+/).includes("tabs")))));
        if (local) context.report({loc:context.sourceCode.parserServices.convertNodeSourceSpanToLoc(node.sourceSpan),messageId:"shared"});
      }}; }
    },
    "require-shared-post-action": {
      meta: { type: "problem", schema: [], messages: {
        shared: "Use mbPostAction for adopted post-row button/link actions; do not reintroduce local action geometry."
      } },
      create(context) {
        let depth = 0;
        return {
          Element(node) {
            if (node.name === "mb-post-actions") depth++;
            const attributes = [...node.attributes, ...node.inputs];
            const action = attributes.some(attr => attr.name === "class" && typeof attr.value === "string" && attr.value.split(/\s+/).includes("action"));
            if (depth && ["button", "a"].includes(node.name) && action && !attributes.some(attr => attr.name === "mbPostAction")) {
              context.report({ loc: context.sourceCode.parserServices.convertNodeSourceSpanToLoc(node.sourceSpan), messageId: "shared" });
            }
          },
          "Element:exit"(node) { if (node.name === "mb-post-actions") depth--; }
        };
      }
    },
    "no-pill-in-toolbar": {
      meta: {
        type: "problem",
        schema: [],
        messages: {
          useToolbar:
            "Use mbToolbarButton inside mb-toolbar; keep mbButton for standalone actions. See design_system/components.md#toolbar.",
        },
      },
      create(context) {
        const groups = [];
        return {
          Element(node) {
            if (["mb-toolbar", "mb-post-actions"].includes(node.name)) groups.push(node.name);
            if (
              groups.length &&
              [...node.attributes, ...node.inputs].some(
                (attr) =>
                  attr.name === "mbButton" ||
                  (attr.name === "class" &&
                    typeof attr.value === "string" &&
                    attr.value.split(/\s+/).includes("btn")),
              )
            ) {
              context.report({
                loc: context.sourceCode.parserServices.convertNodeSourceSpanToLoc(
                  node.sourceSpan,
                ),
                message: groups.at(-1) === "mb-post-actions"
                  ? "Use mbPostAction inside mb-post-actions; keep full counts in mbActionCount. See design_system/components.md#post-actions."
                  : "Use mbToolbarButton inside mb-toolbar; keep mbButton for standalone actions. See design_system/components.md#toolbar.",
              });
            }
          },
          "Element:exit"(node) {
            if (["mb-toolbar", "mb-post-actions"].includes(node.name)) groups.pop();
          },
        };
      },
    },
  },
};
