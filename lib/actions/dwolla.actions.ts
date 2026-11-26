"use server";

import { Client } from "dwolla-v2";

const getEnvironment = (): "production" | "sandbox" => {
    const environment = process.env.DWOLLA_ENV;

    if (environment === "sandbox" || environment === "production") {
        return environment;
    }

    throw new Error("Invalid Dwolla environment");
};

const dwollaClient = new Client({
    environment: getEnvironment(),
    key: process.env.DWOLLA_KEY as string,
    secret: process.env.DWOLLA_SECRET as string,
});

type DwollaError = {
    status?: number;
    body?: {
        code?: string;
        message?: string;
        _links?: {
            about?: {
                href?: string;
            };
        };
    };
};

export const createFundingSource = async (
    options: CreateFundingSourceOptions
) => {
    try {
        const response = await dwollaClient.post(
            `customers/${options.customerId}/funding-sources`,
            {
                name: options.fundingSourceName,
                plaidToken: options.plaidToken,
            }
        );

        console.log("Dwolla funding source created successfully.");

        return response.headers.get("location");

    } catch (error) {
        const dwollaError = error as DwollaError;

        // Handle an existing bank account
        if (dwollaError.body?.code === "DuplicateResource") {
            const existingUrl =
                dwollaError.body._links?.about?.href;

            if (!existingUrl) {
                throw new Error(
                    "Duplicate funding source URL not found."
                );
            }

            // Verify that the funding source belongs to this customer
            const customerResponse = await dwollaClient.get(
                `customers/${options.customerId}/funding-sources`
            );

            const fundingSources =
                customerResponse.body._embedded?.["funding-sources"] ?? [];

            const existingSource = fundingSources.find(
                (source: {
                    removed?: boolean;
                    _links?: {
                        self?: {
                            href?: string;
                        };
                    };
                }) =>
                    source._links?.self?.href === existingUrl &&
                    source.removed === false
            );

            if (!existingSource) {
                throw new Error(
                    "Unable to verify existing funding source ownership."
                );
            }

            console.log(
                "Existing Dwolla funding source verified and reused."
            );

            return existingUrl;
        }

        console.error(
            "Funding source creation failed:",
            dwollaError.body?.code,
            dwollaError.body?.message
        );

        throw error;
    }
};

export const createOnDemandAuthorization = async () => {
    try {
        const response = await dwollaClient.post(
            "on-demand-authorizations"
        );

        return response.body._links;

    } catch (error) {
        console.error("Authorization creation failed:", error);
    }
};

export const createDwollaCustomer = async (
    newCustomer: NewDwollaCustomerParams
) => {
    try {
        const response = await dwollaClient.post(
            "customers",
            newCustomer
        );

        return response.headers.get("location");

    } catch (error) {
        console.error("Customer creation failed:", error);
    }
};

export const createTransfer = async ({
    sourceFundingSourceUrl,
    destinationFundingSourceUrl,
    amount,
}: TransferParams) => {
    try {
        const requestBody = {
            _links: {
                source: {
                    href: sourceFundingSourceUrl,
                },
                destination: {
                    href: destinationFundingSourceUrl,
                },
            },
            amount: {
                currency: "USD",
                value: amount,
            },
        };

        const response = await dwollaClient.post(
            "transfers",
            requestBody
        );

        return response.headers.get("location");

    } catch (error) {
        console.error("Transfer failed:", error);
    }
};

export const addFundingSource = async ({
    dwollaCustomerId,
    processorToken,
    bankName,
}: AddFundingSourceParams) => {
    try {
        const dwollaAuthLinks =
            await createOnDemandAuthorization();

        const fundingSourceOptions = {
            customerId: dwollaCustomerId,
            fundingSourceName: bankName,
            plaidToken: processorToken,
            _links: dwollaAuthLinks,
        };

        return await createFundingSource(fundingSourceOptions);

    } catch (error) {
        console.error("Adding funding source failed:", error);
        throw error;
    }
};