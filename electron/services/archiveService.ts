import yauzl from "yauzl";

const 图片扩展名 = new Set(["jpg", "jpeg", "png", "webp", "bmp", "gif"]);
const 自然排序器 = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });
export const 压缩包单张图片最大字节数 = 256 * 1024 * 1024;

export type 压缩包错误代码 =
  | "ARCHIVE_READ_FAILED"
  | "ARCHIVE_ENCRYPTED"
  | "ARCHIVE_ENTRY_NOT_FOUND"
  | "ARCHIVE_IMAGE_TOO_LARGE";

export class 压缩包服务错误 extends Error {
  constructor(
    public readonly code: 压缩包错误代码,
    message: string,
  ) {
    super(message);
    this.name = "压缩包服务错误";
  }
}

export interface 压缩包图片条目 {
  virtualPath: string;
  size: number;
}

function 是支持的图片(文件名: string): boolean {
  const 点号位置 = 文件名.lastIndexOf(".");
  if (点号位置 < 0) return false;
  return 图片扩展名.has(文件名.slice(点号位置 + 1).toLowerCase());
}

function 转换压缩包错误(错误: unknown): 压缩包服务错误 {
  if (错误 instanceof 压缩包服务错误) return 错误;
  return new 压缩包服务错误(
    "ARCHIVE_READ_FAILED",
    "压缩包读取失败，文件可能已损坏或格式不受支持。",
  );
}

export async function 读取压缩包图片列表(压缩包路径: string): Promise<压缩包图片条目[]> {
  try {
    const 压缩包 = await yauzl.openPromise(压缩包路径, {
      autoClose: true,
      decodeStrings: true,
      validateEntrySizes: true,
      strictFileNames: false,
    });
    const 图片列表: 压缩包图片条目[] = [];

    for await (const 条目 of 压缩包.eachEntry()) {
      if (条目.fileName.endsWith("/") || !是支持的图片(条目.fileName)) continue;
      if (条目.isEncrypted()) {
        throw new 压缩包服务错误("ARCHIVE_ENCRYPTED", "暂不支持加密压缩包。");
      }
      if (!条目.canDecodeFileData()) {
        throw new 压缩包服务错误(
          "ARCHIVE_READ_FAILED",
          "压缩包读取失败，文件可能已损坏或格式不受支持。",
        );
      }

      图片列表.push({
        virtualPath: 条目.fileName,
        size: 条目.uncompressedSize,
      });
    }

    图片列表.sort((左侧, 右侧) => 自然排序器.compare(左侧.virtualPath, 右侧.virtualPath));
    return 图片列表;
  } catch (错误) {
    throw 转换压缩包错误(错误);
  }
}

export async function 读取压缩包单张图片(
  压缩包路径: string,
  内部路径: string,
  最大字节数 = 压缩包单张图片最大字节数,
): Promise<Buffer> {
  try {
    const 压缩包 = await yauzl.openPromise(压缩包路径, {
      autoClose: true,
      decodeStrings: true,
      validateEntrySizes: true,
      strictFileNames: false,
    });

    for await (const 条目 of 压缩包.eachEntry()) {
      if (条目.fileName !== 内部路径) continue;
      if (条目.isEncrypted()) {
        throw new 压缩包服务错误("ARCHIVE_ENCRYPTED", "暂不支持加密压缩包。");
      }
      if (!条目.canDecodeFileData()) {
        throw new 压缩包服务错误(
          "ARCHIVE_READ_FAILED",
          "当前图片读取失败，请尝试重新打开。",
        );
      }
      if (条目.uncompressedSize > 最大字节数) {
        throw new 压缩包服务错误(
          "ARCHIVE_IMAGE_TOO_LARGE",
          "当前图片过大，暂时无法安全读取。",
        );
      }

      const 数据流 = await 压缩包.openReadStreamPromise(条目);
      const 数据块: Buffer[] = [];
      let 已读取字节数 = 0;

      for await (const 原始数据块 of 数据流) {
        const 数据块缓冲 = Buffer.isBuffer(原始数据块)
          ? 原始数据块
          : Buffer.from(原始数据块);
        已读取字节数 += 数据块缓冲.length;
        if (已读取字节数 > 最大字节数) {
          数据流.destroy();
          throw new 压缩包服务错误(
            "ARCHIVE_IMAGE_TOO_LARGE",
            "当前图片过大，暂时无法安全读取。",
          );
        }
        数据块.push(数据块缓冲);
      }

      return Buffer.concat(数据块, 已读取字节数);
    }

    throw new 压缩包服务错误(
      "ARCHIVE_ENTRY_NOT_FOUND",
      "当前图片读取失败，请尝试重新打开。",
    );
  } catch (错误) {
    throw 转换压缩包错误(错误);
  }
}

export function 是压缩包服务错误(错误: unknown): 错误 is 压缩包服务错误 {
  return 错误 instanceof 压缩包服务错误;
}
