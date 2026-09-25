"use client";

import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export default function HeaderAuth() {
  return (
    <>
      <Show when="signed-out">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <SignInButton mode="modal">
            <Button variant="outline">Sign In</Button>
          </SignInButton>

          <SignUpButton mode="modal">
            <Button>Sign Up</Button>
          </SignUpButton>
        </div>
      </Show>

      <Show when="signed-in">
        <UserButton afterSignOutUrl="/" />
      </Show>
    </>
  );
}
