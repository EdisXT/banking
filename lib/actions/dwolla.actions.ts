import "server-only";

import { Client } from "dwolla-v2";

const getEnvironment = (): "production" | "sandbox" => {
    const environment = process.env.DWOLLA_ENV;

    if (
        environment === "sandbox" ||
        environment === "production"
    ) {
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

        console.log(
            "Dwolla funding source created successfully."
        );

        return response.headers.get("location");

    } catch (error) {
        const dwollaError = error as DwollaError;

        if (
            dwollaError.body?.code === "DuplicateResource"
        ) {
            const existingUrl =
                dwollaError.body._links?.about?.href;

            if (!existingUrl) {
                throw new Error(
                    "Duplicate funding source URL not found."
                );
            }

            const customerResponse = await dwollaClient.get(
                `customers/${options.customerId}/funding-sources`
            );

            const fundingSources =
                customerResponse.body._embedded?.[
                    "funding-sources"
                ] ?? [];

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

    } catch {
        console.error("Authorization creation failed.");
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

    } catch {
        console.error("Customer creation failed.");
    }
};

export const createTransfer = async ({
    sourceFundingSourceUrl,
    destinationFundingSourceUrl,
    amount,
}: TransferParams) => {
    try {
        if (getEnvironment() !== "sandbox") {
            throw new Error(
                "Only sandbox transfers are enabled."
            );
        }

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
        const dwollaError = error as DwollaError;

        console.error("Transfer failed:", {
            code: dwollaError.body?.code,
            message: dwollaError.body?.message,
        });

        return null;
    }
};

// Retrieve the current transfer status from Dwolla
export const getTransferStatus = async (
    transferUrl: string
): Promise<string | null> => {
    try {
        const url = new URL(transferUrl);

        const expectedHost =
            getEnvironment() === "sandbox"
                ? "api-sandbox.dwolla.com"
                : "api.dwolla.com";

        if (
            url.protocol !== "https:" ||
            url.host !== expectedHost ||
            url.username ||
            url.password ||
            url.search ||
            url.hash ||
            !/^\/transfers\/[a-f0-9-]{36}$/i.test(
                url.pathname
            )
        ) {
            throw new Error("Invalid Dwolla transfer URL.");
        }

        const response = await dwollaClient.get(
            url.pathname.slice(1)
        );

        const status = response.body.status;

        const validStatuses = [
            "pending",
            "processed",
            "failed",
            "cancelled",
        ];

        if (!validStatuses.includes(status)) {
            return null;
        }

        return status;

    } catch (error) {
        const dwollaError = error as DwollaError;

        console.error("Transfer status retrieval failed:", {
            code: dwollaError.body?.code,
        });

        return null;
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

        return await createFundingSource(
            fundingSourceOptions
        );

    } catch (error) {
        console.error("Adding funding source failed.");
        throw error;
    }
};