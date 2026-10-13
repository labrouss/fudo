import { t, uiLocale } from "../i18n";
import type { UserStatus } from "@fudo/shared";

type Tone = "up" | "down" | "warn" | "impact" | "info" | "neutral";

export function Pill({ tone, children }: { tone: Tone; children: string }) {
  return <span className={`pill pill--${tone}`}>{children}</span>;
}

const USER_STATUS: Record<UserStatus, { tone: Tone; label: string }> = {
  active: { tone: "up", label: t("common.active") },
  invited: { tone: "info", label: t("ui.invited") },
  reset_pending: { tone: "warn", label: t("ui.2fa_reset_pending") },
  deactivated: { tone: "neutral", label: t("ui.deactivated") },
};

export const UserStatusPill = ({ status }: { status: UserStatus }) => <Pill tone={USER_STATUS[status].tone}>{USER_STATUS[status].label}</Pill>;

export function formatDateTime(iso: string | null): string {
  if (!iso) return t("common.never_2");
  return new Date(iso).toLocaleString(uiLocale(), { dateStyle: "medium", timeStyle: "short" });
}
