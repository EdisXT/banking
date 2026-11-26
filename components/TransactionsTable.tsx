import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

import { transactionCategoryStyles } from "@/constants";

import {
    cn,
    formatAmount,
    formatDateTime,
    removeSpecialCharacters,
} from "@/lib/utils";

const additionalStatusStyles = {
    Failed: {
        borderColor: "border-red-600",
        backgroundColor: "bg-red-600",
        textColor: "text-red-700",
        chipBackgroundColor: "bg-red-50",
    },
    Cancelled: {
        borderColor: "border-gray-400",
        backgroundColor: "bg-gray-500",
        textColor: "text-gray-700",
        chipBackgroundColor: "bg-gray-100",
    },
};

const CategoryBadge = ({ category }: CategoryBadgeProps) => {
    const {
        borderColor,
        backgroundColor,
        textColor,
        chipBackgroundColor,
    } =
        additionalStatusStyles[
            category as keyof typeof additionalStatusStyles
        ] ||
        transactionCategoryStyles[
            category as keyof typeof transactionCategoryStyles
        ] || {
            borderColor: "border-gray-500",
            backgroundColor: "bg-gray-500",
            textColor: "text-gray-700",
            chipBackgroundColor: "bg-gray-100",
        };

    return (
        <div
            className={cn(
                "category-badge",
                borderColor,
                chipBackgroundColor
            )}
        >
            <div
                className={cn(
                    "size-2 rounded-full",
                    backgroundColor
                )}
            />

            <p className={cn("text-[12px] font-medium", textColor)}>
                {category}
            </p>
        </div>
    );
};

const getTransactionStatus = (
    transaction: Transaction & { status?: string }
): string => {
    switch (transaction.status?.toLowerCase()) {
        case "processed":
            return "Success";

        case "pending":
            return "Processing";

        case "failed":
            return "Failed";

        case "cancelled":
            return "Cancelled";

        case "unknown":
            return "Processing";

        default:
            if (transaction.status) {
                return "Processing";
            }

            return transaction.pending
                ? "Processing"
                : "Success";
    }
};

const TransactionsTable = ({
    transactions,
}: TransactionTableProps) => {
    return (
        <Table>
            <TableHeader className="bg-[#f9fafb]">
                <TableRow>
                    <TableHead className="px-2">
                        Transaction
                    </TableHead>

                    <TableHead className="px-2">
                        Amount
                    </TableHead>

                    <TableHead className="px-2">
                        Status
                    </TableHead>

                    <TableHead className="px-2">
                        Date
                    </TableHead>

                    <TableHead className="px-2 max-md:hidden">
                        Channel
                    </TableHead>

                    <TableHead className="px-2 max-md:hidden">
                        Category
                    </TableHead>
                </TableRow>
            </TableHeader>

            <TableBody>
                {transactions.length === 0 && (
                    <TableRow>
                        <TableCell
                            colSpan={6}
                            className="py-8 text-center text-gray-500"
                        >
                            No transactions available yet.
                            Check the server terminal for Plaid sync status.
                        </TableCell>
                    </TableRow>
                )}

                {transactions.map((t: Transaction) => {
                    const status = getTransactionStatus(t);

                    const amount = formatAmount(
                        Math.abs(t.amount)
                    );

                    const isDebit = t.type === "debit";
                    const isCredit = t.type === "credit";

                    return (
                        <TableRow
                            key={t.id}
                            className={cn(
                                "border-b border-gray-200",
                                {
                                    "bg-[#FFFBFA]": isDebit,
                                    "bg-[#F6FEF9]": isCredit,
                                }
                            )}
                        >
                            <TableCell className="max-w-[250px] px-3 py-4">
                                <div className="flex items-center gap-3">
                                    <h1 className="text-14 truncate font-semibold text-[#344054]">
                                        {removeSpecialCharacters(t.name)}
                                    </h1>
                                </div>
                            </TableCell>

                            <TableCell
                                className={cn(
                                    "px-3 py-4 font-semibold",
                                    {
                                        "text-[#f04438]": isDebit,
                                        "text-[#039855]": isCredit,
                                    }
                                )}
                            >
                                {isDebit ? `-${amount}` : amount}
                            </TableCell>

                            <TableCell className="px-3 py-4">
                                <CategoryBadge category={status} />
                            </TableCell>

                            <TableCell className="min-w-32 px-3 py-4">
                                {formatDateTime(new Date(t.date)).dateTime}
                            </TableCell>

                            <TableCell className="px-3 py-4 capitalize max-md:hidden">
                                {t.paymentChannel?.replace(/_/g, " ")}
                            </TableCell>

                            <TableCell className="px-3 py-4 max-md:hidden">
                                <CategoryBadge
                                    category={t.category || "Other"}
                                />
                            </TableCell>
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    );
};

export default TransactionsTable;