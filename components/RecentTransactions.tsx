import Link from "next/link";
import BankInfo from "./BankInfo";
import TransactionsTable from "./TransactionsTable";
import { Pagination } from "./Pagination";
import { cn } from "@/lib/utils";

const RecentTransactions = ({
    accounts,
    transactions = [],
    appwriteItemId,
    page = 1,
}: RecentTransactionsProps) => {
    const rowsPerPage = 10;

    const totalPages = Math.ceil(
        transactions.length / rowsPerPage
    );

    const indexOfLastTransaction = page * rowsPerPage;

    const indexOfFirstTransaction =
        indexOfLastTransaction - rowsPerPage;

    const currentTransactions = transactions.slice(
        indexOfFirstTransaction,
        indexOfLastTransaction
    );

    const selected = accounts.find(
        (account) => account.appwriteItemId === appwriteItemId
    );

    return (
        <section className="recent-transactions min-w-0">
            <header className="flex items-center justify-between gap-4">
                <h2 className="recent-transactions-label">
                    Recent Transactions
                </h2>

                <Link
                    href={`/transaction-history/?id=${appwriteItemId || ""}`}
                    className="view-all-btn shrink-0"
                >
                    View All
                </Link>
            </header>

            <nav
                aria-label="Bank accounts"
                className="flex w-full gap-4 overflow-x-auto border-b border-gray-200"
            >
                {accounts.map((account) => (
                    <Link
                        key={account.appwriteItemId}
                        href={`/?id=${encodeURIComponent(account.appwriteItemId)}`}
                        scroll={false}
                        aria-current={
                            account.appwriteItemId === appwriteItemId
                                ? "page"
                                : undefined
                        }
                        className={cn(
                            "banktab-item shrink-0 whitespace-nowrap font-medium text-gray-500 border-transparent",
                            account.appwriteItemId === appwriteItemId &&
                                "border-blue-600 text-blue-600"
                        )}
                    >
                        {account.name}
                    </Link>
                ))}
            </nav>

            {selected ? (
                <div className="min-w-0 space-y-4">
                    <BankInfo
                        account={selected}
                        appwriteItemId={appwriteItemId}
                        type="full"
                    />

                    <TransactionsTable
                        transactions={currentTransactions}
                    />

                    {totalPages > 1 && (
                        <div className="my-4 w-full">
                            <Pagination
                                totalPages={totalPages}
                                page={page}
                            />
                        </div>
                    )}
                </div>
            ) : (
                <p className="text-sm text-gray-500">
                    Connect a bank to view transactions.
                </p>
            )}
        </section>
    );
};

export default RecentTransactions;