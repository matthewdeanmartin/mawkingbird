"""Build the local spec library. Use `make`, `make serve`, or `make open`.

Requires Python 3.10+ and Markdown 3.7 (Makefile installs a wheel through uv).
Output is disposable; source Markdown and templates are never changed.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import os
from pathlib import Path
import re
import shutil
import socket
import threading
from string import Template
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from functools import partial
from urllib.parse import quote, unquote, urlsplit
import webbrowser

import markdown
from markdown.extensions import Extension
from markdown.treeprocessors import Treeprocessor

SPEC = Path(__file__).resolve().parent
OUT = SPEC / '_site'
WORKSPACE = SPEC.parent.parent


def clean():
    # Fixed destination, with a containment check before recursive deletion.
    if OUT.is_symlink() or OUT.resolve().parent != SPEC.resolve():
        raise RuntimeError('Refusing to remove an output directory outside spec/')
    if OUT.exists():
        shutil.rmtree(OUT)


def build():
    documents = sorted(p for p in SPEC.rglob('*.md') if OUT not in p.parents)
    clean()
    OUT.mkdir()
    shutil.copyfile(SPEC / 'style.css', OUT / 'style.css')
    template = Template((SPEC / 'template.html').read_text(encoding='utf-8'))
    # Keep the generated index even if someone later adds spec/index.md.
    destinations = {
        p.resolve(): OUT / 'pages' / p.relative_to(SPEC).with_suffix('.html')
        for p in documents
    }
    sources = {}

    def relative(target, page):
        return quote(Path(os.path.relpath(target, page.parent)).as_posix(), safe='/')

    def write_page(destination, title, content, toc='', meta=''):
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(template.substitute(
            title=html.escape(title), content=content, toc=toc,
            meta=html.escape(meta), root=relative(OUT, destination),
            page_class='library' if destination == OUT / 'index.html' else 'document',
            toc_label='<p class="eyebrow">ON THIS PAGE</p>' if toc else '',
        ), encoding='utf-8')

    def local_link(value, source, page, image=False):
        url = urlsplit(value)
        if url.scheme or url.netloc or not url.path or url.path.startswith('/'):
            return value
        target = (source.parent / unquote(url.path)).resolve()
        if target in destinations:
            result = relative(destinations[target], page)
        elif target.exists() and target.is_relative_to(WORKSPACE.resolve()):
            # Snapshot explicitly linked sources, not an HTTP server over the repo.
            # This also keeps the parity report's sibling Phanpy references usable.
            key = hashlib.sha256(str(target).encode()).hexdigest()[:16]
            if image and target.is_file():
                dest = OUT / 'assets' / (key + target.suffix)
                dest.parent.mkdir(exist_ok=True)
                shutil.copyfile(target, dest)
            else:
                dest = OUT / 'sources' / (key + '.html')
                if target not in sources:
                    sources[target] = dest
                    if target.is_dir():
                        text = '\n'.join(p.name + ('/' if p.is_dir() else '')
                                         for p in sorted(target.iterdir()))
                    else:
                        text = target.read_text(encoding='utf-8', errors='replace')
                    write_page(dest, target.name,
                               '<h1>' + html.escape(target.name) + '</h1><pre><code>'
                               + html.escape(text) + '</code></pre>',
                               meta=target.relative_to(WORKSPACE).as_posix())
            result = relative(dest, page)
        else:
            print(f'Warning: unresolved local link in {source.name}: {value}')
            return value
        return result + ('?' + url.query if url.query else '') + ('#' + url.fragment if url.fragment else '')

    class Links(Treeprocessor):
        def run(self, root):
            for node in root.iter():
                attribute = 'href' if node.tag == 'a' else 'src' if node.tag == 'img' else None
                if attribute and node.get(attribute):
                    node.set(attribute, local_link(node.get(attribute), self.source,
                                                  self.page, node.tag == 'img'))

    class LocalLinks(Extension):
        def __init__(self, source, page):
            self.source, self.page = source, page
            super().__init__()

        def extendMarkdown(self, md):
            processor = Links(md)
            processor.source, processor.page = self.source, self.page
            md.treeprocessors.register(processor, 'local-links', 5)

    cards = []
    for source in documents:
        text = source.read_text(encoding='utf-8-sig')
        match = re.search(r'^#\s+(.+)', text, re.MULTILINE)
        title = match.group(1).strip() if match else source.stem.replace('_', ' ').replace('-', ' ')
        destination = destinations[source.resolve()]
        parser = markdown.Markdown(extensions=['extra', 'toc', 'sane_lists', LocalLinks(source, destination)])
        content = parser.convert(text)
        name = source.relative_to(SPEC).as_posix()
        minutes = max(1, len(text.split()) // 220)
        write_page(destination, title, content, parser.toc, f'{name} · {minutes} min read')
        cards.append((title, name, destination, minutes))

    cards.sort(key=lambda entry: entry[0].casefold())
    content = ('<h1>Ideas, plans & specifications.</h1>'
               '<p>The working library for Mawkingbird. Browse a document to explore its scope, decisions and next steps.</p>'
               '<label for="filter">Find a specification</label>'
               '<input class="search" id="filter" type="search" placeholder="Search titles or filenames…">'
               '<div class="cards">')
    for title, name, destination, minutes in cards:
        content += (f'<a class="card" href="{relative(destination, OUT / "index.html")}">'
                    f'<strong>{html.escape(title)}</strong><small>{html.escape(name)}</small>'
                    f'<small>{minutes} min read →</small></a>')
    content += '''</div><p id="empty" hidden>No matching specifications.</p>
<script>
document.querySelector('#filter').addEventListener('input', event => {
  const query = event.target.value.toLowerCase().trim();
  const cards = [...document.querySelectorAll('.card')];
  cards.forEach(card => card.hidden = !card.textContent.toLowerCase().includes(query));
  document.querySelector('#empty').hidden = cards.some(card => !card.hidden);
});
</script>'''
    write_page(OUT / 'index.html', 'Specification library', content,
               meta=f'{len(documents)} DOCUMENTS · LOCAL EDITION')
    print(f'Built {len(documents)} specifications and index in {OUT}', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--clean', action='store_true')
    parser.add_argument('--serve', action='store_true')
    parser.add_argument('--open', action='store_true', help='Open browser while serving')
    parser.add_argument('--port', type=int, default=8876)
    args = parser.parse_args()
    if args.clean:
        clean()
        return
    build()
    if args.serve or args.open:
        handler = partial(SimpleHTTPRequestHandler, directory=str(OUT))
        class PreviewServer(ThreadingHTTPServer):
            allow_reuse_address = False

            def server_bind(self):
                if hasattr(socket, 'SO_EXCLUSIVEADDRUSE'):
                    self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
                super().server_bind()

        with PreviewServer(('127.0.0.1', args.port), handler) as server:
            url = f'http://127.0.0.1:{args.port}/'
            print(f'Preview: {url} (Ctrl+C to stop; rerun make to rebuild)', flush=True)
            if args.open:
                # Some browser launchers wait for the browser to exit.
                threading.Thread(target=webbrowser.open, args=(url,), daemon=True).start()
            try:
                server.serve_forever()
            except KeyboardInterrupt:
                pass


if __name__ == '__main__':
    main()
