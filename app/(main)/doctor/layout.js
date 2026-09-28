export const metadata = {
  title: "Doctor workspace | Chikitsaak",
  description: "Manage consultations, availability, and practice earnings.",
};

export default async function DoctorDashboardLayout({ children }) {
  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 min-w-0">
      {children}
    </div>
  );
}
