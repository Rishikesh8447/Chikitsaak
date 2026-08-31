import { Show, SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Show when="signed-out">
        <SignUp />
      </Show>
    </div>
  );
}
