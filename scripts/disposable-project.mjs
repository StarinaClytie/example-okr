/** Restrict destructive local acceptance tools to explicitly named test stacks. */
export function disposableProjectId(config) {
  const matches = [...config.matchAll(/^project_id[ \t]*=[ \t]*"([^"\r\n]+)"[ \t]*(?:#.*)?$/gm)];
  const id = matches.length === 1 ? matches[0][1] : '';
  if (id.length > 63 || !/^okr-repro-check(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?$/.test(id)) {
    throw new Error('Requires an explicit disposable project_id: okr-repro-check or okr-repro-check-<unique-suffix>');
  }
  return id;
}
