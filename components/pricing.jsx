"use client";

import React from "react";
import { PricingTable } from "@clerk/nextjs";
import { useTheme } from "next-themes";
import { Card, CardContent } from "./ui/card";

const Pricing = () => {
  const { resolvedTheme } = useTheme();

  return (
    <Card className="w-full min-w-0 border-primary/20 bg-card py-0 shadow-xs">
      <CardContent className="min-w-0 space-y-6 p-4 sm:p-6 md:p-8">
        <div className="text-center">
          <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Consultation Credits
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            Free accounts start with 2 credits. Standard includes 10 credits per month, and Premium includes 24. Each consultation costs 2 credits.
          </p>
        </div>

        <div className="w-full min-w-0 overflow-hidden">
          <PricingTable
            for="user"
            newSubscriptionRedirectUrl="/credits?subscription=complete"
            appearance={{
              variables: { colorPrimary: resolvedTheme === "dark" ? "#55b7a8" : "#176b63" },
              elements: {
                pricingTable: "w-full min-w-0",
                pricingTableCard: {
                  height: "100%",
                  minWidth: 0,
                  borderRadius: "var(--radius-lg)",
                  background: "var(--card)",
                  color: "var(--foreground)",
                  "&:not(:has(.cl-pricingTableCardFooter)) .cl-pricingTableCardBody > div:last-child": {
                    backgroundColor: "var(--card)",
                  },
                },
                pricingTableCardFeatures: {
                  backgroundColor: "var(--card)",
                },
                pricingTableCardDescription: "max-w-[36ch] break-words text-pretty leading-6",
                pricingTableCardFooter: "mt-auto w-full",
              },
            }}
          />
        </div>

        <p className="text-center text-sm leading-6 text-muted-foreground">
          Clerk manages subscriptions and checkout. Monthly plan credits are added to your Chikitsaak account balance and used for appointments.
        </p>
      </CardContent>
    </Card>
  );
};

export default Pricing;
