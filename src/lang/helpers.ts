import ar from './locale/ar';
import cz from './locale/cz';
import da from './locale/da';
import de from './locale/de';
import en, { Lang } from './locale/en';
import es from './locale/es';
import fr from './locale/fr';
import hi from './locale/hi';
import id from './locale/id';
import it from './locale/it';
import ja from './locale/ja';
import ko from './locale/ko';
import nl from './locale/nl';
import no from './locale/no';
import pl from './locale/pl';
import pt from './locale/pt';
import ptBR from './locale/pt-br';
import ro from './locale/ro';
import ru from './locale/ru';
import sq from './locale/sq';
import tr from './locale/tr';
import uk from './locale/uk';
import zhCN from './locale/zh-cn';
import zhTW from './locale/zh-tw';

const localeMap: { [k: string]: Partial<Lang> } = {
  ar,
  cz,
  da,
  de,
  en,
  es,
  fr,
  hi,
  id,
  it,
  ja,
  ko,
  nl,
  no,
  pl,
  'pt-BR': ptBR,
  pt,
  ro,
  ru,
  sq,
  tr,
  uk,
  'zh-TW': zhTW,
  zh: zhCN,
};

const localeKeysLower = new Map(Object.keys(localeMap).map((k) => [k.toLowerCase(), k]));

/**
 * Resolve an Obsidian language code to a Kanban locale.
 * Tries an exact match, then a case-insensitive match (accepting `_` for `-`),
 * then the base language (e.g. `en-GB` -> `en`, `zh-CN` -> `zh`).
 * Falls back to English for empty or unknown codes.
 */
export function resolveLocale(code: string | null | undefined): Partial<Lang> {
  if (!code) return en;
  if (localeMap[code]) return localeMap[code];

  const normalized = code.replace(/_/g, '-').toLowerCase();
  const exactKey = localeKeysLower.get(normalized);
  if (exactKey) return localeMap[exactKey];

  const baseKey = localeKeysLower.get(normalized.split('-')[0]);
  if (baseKey) return localeMap[baseKey];

  return en;
}

const lang = window.localStorage.getItem('language');
const locale = resolveLocale(lang);

if (lang && locale === en && !lang.toLowerCase().startsWith('en')) {
  console.warn(`Kanban: no translation for "${lang}", using English`);
}

export function t(str: keyof typeof en): string {
  return locale[str] || en[str];
}
