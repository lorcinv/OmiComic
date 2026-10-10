import OmiBrandIcon, { type OmiBrandOriginGetter } from "../OmiBrandIcon";

interface OmiPageBrandProps {
  onActivate: () => void;
  onRead: (origin: OmiBrandOriginGetter) => void | Promise<void>;
  readDisabled?: boolean;
  disabled?: boolean;
  titleId?: string;
}

export default function OmiPageBrand({ onActivate, onRead, readDisabled, disabled, titleId }: OmiPageBrandProps) {
  return (
    <div className="sidebar-brand omi-page-brand">
      <OmiBrandIcon onActivate={onRead} disabled={disabled || readDisabled} ariaLabel="继续上次阅读" />
      <span className="sidebar-brand-copy">
        <button type="button" className="brand-home-button" onClick={onActivate} disabled={disabled} id={titleId}>OmiComic</button>
      </span>
    </div>
  );
}
