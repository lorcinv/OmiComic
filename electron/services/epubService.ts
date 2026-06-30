export interface EPUB基础信息 {
  path: string;
  supported: false;
  message: string;
}

export function 获取EPUB预留信息(文件路径: string): EPUB基础信息 {
  return {
    path: 文件路径,
    supported: false,
    message: "EPUB 当前仅识别显示，暂不支持阅读。",
  };
}

