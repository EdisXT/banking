"use server";

import { ID, Query } from "node-appwrite";
import { createAdminClient, createSessionClient } from "../appwrite";
import { cookies } from "next/headers";

import {
    encryptId,
    extractCustomerIdFromUrl,
    parseStringify,
} from "../utils";

import { plaidClient } from "../plaid";

import {
    addFundingSource,
    createDwollaCustomer,
} from "./dwolla.actions";

import {
    Products,
    CountryCode,
    ProcessorTokenCreateRequest,
    ProcessorTokenCreateRequestProcessorEnum,
} from "plaid/legacy";

import { revalidatePath } from "next/cache";

const {
    APPWRITE_DATABASE_ID: DATABASE_ID,
    APPWRITE_USER_COLLECTION_ID: USER_COLLECTION_ID,
    APPWRITE_BANK_COLLECTION_ID: BANK_COLLECTION_ID,
} = process.env;

// Get user information
const getUserInfo = async ({ userId }: getUserInfoProps) => {
    try {
        const { database } = await createAdminClient();

        const user = await database.listDocuments(
            DATABASE_ID!,
            USER_COLLECTION_ID!,
            [Query.equal("userId", [userId])]
        );

        return parseStringify(user.documents[0] ?? null);
    } catch (error) {
        console.error("getUserInfo failed:", error);
        return null;
    }
};

declare type SignInParams = {
    email: string;
    password: string;
};

// Sign in
export const signIn = async ({
    email,
    password,
}: SignInParams) => {
    try {
        const { account } = await createAdminClient();

        const session = await account.createEmailPasswordSession({
            email,
            password,
        });

        (await cookies()).set(
            "appwrite-session",
            session.secret,
            {
                path: "/",
                httpOnly: true,
                sameSite: "strict",
                secure: true,
            }
        );

        const user = await getUserInfo({
            userId: session.userId,
        });

        return parseStringify(user);
    } catch (error) {
        console.error("Sign-in failed");
        return null;
    }
};

// Sign up
export const signUp = async ({
    password,
    ...userData
}: SignUpParams): Promise<User | null> => {
    const { email, firstName, lastName } = userData;

    try {
        const { account, database } = await createAdminClient();

        const newUserAccount = await account.create({
            userId: ID.unique(),
            email,
            password,
            name: `${firstName} ${lastName}`,
        });

        if (!newUserAccount) {
            throw new Error("Error Creating User");
        }

        const dwollaCustomerUrl = await createDwollaCustomer({
            ...userData,
            type: "personal",
        });

        if (!dwollaCustomerUrl) {
            throw new Error("Error Creating Dwolla Customer");
        }

        const dwollaCustomerId =
            extractCustomerIdFromUrl(dwollaCustomerUrl);

        const newUser = await database.createDocument(
            DATABASE_ID!,
            USER_COLLECTION_ID!,
            ID.unique(),
            {
                ...userData,
                userId: newUserAccount.$id,
                dwollaCustomerId,
                dwollaCustomerUrl,
            }
        );

        const session = await account.createEmailPasswordSession({
            email,
            password,
        });

        (await cookies()).set(
            "appwrite-session",
            session.secret,
            {
                path: "/",
                httpOnly: true,
                sameSite: "strict",
                secure: true,
            }
        );

        return parseStringify(newUser);
    } catch (error) {
        console.error("Sign-up failed");
        return null;
    }
};

// Get logged-in user
export async function getLoggedInUser() {
    try {
        const session = (await cookies()).get("appwrite-session");

        if (!session?.value) {
            return null;
        }

        const { account } = await createSessionClient();

        const user = await account.get();

        const userInfo = await getUserInfo({
            userId: user.$id,
        });

        return parseStringify(userInfo ?? null);
    } catch (error) {
        console.log("getLoggedInUser failed");
        return null;
    }
}

// Logout
export const logoutAccount = async () => {
    try {
        const { account } = await createSessionClient();

        await account.deleteSession({
            sessionId: "current",
        });

        (await cookies()).delete("appwrite-session");

        return true;
    } catch (error) {
        console.error("Logout failed");
        return null;
    }
};

// Create Plaid link token for new bank accounts
export const createLinkToken = async (
    user: Pick<User, "$id">
) => {
    try {
        const loggedInUser = await getLoggedInUser();

        if (!loggedInUser || loggedInUser.$id !== user.$id) {
            throw new Error("Unauthorized");
        }

        const tokenParams = {
            user: {
                client_user_id: loggedInUser.$id,
            },

            client_name: "True Banking",

            products: [
                "auth",
                "transactions",
            ] as Products[],

            language: "en",

            country_codes: ["US"] as CountryCode[],

            account_filters: {
                depository: {
                    account_subtypes: [
                        "checking",
                        "savings",
                    ] as any,
                },
            },
        };

        const response = await plaidClient.linkTokenCreate(
            tokenParams
        );

        return parseStringify({
            linkToken: response.data.link_token,
        });
    } catch (error: any) {
        console.error("Plaid link token creation failed:", {
            errorCode: error?.response?.data?.error_code,
            errorMessage: error?.response?.data?.error_message,
        });

        return null;
    }
};

// Create Plaid update mode token
export const createUpdateLinkToken = async (
    user: Pick<User, "$id">
) => {
    try {
        const loggedInUser = await getLoggedInUser();

        if (!loggedInUser || loggedInUser.$id !== user.$id) {
            throw new Error("Unauthorized");
        }

        const banks = await getBanks({
            userId: loggedInUser.$id,
        });

        if (!banks || banks.length === 0) {
            return null;
        }

        const bank = banks[0];

        const tokenParams = {
            user: {
                client_user_id: loggedInUser.$id,
            },

            client_name: "True Banking",
            language: "en",
            country_codes: ["US"] as CountryCode[],

            access_token: bank.accessToken,

            additional_consented_products: [
                "transactions",
            ] as Products[],
        };

        const response = await plaidClient.linkTokenCreate(
            tokenParams
        );

        console.log("Plaid update mode token created");

        return {
            linkToken: response.data.link_token,
        };
    } catch (error: any) {
        console.error("Plaid update token creation failed:", {
            errorCode: error?.response?.data?.error_code,
            errorMessage: error?.response?.data?.error_message,
        });

        return null;
    }
};

// Create bank account in Appwrite
const createBankAccount = async ({
    userId,
    bankId,
    accountId,
    accessToken,
    fundingSourceUrl,
    shareableId,
}: createBankAccountProps) => {
    try {
        const { database } = await createAdminClient();

        const bankAccount = await database.createDocument(
            DATABASE_ID!,
            BANK_COLLECTION_ID!,
            ID.unique(),
            {
                userId,
                bankId,
                accountId,
                accessToken,
                fundingSourceUrl,
                shareableId,
            }
        );

        console.log("Bank account successfully created");

        return parseStringify(bankAccount);
    } catch (error) {
        console.error("Error creating bank account");
        throw error;
    }
};

// Exchange public token and save selected bank accounts
export const exchangePublicToken = async ({
    publicToken,
    user,
    selectedAccountIds = [],
}: {
    publicToken: string;
    user: Pick<User, "$id">;
    selectedAccountIds?: string[];
}) => {
    try {
        const loggedInUser = await getLoggedInUser();

        if (!loggedInUser || loggedInUser.$id !== user.$id) {
            throw new Error("Unauthorized");
        }

        const response =
            await plaidClient.itemPublicTokenExchange({
                public_token: publicToken,
            });

        const accessToken = response.data.access_token;
        const itemId = response.data.item_id;

        const accountsResponse = await plaidClient.accountsGet({
            access_token: accessToken,
        });

        const eligibleAccounts =
            accountsResponse.data.accounts.filter(
                (account) =>
                    account.type === "depository" &&
                    (
                        account.subtype === "checking" ||
                        account.subtype === "savings"
                    )
            );

        if (selectedAccountIds.length === 0) {
            throw new Error(
                "No selected bank accounts were returned by Plaid."
            );
        }

        const selectedAccounts = eligibleAccounts.filter(
            (account) =>
                selectedAccountIds.includes(account.account_id)
        );

        if (selectedAccounts.length === 0) {
            throw new Error(
                "No eligible checking or savings accounts found."
            );
        }

        const existingBanks =
            (await getBanks({
                userId: loggedInUser.$id,
            })) ?? [];

        let savedAccounts = 0;

        for (const accountData of selectedAccounts) {
            const alreadyConnected = existingBanks.some(
                (bank: Bank) =>
                    bank.accountId === accountData.account_id
            );

            if (alreadyConnected) {
                console.log("Account already connected");
                continue;
            }

            const request: ProcessorTokenCreateRequest = {
                access_token: accessToken,

                account_id: accountData.account_id,

                processor:
                    "dwolla" as ProcessorTokenCreateRequestProcessorEnum,
            };

            const processorTokenResponse =
                await plaidClient.processorTokenCreate(request);

            const processorToken =
                processorTokenResponse.data.processor_token;

            const fundingSourceUrl = await addFundingSource({
                dwollaCustomerId: loggedInUser.dwollaCustomerId,
                processorToken,
                bankName: accountData.name,
            });

            if (!fundingSourceUrl) {
                throw new Error(
                    "Unable to create Dwolla funding source."
                );
            }

            const duplicateFundingSource = existingBanks.some(
                (bank: Bank) =>
                    bank.fundingSourceUrl === fundingSourceUrl
            );

            if (duplicateFundingSource) {
                console.log(
                    "Duplicate funding source skipped"
                );

                continue;
            }

            const newBank = await createBankAccount({
                userId: loggedInUser.$id,
                bankId: itemId,
                accountId: accountData.account_id,
                accessToken,
                fundingSourceUrl,
                shareableId: encryptId(accountData.account_id),
            });

            existingBanks.push(newBank);

            savedAccounts++;

            console.log(
                "Bank account saved:",
                accountData.name,
                accountData.subtype
            );
        }

        revalidatePath("/");
        revalidatePath("/my-banks");
        revalidatePath("/payment-transfer");
        revalidatePath("/transaction-history");

        if (savedAccounts === 0) {
            return {
                publicTokenExchange: "failed",
                message:
                    "These bank accounts are already connected.",
            };
        }

        return {
            publicTokenExchange: "complete",
            savedAccounts,
        };
    } catch (error: any) {
        console.error("Public token exchange failed:", {
            errorCode: error?.response?.data?.error_code,
            errorMessage: error?.response?.data?.error_message,
            message: error?.message,
        });

        revalidatePath("/");
        revalidatePath("/my-banks");

        return {
            publicTokenExchange: "failed",
            message:
                "Unable to connect all selected accounts. Check My Banks and the server terminal.",
        };
    }
};

// Refresh bank connection
export const refreshBankConnection = async () => {
    const loggedInUser = await getLoggedInUser();

    if (!loggedInUser) {
        return false;
    }

    revalidatePath("/");
    revalidatePath("/my-banks");
    revalidatePath("/transaction-history");

    console.log("Bank connection refresh requested");

    return true;
};

// Get multiple banks
export const getBanks = async ({
    userId,
}: getBanksProps) => {
    try {
        const loggedInUser = await getLoggedInUser();

        if (!loggedInUser || loggedInUser.$id !== userId) {
            throw new Error("Unauthorized");
        }

        const { database } = await createAdminClient();

        const banks = await database.listDocuments(
            DATABASE_ID!,
            BANK_COLLECTION_ID!,
            [
                Query.equal("userId", [userId]),
                Query.limit(100),
            ]
        );

        return parseStringify(banks.documents);
    } catch (error) {
        console.log("Unable to retrieve banks");
    }
};

// Get one bank
export const getBank = async ({
    documentId,
}: {
    documentId: string;
}) => {
    try {
        const loggedInUser = await getLoggedInUser();

        if (!loggedInUser) {
            throw new Error("Unauthorized");
        }

        const { database } = await createAdminClient();

        const bank = await database.getDocument(
            DATABASE_ID!,
            BANK_COLLECTION_ID!,
            documentId
        );

        if (bank.userId !== loggedInUser.$id) {
            throw new Error("Unauthorized");
        }

        return parseStringify(bank);
    } catch (error) {
        console.log("Unable to retrieve bank");
    }
};

// Find bank by account ID
export const getBankByAccountId = async ({
    accountId,
}: getBankByAccountIdProps) => {
    try {
        const loggedInUser = await getLoggedInUser();

        if (!loggedInUser) {
            throw new Error("Unauthorized");
        }

        const { database } = await createAdminClient();

        const bank = await database.listDocuments(
            DATABASE_ID!,
            BANK_COLLECTION_ID!,
            [Query.equal("accountId", [accountId])]
        );

        if (bank.total !== 1) {
            return null;
        }

        return parseStringify({
            $id: bank.documents[0].$id,
            accountId: bank.documents[0].accountId,
            userId: bank.documents[0].userId,
        });
    } catch (error) {
        console.log("Unable to retrieve bank by account ID");
        return null;
    }
};