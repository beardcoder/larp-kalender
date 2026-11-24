import { getApp } from "@/lib/server/app.ts";
import { requireAdmin } from "@/lib/server/auth.ts";
import { listUsers } from "@/lib/server/users.ts";
import { AddUserForm, UserRow } from "./parts.tsx";

export default async function UsersPage() {
  const me = await requireAdmin();
  const users = listUsers(getApp().db);
  return (
    <section className="view">
      <header className="view-head">
        <h1 className="view-title">Benutzer</h1>
        <p className="view-lead">Redaktion darf Veranstaltungen pflegen und KI-Clients verbinden. Administratoren verwalten zusätzlich Benutzer. Mitglieder nutzen nur die öffentliche App.</p>
      </header>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Rolle</th>
              <th>Letzte Anmeldung</th>
              <th>
                <span className="sr-only">Aktionen</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <UserRow key={u.id} user={u} isMe={u.id === me.id} />
            ))}
          </tbody>
        </table>
      </div>
      <AddUserForm />
    </section>
  );
}
