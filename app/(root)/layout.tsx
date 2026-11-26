import Image from "next/image";
import MobileNav from "@/components/MobileNav";
import Sidebar from "@/components/Sidebar";
import type { ReactNode } from "react";
import { getLoggedInUser } from "@/lib/actions/user.actions";
import { redirect } from "next/navigation";

export default async function RootLayout({
    children,
}: Readonly<{
    children: ReactNode;
}>) {
    const loggedIn = await getLoggedInUser();

    if (!loggedIn) redirect("/sign-in");

    return (
        <main className="flex h-screen w-full font-inter">
            <Sidebar user={loggedIn} />

            <div className="flex min-w-0 flex-1 flex-col">
                <div className="root-layout">
                    <Image
                        src="/icons/logo.svg"
                        width={30}
                        height={30}
                        alt="logo"
                    />

                    <div>
                        <MobileNav user={loggedIn} />
                    </div>
                </div>

                {children}
            </div>
        </main>
    );
}