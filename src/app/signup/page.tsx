import { redirect } from "next/navigation";
import Link from "next/link";
import { currentUser } from "@/lib/auth/session";
import { signupEnabled } from "@/lib/auth/signup";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SignupForm } from "./SignupForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Request access" };

export default async function Signup() {
  if (await currentUser()) redirect("/");
  return (
    <main className="grid min-h-screen place-items-center p-4">
      <div className="fixed right-4 top-4"><ThemeToggle signedIn={false} compact /></div>
      <div className="card-pad w-full max-w-md space-y-5">
        <div className="flex items-center gap-3">
          <img src="/icon-192.png" alt="" width={44} height={44} className="h-11 w-11 rounded-xl" />
          <div><h1 className="text-xl font-semibold leading-tight">Create your account</h1><p className="text-sm text-mute">Dev Dashboard</p></div>
        </div>
        {signupEnabled() ? <SignupForm /> : (
          <div className="space-y-4 text-center"><p className="text-sm text-mute">Sign-up is closed. Ask an admin to add you.</p><Link href="/login" className="btn w-full">Back to sign in</Link></div>
        )}
      </div>
    </main>
  );
}
