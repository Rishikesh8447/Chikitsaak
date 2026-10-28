export default function manifest() {
  return {
    name: "Chikitsaak — Care, Connected",
    short_name: "Chikitsaak",
    description: "Connect with doctors and manage your care with Chikitsaak.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F8F7F3",
    theme_color: "#27665B",
    categories: ["medical", "health", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
  };
}
