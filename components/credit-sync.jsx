"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import {  checkAndAllocateCredits } from "@/actions/credits";

export default function CreditSync() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const hasSynced = useRef(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || hasSynced.current) {
      return;
    }

    hasSynced.current = true;

    checkAndAllocateCredits()
      .then(() => {
        router.refresh();
      })
      .catch((error) => {
        console.error("Failed to sync credits:", error);
      });
  }, [isLoaded, isSignedIn, router]);

  return null;
}
