import type { Locale } from "@/lib/i18n/copy";

const dict = {
  en: {
    noSpaceTitle: "No space yet",
    noSpaceWaiting: "You're signed in but not part of any space. Ask an admin for an invite.",
    noSpaceOwner: "Create your first space to get started.",
    signOut: "Sign out",
  },
  zh: {
    noSpaceTitle: "还没有空间",
    noSpaceWaiting: "你已登录，但还不属于任何空间。请向管理员索取邀请。",
    noSpaceOwner: "创建你的第一个空间以开始。",
    signOut: "登出",
  },
} as const;

export function getAccountCopy(locale: Locale) {
  return dict[locale];
}
