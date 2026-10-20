export default function manifest() {
  return {
    name: "Chikitsaak — Care, Connected",
    short_name: "Chikitsaak",
    description: "Connect with doctors and manage your care with Chikitsaak.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f5f8f7",
    theme_color: "#176b63",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
