'use server';

import { ID, Query } from "node-appwrite";
import { createAdminClient, createSessionClient } from "../appwrite";
import { cookies } from "next/headers";
import { encryptId, extractCustomerIdFromUrl, parseStringify } from "../utils";
import { plaidClient } from "../plaid";
import { addFundingSource, createDwollaCustomer } from "./dwolla.actions";

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

// Sign in
export const signIn = async (
    { email, password }: SignInParams
) => {
    try {
        const { account } = await createAdminClient();

        const session = await account.createEmailPasswordSession({
            email,
            password,
        });

        (await cookies()).set("appwrite-session", session.secret, {
            path: "/",
            httpOnly: true,
            sameSite: "strict",
            secure: true,
        });

        const user = await getUserInfo({
            userId: session.userId,
        });

        return parseStringify(user);

    } catch (error) {
        console.error("Error", error);
        return null;
    }
};

// Sign up
export const signUp = async (
    { password, ...userData }: SignUpParams
): Promise<User | null> => {

    const { email, firstName, lastName } = userData;

    let newUserAccount;

    try {
        const { account, database } = await createAdminClient();

        newUserAccount = await account.create({
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

        (await cookies()).set("appwrite-session", session.secret, {
            path: "/",
            httpOnly: true,
            sameSite: "strict",
            secure: true,
        });

        return parseStringify(newUser);

    } catch (error) {
        console.error("Error", error);
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
        console.log("getLoggedInUser:", error);
        return null;
    }
}

declare type SignInParams = {
    email: string;
    password: string;
};

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
        console.error("Logout error:", error);
        return null;
    }
};

// Create Plaid link token
export const createLinkToken = async (user: User) => {
    try {
        const loggedInUser = await getLoggedInUser();

        if (!loggedInUser || loggedInUser.$id !== user.$id) {
            throw new Error("Unauthorized");
        }

        const tokenParams = {
            user: {
                client_user_id: loggedInUser.$id,
            },
            client_name: `${loggedInUser.firstName} ${loggedInUser.lastName}`,
            products: ["auth"] as Products[],
            language: "en",
            country_codes: ["US"] as CountryCode[],
        };

        const response = await plaidClient.linkTokenCreate(tokenParams);

        return parseStringify({
            linkToken: response.data.link_token,
        });

    } catch (error) {
        console.error(error);
        return null;
    }
};

// Create bank account
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
        console.error("Error creating bank account:", error);
        throw error;
    }
};

// Exchange public token
export const exchangePublicToken = async ({
    publicToken,
    user,
}: exchangePublicTokenProps) => {
    try {
        const loggedInUser = await getLoggedInUser();

        if (!loggedInUser || loggedInUser.$id !== user.$id) {
            throw new Error("Unauthorized");
        }

        const response = await plaidClient.itemPublicTokenExchange({
            public_token: publicToken,
        });

        const accessToken = response.data.access_token;
        const itemId = response.data.item_id;

        // Get account information from Plaid
        const accountsResponse = await plaidClient.accountsGet({
            access_token: accessToken,
        });

        const accountData = accountsResponse.data.accounts[0];

        if (!accountData) {
            throw new Error("No bank account found");
        }

        // Create a processor token
        const request: ProcessorTokenCreateRequest = {
            access_token: accessToken,
            account_id: accountData.account_id,
            processor: "dwolla" as ProcessorTokenCreateRequestProcessorEnum,
        };

        const processorTokenResponse =
            await plaidClient.processorTokenCreate(request);

        const processorToken =
            processorTokenResponse.data.processor_token;

        // Create a funding source URL using Dwolla
        const fundingSourceUrl = await addFundingSource({
            dwollaCustomerId: loggedInUser.dwollaCustomerId,
            processorToken,
            bankName: accountData.name,
        });

        if (!fundingSourceUrl) {
            throw new Error("Funding source URL not found");
        }

        // Create a bank account
        await createBankAccount({
            userId: loggedInUser.$id,
            bankId: itemId,
            accountId: accountData.account_id,
            accessToken,
            fundingSourceUrl,
            shareableId: encryptId(accountData.account_id),
        });

        // Revalidate the path
        revalidatePath("/");

        return parseStringify({
            publicTokenExchange: "complete",
        });

    } catch (error) {
        console.error(
            "An error occurred while exchanging token:",
            error
        );

        return null;
    }
};

// Get multiple banks
export const getBanks = async ({ userId }: getBanksProps) => {
    try {
        const loggedInUser = await getLoggedInUser();

        if (!loggedInUser || loggedInUser.$id !== userId) {
            throw new Error("Unauthorized");
        }

        const { database } = await createAdminClient();

        const banks = await database.listDocuments(
            DATABASE_ID!,
            BANK_COLLECTION_ID!,
            [Query.equal("userId", [userId])]
        );

        return parseStringify(banks.documents);

    } catch (error) {
        console.log(error);
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
        console.log(error);
    }
};