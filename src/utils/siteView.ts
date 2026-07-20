export type SiteView = "home" | "start" | "projects" | "ai" | "community" | "faq" | "profile";

export const SITE_VIEW_COOKIE_KEY = "douge_current_site_view";

const siteViews: SiteView[] = ["home", "start", "projects", "ai", "community", "faq", "profile"];

export function parseSiteView(value: string | null | undefined): SiteView {
  return value && siteViews.includes(value as SiteView) ? value as SiteView : "home";
}
