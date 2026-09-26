"use client";

import React from "react";
import { PricingTable } from "@clerk/nextjs";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

const Pricing = () => {
  return (
    <Card className="border-emerald-500/20 bg-gradient-to-b from-emerald-500/8 via-card to-card shadow-lg dark:from-emerald-950/30">
      <CardContent className="p-6 md:p-8">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            Consultation Credits
          </h2>
          <p className="mt-2 text-slate-600 dark:text-slate-300">
            Subscribe to a plan for a monthly appointment credit allowance. Each consultation uses 2 credits.
          </p>
        </div>

        <PricingTable
          for="user"
          newSubscriptionRedirectUrl="/credits?subscription=complete"
          appearance={{
            variables: { colorPrimary: "#10b981" },
          }}
        />

        <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-300">
          Clerk manages subscriptions and checkout. Monthly plan credits are added to your Chikitsaak account balance and used for appointments.
        </p>
      </CardContent>
    </Card>
  );
};

export default Pricing;
