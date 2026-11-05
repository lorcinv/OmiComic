// Capture capabilities before polyfills run. The current phone engine keeps
// its existing PDF renderer; older tablet engines load the compatibility one.
const capabilities = globalThis as typeof globalThis & { __omiNeedsCompatiblePdf?: boolean };
// The assignment is intentional: it keeps this preflight ahead of core-js even
// when the bundler moves otherwise pure exports into a later document chunk.
capabilities.__omiNeedsCompatiblePdf ??= typeof (Promise as unknown as {withResolvers?:unknown}).withResolvers !== 'function'
  || typeof AbortSignal.any !== 'function'
  || typeof CSS !== 'undefined' && !CSS.supports('color','color-mix(in srgb,black,white)');
export const needsCompatiblePdf = capabilities.__omiNeedsCompatiblePdf;
