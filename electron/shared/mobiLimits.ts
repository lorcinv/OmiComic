// File resources and decompressed text have separate budgets. A large image
// section must not enlarge the text parser's existing allocation limits.
export const MAX_MOBI_BYTES = 256 * 1024 * 1024;
export const MAX_MOBI_TEXT = 8 * 1024 * 1024;
