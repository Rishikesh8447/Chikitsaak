"use client";

import { Card, CardContent } from "./ui/card";

const Pricing = () => {
  return (
    <Card className="w-full min-w-0 border-primary/20 bg-card py-0 shadow-xs">
      <CardContent className="min-w-0 space-y-6 p-4 sm:p-6 md:p-8">
        <div className="text-center">
          <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Pay per appointment
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            See the doctor’s consultation price before booking. Online appointments are paid securely at checkout; offline appointments can be paid by cash or in-app UPI QR.
          </p>
        </div>
        <p className="text-center text-sm leading-6 text-muted-foreground">
        </p>
      </CardContent>
    </Card>
  );
};

export default Pricing;
