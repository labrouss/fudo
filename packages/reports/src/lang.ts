/**
 * The language a report is written in: texts (report.*, plus shared keys such as severity and
 * duration units), server message parts (incident titles), number and date formats, and direction.
 */
import { formatMessage, renderMessage, type MsgPart } from "@fudo/shared";
import { serverI18n, type ServerI18n } from "@fudo/notify/server";
import { REPORT_TEXTS } from "./texts.js";

export interface ReportLang {
  code: string;
  dir: "ltr" | "rtl";
  t: (key: string, params?: Record<string, unknown>) => string;
  render: (parts: MsgPart[] | null | undefined, fallback: string) => string;
  /** locale for Intl (Western digits for Arabic, day-month order for English) */
  dateLocale: string;
  numberLocale: string;
}

const EN: Record<string, string> = {
  "unit.min": "{n} min", "unit.h": "{n} h", "unit.d": "{n} d",
  "severity.critical": "Critical", "severity.major": "Major", "severity.minor": "Minor",
};

export function reportLang(locale: string | null | undefined, i18n: ServerI18n | null = serverI18n()): ReportLang {
  const code = locale && (!i18n || i18n.has(locale)) ? locale : "en";
  const look = i18n ? i18n.lookup(code) : () => undefined;
  const numberLocale = i18n ? i18n.numberLocale(code) : code;
  const get = (k: string) => look(k) ?? REPORT_TEXTS[k] ?? EN[k];
  return {
    code,
    dir: i18n?.dir(code) ?? "ltr",
    t: (k, p) => formatMessage(get(k) ?? k, p, code, numberLocale),
    render: (parts, fallback) => (parts?.length ? renderMessage(parts, (c) => look(`msg.${c}`), code, numberLocale) : fallback),
    dateLocale: code === "en" ? "en-GB" : numberLocale,
    numberLocale,
  };
}

/** English without language files (tests, and when the files cannot be found). */
export const REPORT_EN = reportLang("en", null);
