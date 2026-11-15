# Development icons

Copied from the shared Mawkingbird `ui/public/favicon.ico` and
`favicon-32x32.png`. These retain the existing brand for the development shell.
Store-quality icon sizes and packaging assets remain release work.

The configured desktop bundle icons are Mawkingbird artwork, converted from
`icon.png` with `@tauri-apps/cli@2.12.4 icon`. Tauri is the converter, not the
branding. The generated 32/128/256-pixel PNGs and macOS ICNS are kept alongside
the original Windows ICO so packaging does not rely on CI generation.
`bundle.icon` explicitly lists them; AppImage requires a listed square PNG.
Run `node scripts/check-bundle-icons.mjs` to check configured files and square
PNG dimensions before a costly build. The workflow runs this preflight too.

The Android workflow runs the same converter after Android project initialization
so its generated launcher resources use Mawkingbird artwork as well.
