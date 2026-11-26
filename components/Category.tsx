import Image from "next/image";

import { topCategoryStyles } from "@/constants";
import { cn } from "@/lib/utils";
import { Progress } from "./ui/progress";

const Category = ({ category }: CategoryProps) => {
    const {
        bg,
        circleBg,
        text: { main, count },
        progress: { bg: progressBg, indicator },
        icon,
    } =
        topCategoryStyles[
            category.name as keyof typeof topCategoryStyles
        ] || topCategoryStyles.default;

    const percentage = category.totalCount
        ? (category.count / category.totalCount) * 100
        : 0;

    return (
        <div className={cn("flex gap-[18px] rounded-xl p-4", bg)}>
            <figure
                className={cn(
                    "flex-center size-10 shrink-0 rounded-full",
                    circleBg
                )}
            >
                <Image
                    src={icon}
                    width={20}
                    height={20}
                    alt={category.name}
                />
            </figure>

            <div className="flex w-full flex-1 flex-col gap-2">
                <div className="text-14 flex justify-between">
                    <h2 className={cn("font-medium", main)}>
                        {category.name}
                    </h2>

                    <h3 className={cn("font-normal", count)}>
                        {category.count}
                    </h3>
                </div>

                <Progress
                    value={percentage}
                    trackClassName={progressBg}
                    indicatorClassName={indicator}
                    aria-label={category.name}
                />
            </div>
        </div>
    );
};

export default Category;