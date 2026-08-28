interface ArrowIconProps {
  direction: "left" | "right" | "up" | "down";
}

function ArrowIcon({ direction }: ArrowIconProps) {
  return (
    <svg
      className={`ui-arrow-icon is-${direction}`}
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8.5 6 4.5 10l4 4M4.5 10h9" />
    </svg>
  );
}

export default ArrowIcon;
