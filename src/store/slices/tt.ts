/**
 * 语言键翻译快捷函数（store slice 共用）
 */
import { tFor, useLocale } from "../../i18n";

export function tt(key: string): string {
  return tFor(useLocale.getState().locale)(key);
}
