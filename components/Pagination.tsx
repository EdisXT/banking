"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "./ui/button";
import { formUrlQuery } from "@/lib/utils";

export const Pagination = ({
    page,
    totalPages,
}: PaginationProps) => {
    const router = useRouter();
    const searchParams = useSearchParams();

    const handleNavigation = (type: "prev" | "next") => {
        const pageNumber = type === "prev" ? page - 1 : page + 1;

        const newUrl = formUrlQuery({
            params: searchParams.toString(),
            key: "page",
            value: pageNumber.toString(),
        });

        router.push(newUrl, { scroll: false });
    };

    return (
        <div className="flex w-full items-center justify-between gap-2">
            <Button
                variant="outline"
                className="text-14 gap-2 border-gray-300 bg-white text-gray-700"
                onClick={() => handleNavigation("prev")}
                disabled={page <= 1}
            >
                Previous
            </Button>

            <p className="text-14 text-center text-gray-700">
                {page} / {totalPages}
            </p>

            <Button
                variant="outline"
                className="text-14 gap-2 border-gray-300 bg-white text-gray-700"
                onClick={() => handleNavigation("next")}
                disabled={page >= totalPages}
            >
                Next
            </Button>
        </div>
    );
};