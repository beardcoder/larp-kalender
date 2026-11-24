import { AppData } from "@/components/AppData.tsx";
import { Shell } from "@/components/Shell.tsx";
import { feedToken, getFavorites } from "@/lib/server/account.ts";
import { getApp } from "@/lib/server/app.ts";
import { currentUser, isStaff } from "@/lib/server/auth.ts";
import { listPublicEvents, today } from "@/lib/server/events.ts";

export const dynamic = "force-dynamic";

/** Public app: loads the (small) set of upcoming events once; pages filter and render them on the client. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { db, push } = getApp();
  const user = await currentUser();
  const account = user
    ? { name: user.name, email: user.email, favorites: getFavorites(db, user.id), feedToken: feedToken(db, user.id), staff: isStaff(user) }
    : null;
  return (
    <AppData events={listPublicEvents(db, {})} activity={push.activity()} today={today()} account={account}>
      <Shell>{children}</Shell>
    </AppData>
  );
}
