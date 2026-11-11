/**
 * Build stamp rendered in the footer. The checked-in null values mean "unstamped
 * dev build" and hide the footer line; CI overwrites this file with the real
 * date, commit, and workflow-run URL right before building (see the "Stamp build
 * info" step in .github/workflows/mockingbird-pages.yml, which runs
 * ui/scripts/gen-build-info.mjs). Never hand-edit or commit stamped values.
 */
export interface BuildInfo {
  /** ISO timestamp of the build, or null for an unstamped dev build. */
  builtAt: string | null;
  /** Full commit SHA the build was made from. */
  commit: string | null;
  /** Link to that commit on GitHub. */
  commitUrl: string | null;
  /** Link to the GitHub Actions run that produced and deployed the build. */
  runUrl: string | null;
}

export const BUILD_INFO: BuildInfo = {
  builtAt: null,
  commit: null,
  commitUrl: null,
  runUrl: null,
};
