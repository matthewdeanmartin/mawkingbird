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
        let depth = 0;
        return {
          Element(node) {
            if (node.name === "mb-toolbar") depth++;
            if (
              depth &&
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
                messageId: "useToolbar",
              });
            }
          },
          "Element:exit"(node) {
            if (node.name === "mb-toolbar") depth--;
          },
        };
      },
    },
  },
};
