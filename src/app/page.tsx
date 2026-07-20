import CreativeBeadStudio from "@/components/CreativeBeadStudio";
import { cookies } from "next/headers";
import { parseSiteView, SITE_VIEW_COOKIE_KEY } from "@/utils/siteView";

export const dynamic = "force-dynamic";

export default async function Home() {
  const cookieStore = await cookies();
  const initialView = parseSiteView(cookieStore.get(SITE_VIEW_COOKIE_KEY)?.value);
  return <CreativeBeadStudio initialView={initialView} />;
}
