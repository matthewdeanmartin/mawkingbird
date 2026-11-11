/** Keep in step with the search layouts' 800px single-column breakpoint. */
export function searchPanelOpenByDefault(): boolean {
  return typeof window === 'undefined' || window.innerWidth > 800;
}
