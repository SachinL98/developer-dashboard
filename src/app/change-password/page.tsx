import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set your password" };

/** Shown (and required) after an admin created the account or reset the password. Outside the app layout so it cannot redirect to itself. */
export default async function ChangePassword() {
  const me = await requireUser();
  if (!me.mustChangePassword) redirect("/settings");
  return (
    <main className="grid min-h-screen place-items-center p-4">
      <div className="card-pad w-full max-w-md space-y-4">
        <div><h1 className="text-xl font-semibold">Choose your password</h1><p className="mt-1 text-sm text-mute">Hi {me.name.split(" ")[0]}. Replace the temporary password you were given with one only you know.</p></div>
        <ChangePasswordForm forced />
      </div>
    </main>
  );
}
