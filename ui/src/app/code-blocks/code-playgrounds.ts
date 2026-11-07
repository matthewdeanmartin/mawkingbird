import { CodeBlock } from './code-fences';

/**
 * "Open in …" for a code block: a new tab on a public playground, carrying the
 * code. Nothing runs inside Mawkingbird.
 *
 * Python Tutor and the TypeScript Playground take the code in the URL
 * fragment, which never reaches their server until the page reads it. Rust
 * Playground and Compiler Explorer take it in the path or query: opening the
 * link sends the code to that site, which is what opening a playground means.
 */
export interface Playground {
  name: string;
  url: (code: string) => Promise<string>;
}

function base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function typescriptUrl(code: string, filetype: 'ts' | 'js'): Promise<string> {
  const { compressToEncodedURIComponent } = await import('lz-string');
  const query = filetype === 'js' ? '?filetype=js' : '';
  return `https://www.typescriptlang.org/play${query}#code/${compressToEncodedURIComponent(code)}`;
}

function compilerExplorer(language: string): Playground {
  return {
    name: 'Compiler Explorer',
    url: async (code) =>
      `https://godbolt.org/clientstate/${encodeURIComponent(
        base64(JSON.stringify({ sessions: [{ id: 1, language, source: code, compilers: [] }] })),
      )}`,
  };
}

const PLAYGROUNDS: Record<string, Playground> = {
  python: {
    name: 'Python Tutor',
    url: async (code) =>
      `https://pythontutor.com/visualize.html#code=${encodeURIComponent(code)}&py=3`,
  },
  javascript: { name: 'TypeScript Playground', url: (code) => typescriptUrl(code, 'js') },
  typescript: { name: 'TypeScript Playground', url: (code) => typescriptUrl(code, 'ts') },
  rust: {
    name: 'Rust Playground',
    url: async (code) =>
      `https://play.rust-lang.org/?version=stable&mode=debug&edition=2021&code=${encodeURIComponent(code)}`,
  },
  c: compilerExplorer('c'),
  cpp: compilerExplorer('c++'),
  go: compilerExplorer('go'),
};

/** The playground for a block's language, or null when there is none. */
export function playgroundFor(block: CodeBlock): Playground | null {
  return PLAYGROUNDS[block.language] ?? null;
}
