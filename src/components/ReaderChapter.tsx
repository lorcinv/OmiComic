import { memo, type CSSProperties } from "react";

interface Props {
  html: string;
  title: string;
  width: number;
  height: number;
  style: CSSProperties;
}

function ReaderChapter({ html, title, width, height, style }: Props) {
  const shownWidth = typeof style.width === "string" && style.width.endsWith("px")
    ? Number.parseFloat(style.width) : width;
  const scale = shownWidth / width;
  return <div className="reader-chapter" style={{ width: shownWidth, height: height * scale }}>
    <iframe title={title} srcDoc={html} sandbox="allow-same-origin" referrerPolicy="no-referrer" tabIndex={-1}
      onLoad={event => {
        if (document.documentElement.dataset.colorTheme !== "night") return;
        const chapter = event.currentTarget.contentDocument;
        if (!chapter) return;
        const palette = getComputedStyle(document.documentElement);
        chapter.documentElement.style.colorScheme = "dark";
        chapter.body.style.backgroundColor = palette.getPropertyValue("--面板色");
        chapter.body.style.color = palette.getPropertyValue("--主文字");
      }}
      style={{ width, height, transform: `scale(${scale})` }} />
  </div>;
}

export default memo(ReaderChapter, (a, b) => a.html === b.html && a.title === b.title
  && a.width === b.width && a.height === b.height && a.style.width === b.style.width && a.style.height === b.style.height);
