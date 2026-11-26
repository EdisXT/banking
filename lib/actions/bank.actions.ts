"use server";

import { CountryCode } from "plaid/legacy";

import { plaidClient } from "../plaid";
import { parseStringify } from "../utils";
import { getBanks, getBank } from "./user.actions";
import { getTransactionsByBankId } from "./transaction.actions";

type PlaidError = {
    response?: {
        data?: {
            error_code?: string;
            error_message?: string;
            error_type?: string;
            request_id?: string;
        };
    };
    message?: string;
};

type TransferRecord = {
    $id: string;
    $createdAt: string;
    name: string;
    amount: string | number;
    channel?: string;
    status?: string;
    transferUrl?: string;
    senderBankId: string;
    receiverBankId: string;
};

// Calculate simulated balance adjustments.
// Only processed sandbox transfers affect balances.
const getSandboxBalanceAdjustment = (
    bankId: string,
    transfers: TransferRecord[]
): number => {
    if (process.env.DWOLLA_ENV !== "sandbox") {
        return 0;
    }

    let adjustment = 0;

    const seen = new Set<string>();

    for (const transfer of transfers) {
        if (
            transfer.status !== "processed" ||
            !transfer.transferUrl ||
            seen.has(transfer.transferUrl)
        ) {
            continue;
        }

        const amount = Math.round(
            Number(transfer.amount) * 100
        );

        if (
            !Number.isSafeInteger(amount) ||
            amount <= 0
        ) {
            continue;
        }

        seen.add(transfer.transferUrl);

        if (transfer.senderBankId === bankId) {
            adjustment -= amount;
        }

        if (transfer.receiverBankId === bankId) {
            adjustment += amount;
        }
    }

    return adjustment / 100;
};

const adjustBalance = (
    balance: number,
    adjustment: number
): number => {
    return (
        Math.round(balance * 100) +
        Math.round(adjustment * 100)
    ) / 100;
};

// Get multiple bank accounts
export const getAccounts = async ({
    userId,
}: getAccountsProps) => {
    try {
        const banks = await getBanks({ userId });

        const accounts = await Promise.all(
            (banks ?? []).map(async (bank: Bank) => {
                const accountsResponse =
                    await plaidClient.accountsGet({
                        access_token: bank.accessToken,
                    });

                const accountData =
                    accountsResponse.data.accounts.find(
                        (account) =>
                            account.account_id === bank.accountId
                    );

                if (!accountData) {
                    throw new Error("Bank account not found");
                }

                const [institution, transferRecords] =
                    await Promise.all([
                        getInstitution({
                            institutionId:
                                accountsResponse.data.item.institution_id!,
                        }),

                        getTransactionsByBankId({
                            bankId: bank.$id,
                        }),
                    ]);

                const adjustment =
                    getSandboxBalanceAdjustment(
                        bank.$id,
                        transferRecords?.documents ?? []
                    );

                return {
                    id: accountData.account_id,

                    availableBalance: adjustBalance(
                        accountData.balances.available ??
                        accountData.balances.current ??
                        0,
                        adjustment
                    ),

                    currentBalance: adjustBalance(
                        accountData.balances.current ?? 0,
                        adjustment
                    ),

                    institutionId:
                        institution?.institution_id ?? "",

                    name: accountData.name,

                    officialName:
                        accountData.official_name,

                    mask: accountData.mask ?? "",

                    type: accountData.type as string,

                    subtype: accountData.subtype ?? "",

                    appwriteItemId: bank.$id,

                    shareableId: bank.shareableId,
                };
            })
        );

        const totalBanks = accounts.length;

        const totalCurrentBalance =
            accounts.reduce(
                (
                    total: number,
                    account: { currentBalance: number }
                ) =>
                    total +
                    Math.round(account.currentBalance * 100),
                0
            ) / 100;

        return parseStringify({
            data: accounts,
            totalBanks,
            totalCurrentBalance,
        });

    } catch (error) {
        console.error(
            "An error occurred while getting the accounts:",
            error instanceof Error
                ? error.message
                : "Unknown error"
        );

        return null;
    }
};

// Get one bank account
export const getAccount = async ({
    appwriteItemId,
}: getAccountProps) => {
    try {
        const bank = await getBank({
            documentId: appwriteItemId,
        });

        if (!bank) {
            return null;
        }

        const accountsResponse =
            await plaidClient.accountsGet({
                access_token: bank.accessToken,
            });

        const accountData =
            accountsResponse.data.accounts.find(
                (account) =>
                    account.account_id === bank.accountId
            );

        if (!accountData) {
            throw new Error("Bank account not found");
        }

        const [
            institution,
            transactions,
            transferRecords,
        ] = await Promise.all([
            getInstitution({
                institutionId:
                    accountsResponse.data.item.institution_id!,
            }),

            getTransactions({
                accessToken: bank.accessToken,
            }),

            getTransactionsByBankId({
                bankId: bank.$id,
            }),
        ]);

        const adjustment =
            getSandboxBalanceAdjustment(
                bank.$id,
                transferRecords?.documents ?? []
            );

        const account = {
            id: accountData.account_id,

            availableBalance: adjustBalance(
                accountData.balances.available ??
                accountData.balances.current ??
                0,
                adjustment
            ),

            currentBalance: adjustBalance(
                accountData.balances.current ?? 0,
                adjustment
            ),

            institutionId:
                institution?.institution_id ?? "",

            name: accountData.name,

            officialName:
                accountData.official_name,

            mask: accountData.mask ?? "",

            type: accountData.type as string,

            subtype: accountData.subtype ?? "",

            appwriteItemId: bank.$id,

            shareableId: bank.shareableId,
        };

        // Only retrieve transactions belonging
        // to the currently selected account
        const plaidTransactions = (
            transactions ?? []
        ).filter(
            (transaction: Transaction) =>
                transaction.accountId ===
                accountData.account_id
        );

        // Convert Appwrite transfers into
        // the transaction table format
        const transferTransactions = (
            transferRecords?.documents ?? []
        ).map((transfer: TransferRecord) => {
            const isDebit =
                transfer.senderBankId === bank.$id;

            const amount = Math.abs(
                Number(transfer.amount)
            );

            const status =
                transfer.status ?? "unknown";

            return {
                id: `transfer-${transfer.$id}`,

                $id: transfer.$id,

                name:
                    transfer.name ||
                    (isDebit
                        ? "Outgoing Transfer"
                        : "Incoming Transfer"),

                paymentChannel:
                    transfer.channel || "online",

                type: isDebit ? "debit" : "credit",

                accountId: accountData.account_id,

                amount: isDebit ? amount : -amount,

                pending:
                    status === "pending" ||
                    status === "unknown",

                status,

                category: "Transfer",

                date: transfer.$createdAt,

                image: "",

                $createdAt: transfer.$createdAt,

                channel:
                    transfer.channel || "online",

                senderBankId:
                    transfer.senderBankId,

                receiverBankId:
                    transfer.receiverBankId,
            };
        });

        // Combine Plaid and Appwrite transactions
        const allTransactions = [
            ...plaidTransactions,
            ...transferTransactions,
        ].sort(
            (a: Transaction, b: Transaction) =>
                new Date(b.date).getTime() -
                new Date(a.date).getTime()
        );

        console.log(
            "========== TRANSACTION HISTORY =========="
        );

        console.log(
            "Plaid transactions:",
            plaidTransactions.length
        );

        console.log(
            "Appwrite transfers:",
            transferTransactions.length
        );

        console.log(
            "Sandbox balance adjustment:",
            adjustment
        );

        console.log(
            "Total combined transactions:",
            allTransactions.length
        );

        console.log(
            "========================================="
        );

        return parseStringify({
            data: account,
            transactions: allTransactions,
        });

    } catch (error) {
        console.error(
            "An error occurred while getting the account:",
            error instanceof Error
                ? error.message
                : "Unknown error"
        );

        return null;
    }
};

// Get bank information
export const getInstitution = async ({
    institutionId,
}: getInstitutionProps) => {
    try {
        const institutionResponse =
            await plaidClient.institutionsGetById({
                institution_id: institutionId,
                country_codes: ["US"] as CountryCode[],
            });

        return parseStringify(
            institutionResponse.data.institution
        );

    } catch (error) {
        console.error(
            "An error occurred while getting the institution:",
            error instanceof Error
                ? error.message
                : "Unknown error"
        );

        return null;
    }
};

// Get Plaid transactions
export const getTransactions = async ({
    accessToken,
}: getTransactionsProps) => {
    let hasMore = true;

    let cursor: string | undefined;

    const transactions = new Map<string, any>();

    try {
        while (hasMore) {
            const response =
                await plaidClient.transactionsSync({
                    access_token: accessToken,

                    ...(cursor !== undefined
                        ? { cursor }
                        : {}),
                });

            const data = response.data;

            console.log("Plaid sync page:", {
                added: data.added.length,
                modified: data.modified.length,
                hasMore: data.has_more,
            });

            const updatedTransactions = [
                ...data.added,
                ...data.modified,
            ];

            for (
                const transaction of updatedTransactions
            ) {
                transactions.set(
                    transaction.transaction_id,
                    {
                        id: transaction.transaction_id,

                        name: transaction.name,

                        paymentChannel:
                            transaction.payment_channel,

                        type:
                            transaction.amount > 0
                                ? "debit"
                                : "credit",

                        accountId:
                            transaction.account_id,

                        amount: transaction.amount,

                        pending: transaction.pending,

                        status: transaction.pending
                            ? "pending"
                            : "processed",

                        category:
                            transaction.category?.[0] ??
                            transaction.personal_finance_category
                                ?.primary ??
                            "Other",

                        date: transaction.date,

                        image:
                            transaction.logo_url ?? "",
                    }
                );
            }

            for (
                const removedTransaction of data.removed
            ) {
                transactions.delete(
                    removedTransaction.transaction_id
                );
            }

            cursor = data.next_cursor;

            hasMore = data.has_more;
        }

        const result = Array.from(
            transactions.values()
        );

        console.log(
            `Successfully retrieved ${result.length} transactions.`
        );

        return parseStringify(result);

    } catch (error) {
        const plaidError = error as PlaidError;

        const details = plaidError.response?.data;

        if (
            details?.error_code === "PRODUCT_NOT_READY"
        ) {
            console.log(
                "Plaid is still preparing transaction data."
            );

            return [];
        }

        console.warn(
            "Plaid transaction retrieval failed:",
            {
                errorCode: details?.error_code,

                errorMessage:
                    details?.error_message ??
                    plaidError.message,

                errorType: details?.error_type,

                requestId: details?.request_id,
            }
        );

        return [];
    }
};