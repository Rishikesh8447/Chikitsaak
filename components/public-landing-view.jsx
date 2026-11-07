"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, FlaskConical, Pill, ShieldCheck, Stethoscope, Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VesselHeroSearch } from "@/components/vessel-hero-search";
import { useLanguage } from "./language-provider";

export function PublicLandingView() {
  const { t } = useLanguage();

  return (
    <>
      {/* Serene Editorial Hero Section */}
      <section className="relative overflow-hidden bg-card py-12 sm:py-16 lg:py-24">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-[1.1fr_.9fr] lg:gap-14">
          <div className="max-w-2xl">
            <Badge variant="outline" className="mb-5 gap-1.5 border-primary/20 bg-primary/5 px-3 py-1.5 text-xs text-primary">
              <ShieldCheck className="size-3.5" />
              <span>{t("landing.heroBadge", "Accredited Healthcare & Telemedicine")}</span>
            </Badge>

            <h1 className="text-4xl font-semibold leading-[1.12] tracking-tight text-foreground sm:text-5xl lg:text-[3.5rem]">
              {t("landing.heroTitlePrefix", "Healthcare that feels")}{" "}
              <span className="text-primary">{t("landing.heroTitleHighlight", "closer, calmer, and considered.")}</span>
            </h1>

            <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
              {t("landing.heroSubtitle", "Connect with verified doctors, book accredited laboratory tests, and keep your entire medical journey in one private, beautifully organized place.")}
            </p>

            {/* Quick Care Search Bar */}
            <div className="mt-7">
              <VesselHeroSearch placeholder={t("landing.heroSearchPlaceholder", "Search doctors, specialties, or laboratory tests...")} />
            </div>

            {/* Quick Specialty Pill Navigation */}
            <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{t("landing.featuredCare", "Featured care:")}</span>
              {["Cardiology", "Dermatology", "Pediatrics", "Gynecology", "Orthopedics"].map((spec) => (
                <Link
                  key={spec}
                  href={`/doctors/${encodeURIComponent(spec)}`}
                  className="rounded-full border border-border bg-background px-3 py-1 transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  {t(`hub.specialties.${spec}`, spec)}
                </Link>
              ))}
            </div>

            {/* Trust Markers */}
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Check className="size-3.5 text-primary" />
                {t("landing.trustClinicians", "Verified Clinicians")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check className="size-3.5 text-primary" />
                {t("landing.trustLabs", "NABL-Accredited Labs")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check className="size-3.5 text-primary" />
                {t("landing.trustRecords", "Encrypted Health Records")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check className="size-3.5 text-primary" />
                {t("landing.trustFollowUp", "₹0 Follow-up Consultations")}
              </span>
            </div>
          </div>

          {/* Hero Banner Visual */}
          <div className="relative min-h-[20rem] overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-secondary/50 to-muted/80 sm:min-h-[26rem]">
            <Image
              src="/banner2.png"
              alt={t("landing.bannerAlt", "Physician consulting with a patient in a serene, modern healthcare clinic")}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover object-top"
            />
            <div className="absolute inset-x-0 bottom-0 bg-slate-950/75 p-6 text-white sm:p-8">
              <div className="flex items-center gap-2 text-xs font-semibold text-teal-300">
                <Sparkles className="size-3.5" />
                <span>{t("landing.bannerStandard", "The Chikitsaak Standard")}</span>
              </div>
              <p className="mt-1 text-base font-semibold sm:text-lg">
                {t("landing.bannerMilestone", "Considered care for every milestone")}
              </p>
              <p className="mt-1 text-xs text-white/80">
                {t("landing.bannerDesc", "Transparent fees, unhurried 20-minute consultation slots, and unified pathology reports.")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3 Core Clinical Pillars */}
      <section className="mx-auto w-full max-w-7xl px-4 pt-10 pb-6 sm:pt-14 sm:pb-8 lg:pt-16 lg:pb-10">
        <div className="mb-10 max-w-2xl">
          <Badge variant="outline" className="text-xs text-primary mb-2">
            {t("landing.pillarsBadge", "A cohesive care experience")}
          </Badge>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
            {t("landing.pillarsTitle", "Integrated health services, without the friction.")}
          </h2>
          <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground sm:text-base">
            {t("landing.pillarsDesc", "Every step of outpatient medicine is connected: from diagnosis and lab investigations to prescription delivery and doctor follow-up.")}
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Pillar 1 */}
          <Card className="card-vessel flex flex-col justify-between p-6">
            <div>
              <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Stethoscope className="size-6" />
              </div>
              <CardTitle className="mt-5 text-lg font-semibold text-foreground">
                {t("landing.pillar1Title", "Specialist Consultations")}
              </CardTitle>
              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                {t("landing.pillar1Desc", "Connect with board-certified physicians for dedicated 20-minute video visits or scheduled in-clinic examinations with clear fees and zero hidden charges.")}
              </p>
            </div>
            <div className="mt-6 pt-4">
              <Link href="/doctors" className="inline-flex items-center text-xs font-semibold text-primary hover:underline">
                {t("landing.pillar1Action", "Explore specialists")} <ArrowRight className="ml-1 size-3.5" />
              </Link>
            </div>
          </Card>

          {/* Pillar 2 */}
          <Card className="card-vessel flex flex-col justify-between p-6">
            <div>
              <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <FlaskConical className="size-6" />
              </div>
              <CardTitle className="mt-5 text-lg font-semibold text-foreground">
                {t("landing.pillar2Title", "Laboratory Diagnostics")}
              </CardTitle>
              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                {t("landing.pillar2Desc", "Book verified diagnostic blood tests, health panels, and pathology screening directly. Review results online as soon as certified by the laboratory.")}
              </p>
            </div>
            <div className="mt-6 pt-4">
              <Link href="/laboratory" className="inline-flex items-center text-xs font-semibold text-primary hover:underline">
                {t("landing.pillar2Action", "Explore lab tests")} <ArrowRight className="ml-1 size-3.5" />
              </Link>
            </div>
          </Card>

          {/* Pillar 3 */}
          <Card className="card-vessel flex flex-col justify-between p-6">
            <div>
              <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Pill className="size-6" />
              </div>
              <CardTitle className="mt-5 text-lg font-semibold text-foreground">
                {t("landing.pillar3Title", "Prescriptions & Pharmacy")}
              </CardTitle>
              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                {t("landing.pillar3Desc", "Access your digital prescription with clear dosage instructions, check medication availability across verified pharmacies, and plan refills easily.")}
              </p>
            </div>
            <div className="mt-6 pt-4">
              <Link href="/pharmacy" className="inline-flex items-center text-xs font-semibold text-primary hover:underline">
                {t("landing.pillar3Action", "Explore pharmacy")} <ArrowRight className="ml-1 size-3.5" />
              </Link>
            </div>
          </Card>
        </div>
      </section>

      {/* Reassuring Vessel Editorial Banner */}
      <section className="mx-auto w-full max-w-7xl px-4 pt-2 pb-12 sm:px-6 sm:pt-4 sm:pb-16">
        <div className="relative overflow-hidden rounded-2xl bg-[#173d3b] dark:bg-card dark:border dark:border-border px-6 py-8 text-center text-white sm:px-12 sm:py-10 lg:py-12">
          <Badge variant="outline" className="mb-3 border-teal-300/30 bg-teal-400/10 text-teal-200 dark:border-primary/30 dark:bg-secondary dark:text-primary text-xs">
            {t("landing.ctaBadge", "Private & Confidential")}
          </Badge>
          <h2 className="mx-auto max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl text-white dark:text-foreground">
            {t("landing.ctaTitle", "Start with considered care today.")}
          </h2>
          <p className="mx-auto mt-2.5 max-w-lg text-sm leading-relaxed text-teal-50/85 dark:text-muted-foreground sm:text-base">
            {t("landing.ctaDesc", "Create your account to connect with verified clinicians, track pathology tests, and manage your family's healthcare journey.")}
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/sign-up"
              className={buttonVariants({
                size: "lg",
                className: "h-11 px-6 rounded-xl font-semibold gap-2 bg-white text-emerald-950 hover:bg-white/90 dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90 shadow-xs",
              })}
            >
              <span>{t("landing.ctaGetStarted", "Get started")}</span>
              <ArrowRight className="size-4 shrink-0 text-emerald-950 dark:text-primary-foreground" />
            </Link>
            <Link
              href="/doctors"
              className={buttonVariants({
                variant: "outline",
                size: "lg",
                className: "h-11 px-6 rounded-xl font-medium border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white dark:border-border dark:text-foreground dark:bg-transparent dark:hover:bg-secondary",
              })}
            >
              {t("landing.ctaBrowseClinicians", "Browse clinicians")}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

