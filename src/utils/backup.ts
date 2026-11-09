/**
 * ブラウザ内に保存している設定(履歴・プリセット・自分のパーツ・各種設定)を
 * 1つのJSONファイルに書き出す/読み込むための処理。
 * 対象は localStorage のうち、このアプリが使う「megamoji_」で始まるキーだけ。
 */
const KEY_PREFIX = "megamoji_";
const BACKUP_APP = "megamoji-kaizo-saka";
const BACKUP_VERSION = 1;

export type BackupFile = {
  app: string;
  version: number;
  exportedAt: string;
  data: Record<string, string>;
};

export type BackupSummary = { gallery: number, presets: number, customParts: number, keys: number };

const safeParse = (raw: string | undefined): unknown => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
};

const lengthOf = (v: unknown): number => (Array.isArray(v) ? v.length : 0);

export const summarize = (data: Record<string, string>): BackupSummary => ({
  gallery: lengthOf(safeParse(data.megamoji_gallery_v1)),
  presets: lengthOf(safeParse(data.megamoji_presets_v1)),
  customParts: lengthOf(safeParse(data.megamoji_custom_parts_v1)),
  keys: Object.keys(data).length,
});

export const collectBackup = (): BackupFile => {
  const data: Record<string, string> = {};
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (key && key.startsWith(KEY_PREFIX)) {
      const value = window.localStorage.getItem(key);
      if (value !== null) data[key] = value;
    }
  }
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
};

/** バックアップファイルの中身を検証して返す。形式が違えば null */
export const parseBackup = (text: string): BackupFile | null => {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch (_) {
    return null;
  }
  const b = obj as Partial<BackupFile> | null;
  if (!b || b.app !== BACKUP_APP || typeof b.version !== "number" || !b.data || typeof b.data !== "object") {
    return null;
  }
  const data: Record<string, string> = {};
  Object.entries(b.data).forEach(([k, v]) => {
    // 想定外のキー(このアプリのもの以外)や文字列以外は読み込まない
    if (k.startsWith(KEY_PREFIX) && typeof v === "string") data[k] = v;
  });
  return {
    app: BACKUP_APP,
    version: b.version,
    exportedAt: typeof b.exportedAt === "string" ? b.exportedAt : "",
    data,
  };
};

/** バックアップの内容でブラウザ内の設定を置き換える(ファイルに含まれるキーだけ) */
export const applyBackup = (backup: BackupFile): void => {
  Object.entries(backup.data).forEach(([k, v]) => {
    window.localStorage.setItem(k, v);
  });
};
