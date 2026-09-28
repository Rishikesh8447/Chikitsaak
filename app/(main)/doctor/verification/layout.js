export const metadata = {
  title: "Doctor verification | Chikitsaak",
  description: "Track your professional profile verification status.",
};

export default async function DoctorDashboardLayout({ children }) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-7 sm:px-6 sm:py-10">
      {children}
    </div>
  );
}
