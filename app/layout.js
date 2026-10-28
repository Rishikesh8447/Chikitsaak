import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";
import Header from "@/components/header"
import { checkUser } from "@/lib/checkUser";
import { Toaster } from "sonner";
import ServiceWorkerRegistration from "@/components/service-worker-registration";
import { BottomNavigation } from "@/components/bottom-navigation";
import { OfflineIndicator } from "@/components/offline-indicator";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";

export const metadata = {
  title: "Chikitsaak — Care, Connected",
  description: "Private, considered healthcare: connect with verified doctors, book diagnostics, and manage your health journey.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Chikitsaak",
    statusBarStyle: "default",
  },
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#176b63" },
    { media: "(prefers-color-scheme: dark)", color: "#101d24" },
  ],
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }) {
  const user = await checkUser();

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <ClerkProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
          >
            <OfflineIndicator />
            <Header user={user} />
            <ServiceWorkerRegistration />
            <div className="min-h-screen pb-20 lg:pb-0">
              {children}
            </div>
            <BottomNavigation />
            <PwaInstallPrompt />
            <Toaster richColors />

            <footer className="border-t border-border bg-card pb-20 lg:pb-0">
              <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <p className="font-medium text-foreground">Chikitsaak <span className="font-normal text-muted-foreground">· Care, Connected</span></p>
                <p>Private, considered care for every step of your health journey.</p>
              </div>
            </footer>
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
