import { applicationConfig, type Preview } from "@storybook/angular";
import { provideZonelessChangeDetection } from "@angular/core";

const preview: Preview = {
  decorators: [
    applicationConfig({ providers: [provideZonelessChangeDetection()] }),
    (story, context) => {
      const root = document.documentElement;
      root.setAttribute("data-theme", context.globals["theme"]);
      root.setAttribute("data-accent", context.globals["accent"]);
      root.setAttribute("dir", context.globals["direction"]);
      return story();
    },
  ],
  globalTypes: {
    theme: {
      toolbar: {
        title: "Theme",
        icon: "circlehollow",
        items: ["light", "dark"],
      },
    },
    accent: {
      toolbar: {
        title: "Accent",
        icon: "paintbrush",
        items: ["blue", "yellow", "rose", "purple", "orange", "green"],
      },
    },
    direction: {
      toolbar: { title: "Direction", icon: "paragraph", items: ["ltr", "rtl"] },
    },
  },
  initialGlobals: { theme: "light", accent: "blue", direction: "ltr" },
  parameters: {
    layout: "padded",
    controls: { expanded: true },
    options: {
      storySort: { order: ["Start here", "Forms", "Layout", "Actions"] },
    },
  },
};
export default preview;
