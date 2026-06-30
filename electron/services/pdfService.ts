export type PDF错误代码 =
  | "PDF_READING_DISABLED"
  | "PDF_THUMBNAIL_DISABLED";

export class PDF服务错误 extends Error {
  constructor(
    public readonly code: PDF错误代码,
    message: string,
  ) {
    super(message);
    this.name = "PDF服务错误";
  }
}

export async function 获取PDF页数(): Promise<number> {
  throw new PDF服务错误(
    "PDF_READING_DISABLED",
    "PDF 阅读支持已暂时关闭，将在后续版本重新评估。",
  );
}

export async function 获取PDF页面列表(): Promise<never[]> {
  throw new PDF服务错误(
    "PDF_READING_DISABLED",
    "PDF 阅读支持已暂时关闭，将在后续版本重新评估。",
  );
}

export async function 渲染PDF页面(): Promise<string> {
  throw new PDF服务错误(
    "PDF_READING_DISABLED",
    "PDF 阅读支持已暂时关闭，将在后续版本重新评估。",
  );
}

export async function 渲染PDF首页缩略图(): Promise<string | null> {
  return null;
}

export async function 释放PDF资源(): Promise<void> {
  return undefined;
}

export function 是PDF服务错误(错误: unknown): 错误 is PDF服务错误 {
  return 错误 instanceof PDF服务错误;
}
