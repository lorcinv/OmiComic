import type { 资源类型 } from "../types";

/** Quiet, text-free cover symbols, sharing the Omi outline treatment. */
export default function ResourcePlaceholder({ type }: { type: 资源类型 }) {
  const paths: Record<资源类型, string> = {
    folder: "M8 19a4 4 0 0 1 4-4h14l6 7h20a4 4 0 0 1 4 4v23a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4Zm0 10h48",
    image: "M12 11h40v42H12Zm5 35 11-14 8 9 6-7 10 12M25 23a4 4 0 1 0-8 0 4 4 0 1 0 8 0",
    archive: "M14 8h26l10 10v38H14Zm26 0v12h10M30 9v5m5 0v5m-5 0v5m5 0v5m-5 0v5m5 0v5M29 43h8v8h-8Z",
    pdf: "M14 8h26l10 10v38H14Zm26 0v12h10M23 44c9-7 16-22 10-21-6 1 0 19 11 19 6 0-3-8-13-2-11 6-12 9-8 4Z",
    epub: "M9 14c10-3 16-1 23 4 7-5 13-7 23-4v37c-10-3-16-1-23 4-7-5-13-7-23-4Zm23 4v37M16 25l9 2m-9 8 9 2m14-10 9-2m-9 12 9-2",
    unknown: "M14 8h26l10 10v38H14Zm26 0v12h10M23 32h18M23 40h18M23 48h10",
  };
  return <svg className={`resource-placeholder-icon is-${type}`} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[type]} /></svg>;
}
