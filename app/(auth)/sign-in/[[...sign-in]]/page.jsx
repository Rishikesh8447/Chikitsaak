import { Show, SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Show when="signed-out">
        <SignIn />
      </Show>
    </div>
  );
}
