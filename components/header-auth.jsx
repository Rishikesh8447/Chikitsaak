"use client";

import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export default function HeaderAuth() {
  return (
    <>
      <Show when="signed-out">
        <div className="flex flex-nowrap items-center justify-end gap-1 sm:gap-2">
          <SignInButton mode="modal">
            <Button variant="outline" className="h-8 px-2 text-xs sm:h-10 sm:px-3 sm:text-sm">Sign In</Button>
          </SignInButton>

          <SignUpButton mode="modal">
            <Button className="h-8 px-2 text-xs sm:h-10 sm:px-3 sm:text-sm">Sign Up</Button>
          </SignUpButton>
        </div>
      </Show>

      <Show when="signed-in">
        <UserButton afterSignOutUrl="/" />
      </Show>
    </>
  );
}
