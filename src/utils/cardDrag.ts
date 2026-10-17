export type CardDrop = { key: string; position: 'before' | 'after' } | null;

// The whole highlighted card is the destination. Resolve from live coordinates
// both while moving and on release so a stale hover can never reorder items.
export function cardDropAtPoint(point: Pick<MouseEvent, 'clientX' | 'clientY'>, scope: string, sourceKey: string): CardDrop {
  const target = document.elementFromPoint(point.clientX, point.clientY)?.closest<HTMLElement>('[data-card-drag-key]');
  if (!target || target.dataset.cardDragScope !== scope || target.dataset.cardDragKey === sourceKey) return null;
  const source = Array.from(document.querySelectorAll<HTMLElement>('[data-card-drag-key]'))
    .find(card => card.dataset.cardDragScope === scope && card.dataset.cardDragKey === sourceKey);
  if (!source || source.parentElement !== target.parentElement) return null;
  return {
    key: target.dataset.cardDragKey!,
    position: source.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING ? 'after' : 'before',
  };
}
