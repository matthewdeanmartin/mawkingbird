// Angular template AST: applies to external templates and processed inline templates.
module.exports = {
  rules: {
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
