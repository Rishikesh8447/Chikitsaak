import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, ShieldCheck, Stethoscope } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Pricing from "@/components/pricing";
import { creditBenefits, features } from "@/lib/data";

export default function Home() {
  return (
    <main>
      <section className="relative overflow-hidden border-b border-border bg-[radial-gradient(ellipse_at_78%_24%,color-mix(in_srgb,var(--primary)_10%,transparent),transparent_42%),linear-gradient(180deg,var(--card),var(--background))]">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.02fr_.98fr] lg:gap-14 lg:py-20">
          <div className="max-w-2xl">
            <Badge variant="outline" className="mb-5 gap-2 border-primary/20 bg-primary/5 px-3 py-1.5 text-primary"><ShieldCheck className="size-3.5" />Care you can feel confident in</Badge>
            <h1 className="max-w-xl text-4xl font-semibold leading-[1.12] tracking-tight text-foreground sm:text-5xl lg:text-[3.6rem]">Healthcare that feels <span className="text-primary">closer.</span></h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground sm:text-lg">Connect with verified doctors, book a time that works for you, and keep your care journey in one thoughtful place.</p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/doctors" className={buttonVariants({ size: "lg" })}>Find a doctor<ArrowRight className="size-4" /></Link>
              <Link href="/appointments" className={buttonVariants({ variant: "outline", size: "lg" })}>View appointments</Link>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-muted-foreground"><span className="inline-flex items-center gap-1.5"><Check className="size-3.5 text-primary" />Verified clinicians</span><span className="inline-flex items-center gap-1.5"><Check className="size-3.5 text-primary" />Secure video visits</span><span className="inline-flex items-center gap-1.5"><Check className="size-3.5 text-primary" />Your care, organized</span></div>
          </div>
          <div className="relative min-h-[18rem] overflow-hidden rounded-2xl border border-border bg-muted sm:min-h-[25rem]">
            <Image src="/banner2.png" alt="Doctor speaking with a patient during a consultation" fill priority sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/75 via-slate-950/25 to-transparent p-5 pt-16 text-white sm:p-7 sm:pt-20"><p className="text-sm font-semibold">Thoughtful care, on your terms</p><p className="mt-1 text-xs text-white/80">From finding a specialist to following up after your visit.</p></div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-18 lg:py-20">
        <div className="mb-8 max-w-2xl"><p className="eyebrow">A simpler care journey</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Care coordinated around you</h2><p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">The essentials are together, so you can focus on feeling better.</p></div>
        <div className="grid gap-4 md:grid-cols-3">{features.map((feature) => <Card key={feature.title} className="transition-colors hover:border-primary/35"><CardHeader className="gap-3"><div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">{feature.icon}</div><CardTitle className="text-base font-semibold">{feature.title}</CardTitle></CardHeader><CardContent><p className="text-sm leading-6 text-muted-foreground">{feature.description}</p></CardContent></Card>)}</div>
      </section>

      <section id="pricing" className="scroll-mt-24 border-y border-border bg-card py-14 sm:py-18 lg:py-20">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
          <div className="mx-auto mb-9 max-w-2xl text-center"><p className="eyebrow">Membership</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Plans for care that fits</h2><p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">Choose a plan, then manage consultations with your Chikitsaak credit balance.</p></div>
          <Pricing />
          <Card className="mx-auto mt-8 max-w-4xl bg-background"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Stethoscope className="size-4 text-primary" />How credits work</CardTitle></CardHeader><CardContent><ul className="grid gap-3 sm:grid-cols-2">{creditBenefits.map((benefit, index) => <li key={index} className="flex items-start gap-2.5 text-sm leading-6 text-muted-foreground"><span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Check className="size-3" /></span><span dangerouslySetInnerHTML={{ __html: benefit }} /></li>)}</ul></CardContent></Card>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-18 lg:py-20"><div className="overflow-hidden rounded-2xl bg-[#173d3b] px-6 py-10 text-center text-white sm:px-12 sm:py-14"><p className="text-xs font-semibold uppercase tracking-[.15em] text-teal-200">Start with one good step</p><h2 className="mx-auto mt-3 max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">Find care that fits your life.</h2><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-teal-50/80 sm:text-base">Explore verified doctors and choose a consultation time that works for you.</p><div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row"><Link href="/sign-up" className={buttonVariants({ size: "lg", className: "bg-white text-[#173d3b] hover:bg-teal-50" })}>Get started<ArrowRight className="size-4" /></Link><Link href="/doctors" className={buttonVariants({ variant: "ghost", size: "lg", className: "text-white hover:bg-white/10 hover:text-white" })}>Browse doctors</Link></div></div></section>
    </main>
  );
}
