import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";
import Header from "@/components/header"
import { checkUser } from "@/lib/checkUser";
import { Toaster } from "sonner";
import ServiceWorkerRegistration from "@/components/service-worker-registration";

export const metadata = {
  title: "Chikitsaak — Care, Connected",
  description: "Care, Connected",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Chikitsaak — Care, Connected",
    statusBarStyle: "default",
  },
};

export const viewport = {
  themeColor: "#176b63",
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

            <Header user={user} />
            <ServiceWorkerRegistration />
            <div className="min-h-screen">
              {children}
            </div>
            <Toaster richColors />

            <footer className="border-t border-border bg-card">
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
