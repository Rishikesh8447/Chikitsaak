"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Check, CreditCard } from "lucide-react";

const packages = [
  {
    name: "Free",
    description: "Your included starting credits",
    credits: 2,
    packageId: "free_user",
  },
  {
    name: "Standard",
    description: "For regular consultations",
    credits: 10,
    packageId: "standard",
  },
  {
    name: "Premium",
    description: "For frequent consultations",
    credits: 24,
    packageId: "premium",
  },
];

const Pricing = () => {
  return (
    <Card className="border-emerald-500/20 bg-gradient-to-b from-emerald-500/8 via-card to-card shadow-lg dark:from-emerald-950/30">
      <CardContent className="p-6 md:p-8">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            Consultation Credits
          </h2>
          <p className="mt-2 text-slate-600 dark:text-slate-300">
            Each consultation uses 2 credits. Credits are managed by Chikitsaak.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {packages.map((pkg) => (
            <Card
              key={pkg.packageId}
              className="border-emerald-500/15 bg-background/80 backdrop-blur dark:bg-background/50"
            >
              <CardHeader>
                <CardTitle className="text-slate-900 dark:text-white">
                  {pkg.name}
                </CardTitle>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {pkg.description}
                </p>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-emerald-400">
                  {pkg.credits} credits
                </p>
                <ul className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-400" />
                    {Math.floor(pkg.credits / 2)} consultation{pkg.credits === 2 ? "" : "s"}
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-400" />
                    No credit expiry in the current system
                  </li>
                </ul>
                <Button disabled className="mt-6 w-full" variant="outline">
                  <CreditCard className="mr-2 h-4 w-4" />
                  Purchases unavailable
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-300">
          Credit purchases are not connected to a payment provider yet. No payment
          or credit balance will be recorded from this page.
        </p>
      </CardContent>
    </Card>
  );
};

export default Pricing;
