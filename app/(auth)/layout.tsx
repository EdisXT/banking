import type { ReactNode } from "react";

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-[#F5F6F2] px-6 font-inter">
      {children}
    </main>
  );
}