import { requireStaff } from "@/lib/server/auth.ts";
import { adminLogout } from "../../actions.ts";
import { ProfileForm } from "./ProfileForm.tsx";

export default async function ProfilePage() {
  const me = await requireStaff();
  return (
    <section className="view">
      <header className="view-head">
        <h1 className="view-title">Profil</h1>
      </header>
      <ProfileForm name={me.name} email={me.email} />
      <form action={adminLogout}>
        <button className="btn ghost">Abmelden</button>
      </form>
    </section>
  );
}
