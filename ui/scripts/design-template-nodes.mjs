export function* designTemplateNodes(nodes) {
  for (const node of nodes) {
    yield node;
    for (const key of ['children', 'branches', 'groups', 'cases']) {
      yield* designTemplateNodes(node[key] ?? []);
    }
    for (const key of ['empty', 'placeholder', 'loading', 'error']) {
      if (node[key]?.children) yield* designTemplateNodes([node[key]]);
    }
  }
}
