"use server";

import { ID, Query } from "node-appwrite";

import { createAdminClient } from "../appwrite";
import { parseStringify } from "../utils";
import { getBank, getLoggedInUser } from "./user.actions";

import {
    createTransfer,
    getTransferStatus,
    simulateSandboxTransfers,
} from "./dwolla.actions";

import { revalidatePath } from "next/cache";

import * as z from "zod";

const {
    APPWRITE_DATABASE_ID: DATABASE_ID,
    APPWRITE_TRANSACTION_COLLECTION_ID: TRANSACTION_COLLECTION_ID,
    APPWRITE_BANK_COLLECTION_ID: BANK_COLLECTION_ID,
    APPWRITE_USER_COLLECTION_ID: USER_COLLECTION_ID,
} = process.env;

const transferSchema = z.object({
    email: z.email().max(100),
    name: z.string().max(100),
    amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
    senderBank: z.string().min(1),
    shareableId: z.string().min(8),
});

type TransferRecord = CreateTransactionProps & {
    transferUrl: string;
    status: string;
};

// Create transaction record in Appwrite.
const createTransaction = async (
    transaction: TransferRecord
) => {
    const { database } =
        await createAdminClient();

    const newTransaction =
        await database.createDocument(
            DATABASE_ID!,
            TRANSACTION_COLLECTION_ID!,
            ID.unique(),
            {
                channel: "online",
                category: "Transfer",
                ...transaction,
            }
        );

    console.log(
        "Transaction saved successfully."
    );

    return parseStringify(newTransaction);
};

// Refresh banking pages.
const refreshBankingPages = () => {
    revalidatePath("/");
    revalidatePath("/my-banks");
    revalidatePath("/transaction-history");
    revalidatePath("/payment-transfer");
};

// Execute payment transfer.
export const transferFunds = async (
    input: z.infer<typeof transferSchema>
) => {
    let transferUrl: string | null | undefined;

    let stage = "Validation";

    try {
        if (process.env.DWOLLA_ENV !== "sandbox") {
            return {
                success: false,
                message:
                    "Only sandbox transfers are enabled.",
            };
        }

        const parsed = transferSchema.safeParse(
            input
        );

        if (!parsed.success) {
            return {
                success: false,
                message: "Invalid transfer details.",
            };
        }

        const data = parsed.data;

        stage = "Authentication";

        const loggedIn = await getLoggedInUser();

        if (!loggedIn) {
            return {
                success: false,
                message: "Please sign in again.",
            };
        }

        const amount = Number(data.amount);

        if (
            !Number.isFinite(amount) ||
            amount <= 0 ||
            amount > 10000
        ) {
            return {
                success: false,
                message:
                    "Enter a valid transfer amount.",
            };
        }

        const { database } =
            await createAdminClient();

        stage = "Sender bank lookup";

        const senderBank = await getBank({
            documentId: data.senderBank,
        });

        if (
            !senderBank ||
            senderBank.userId !== loggedIn.$id
        ) {
            return {
                success: false,
                message: "Invalid source bank.",
            };
        }

        stage = "Receiver bank lookup";

        const receiverBanks =
            await database.listDocuments(
                DATABASE_ID!,
                BANK_COLLECTION_ID!,
                [
                    Query.equal(
                        "shareableId",
                        data.shareableId.trim()
                    ),
                    Query.limit(2),
                ]
            );

        if (receiverBanks.total !== 1) {
            return {
                success: false,
                message:
                    "Recipient bank could not be identified.",
            };
        }

        const receiverBank =
            receiverBanks.documents[0];

        stage = "Recipient verification";

        const receiver =
            await database.getDocument(
                DATABASE_ID!,
                USER_COLLECTION_ID!,
                receiverBank.userId
            );

        if (
            String(receiver.email)
                .trim()
                .toLowerCase() !==
            data.email.trim().toLowerCase()
        ) {
            return {
                success: false,
                message:
                    "Recipient email does not match the bank.",
            };
        }

        stage = "Funding source verification";

        if (
            !senderBank.fundingSourceUrl ||
            !receiverBank.fundingSourceUrl
        ) {
            return {
                success: false,
                message:
                    "Bank funding source is unavailable.",
            };
        }

        if (senderBank.$id === receiverBank.$id) {
            return {
                success: false,
                message:
                    "Source and destination are the same bank account.",
            };
        }

        if (
            senderBank.fundingSourceUrl ===
            receiverBank.fundingSourceUrl
        ) {
            return {
                success: false,
                message:
                    "These accounts share the same Dwolla funding source.",
            };
        }

        stage = "Dwolla transfer";

        transferUrl = await createTransfer({
            sourceFundingSourceUrl:
                senderBank.fundingSourceUrl,

            destinationFundingSourceUrl:
                receiverBank.fundingSourceUrl,

            amount: amount.toFixed(2),
        });

        if (!transferUrl) {
            return {
                success: false,
                message:
                    "Transfer could not be confirmed. Check Dwolla before retrying.",
            };
        }

        console.log(
            "Dwolla transfer submitted."
        );

        stage = "Appwrite transaction creation";

        const transaction =
            await createTransaction({
                name:
                    data.name.trim() ||
                    "Bank Transfer",

                amount: amount.toFixed(2),

                senderId: senderBank.userId,

                senderBankId: senderBank.$id,

                receiverId: receiverBank.userId,

                receiverBankId: receiverBank.$id,

                email: data.email.trim(),

                transferUrl,

                status: "pending",
            });

        // Automatically request sandbox settlement.
        //
        // Run only when explicitly enabled through
        // a server-side environment variable.
        //
        // Failure to simulate settlement does not
        // mean the submitted transfer failed.
        if (
            process.env.DWOLLA_ENV === "sandbox" &&
            process.env.DWOLLA_AUTO_SIMULATE === "true"
        ) {
            stage = "Sandbox simulation";

            try {
                await simulateSandboxTransfers();

                const latestStatus =
                    await getTransferStatus(
                        transferUrl
                    );

                if (
                    latestStatus &&
                    latestStatus !== "pending"
                ) {
                    await database.updateDocument(
                        DATABASE_ID!,
                        TRANSACTION_COLLECTION_ID!,
                        transaction.$id,
                        {
                            status: latestStatus,
                        }
                    );
                }

                console.log(
                    "Transfer status after simulation:",
                    latestStatus ?? "unknown"
                );

            } catch {
                console.warn(
                    "Transfer submitted, but sandbox settlement has not been confirmed."
                );
            }
        }

        stage = "Page revalidation";

        refreshBankingPages();

        return {
            success: true,
            message:
                "Transfer submitted successfully.",
        };

    } catch (error) {
        const transferError = error as {
            message?: string;
            code?: number;
            type?: string;
        };

        console.error(
            "Payment transfer failed:",
            {
                stage,

                message: transferError.message,

                code: transferError.code,

                type: transferError.type,

                transferSubmitted:
                    Boolean(transferUrl),
            }
        );

        if (transferUrl) {
            return {
                success: false,
                message:
                    "Transfer submitted, but local processing could not be confirmed. Do not retry.",
            };
        }

        return {
            success: false,
            message:
                "Unable to confirm transfer. Check Dwolla before retrying.",
        };
    }
};

// Retrieve and synchronize transactions.
export const getTransactionsByBankId = async ({
    bankId,
}: getTransactionsByBankIdProps) => {
    try {
        const loggedIn =
            await getLoggedInUser();

        if (!loggedIn) {
            throw new Error("Unauthorized");
        }

        const bank = await getBank({
            documentId: bankId,
        });

        if (
            !bank ||
            bank.userId !== loggedIn.$id
        ) {
            throw new Error("Unauthorized");
        }

        const { database } =
            await createAdminClient();

        // Retrieve all matching records
        // using pagination.
        const getAllTransactions = async (
            field: string
        ) => {
            const documents = [];

            let cursor: string | undefined;

            while (true) {
                const response =
                    await database.listDocuments(
                        DATABASE_ID!,
                        TRANSACTION_COLLECTION_ID!,
                        [
                            Query.equal(
                                field,
                                bankId
                            ),

                            Query.orderAsc("$id"),

                            Query.limit(100),

                            ...(cursor
                                ? [
                                    Query.cursorAfter(
                                        cursor
                                    ),
                                ]
                                : []),
                        ]
                    );

                documents.push(
                    ...response.documents
                );

                if (
                    response.documents.length < 100
                ) {
                    break;
                }

                cursor =
                    response.documents[
                        response.documents.length - 1
                    ].$id;
            }

            return documents;
        };

        const [
            senderTransactions,
            receiverTransactions,
        ] = await Promise.all([
            getAllTransactions("senderBankId"),

            getAllTransactions("receiverBankId"),
        ]);

        const uniqueTransactions = Array.from(
            new Map(
                [
                    ...senderTransactions,
                    ...receiverTransactions,
                ].map((transaction) => [
                    transaction.$id,
                    transaction,
                ])
            ).values()
        );

        // Query Dwolla for the actual status of
        // each transfer and synchronize Appwrite.
        const synchronizedTransactions =
            await Promise.all(
                uniqueTransactions.map(
                    async (transaction) => {
                        if (!transaction.transferUrl) {
                            return {
                                ...transaction,
                                status: "unknown",
                            };
                        }

                        if (
                            transaction.status === "failed" ||
                            transaction.status === "cancelled"
                        ) {
                            return transaction;
                        }

                        try {
                            const latestStatus =
                                await getTransferStatus(
                                    transaction.transferUrl
                                );

                            if (
                                latestStatus &&
                                latestStatus !==
                                    transaction.status
                            ) {
                                console.log(
                                    "Transfer status updated:",
                                    {
                                        previous:
                                            transaction.status,

                                        current:
                                            latestStatus,
                                    }
                                );

                                return await database.updateDocument(
                                    DATABASE_ID!,
                                    TRANSACTION_COLLECTION_ID!,
                                    transaction.$id,
                                    {
                                        status: latestStatus,
                                    }
                                );
                            }

                        } catch {
                            console.warn(
                                "Unable to synchronize transfer status."
                            );
                        }

                        // Preserve the last known status
                        // when Dwolla is temporarily unavailable.
                        return transaction;
                    }
                )
            );

        return parseStringify({
            total:
                synchronizedTransactions.length,

            documents:
                synchronizedTransactions,
        });

    } catch {
        console.error(
            "Unable to retrieve transactions."
        );

        return {
            total: 0,
            documents: [],
        };
    }
};