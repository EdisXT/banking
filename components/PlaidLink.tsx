"use client";

import React, {
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";

import Image from "next/image";
import { Button } from "@/components/ui/button";

import {
    PlaidLinkOnSuccess,
    PlaidLinkOptions,
    usePlaidLink,
} from "react-plaid-link";

import { useRouter } from "next/navigation";

import {
    createLinkToken,
    createUpdateLinkToken,
    exchangePublicToken,
    refreshBankConnection,
} from "@/lib/actions/user.actions";

type LinkMode = "create" | "update";

const PlaidLink = ({ user, variant }: PlaidLinkProps) => {
    const router = useRouter();

    const [token, setToken] = useState("");
    const [error, setError] = useState("");
    const [mode, setMode] = useState<LinkMode>("create");
    const [isConnecting, setIsConnecting] = useState(false);
    const [shouldOpen, setShouldOpen] = useState(false);

    const openedToken = useRef<string | null>(null);

    const userId = user.$id;

    // Request a token only when a button is clicked
    const initializePlaid = async (selectedMode: LinkMode) => {
        setError("");
        setIsConnecting(true);
        setShouldOpen(false);
        setToken("");
        setMode(selectedMode);

        openedToken.current = null;

        try {
            const data =
                selectedMode === "update"
                    ? await createUpdateLinkToken({
                          $id: userId,
                      })
                    : await createLinkToken({
                          $id: userId,
                      });

            if (!data?.linkToken) {
                throw new Error(
                    selectedMode === "update"
                        ? "Unable to update existing bank."
                        : "Unable to create Plaid link token."
                );
            }

            setToken(data.linkToken);
            setShouldOpen(true);

            console.log(
                selectedMode === "update"
                    ? "Plaid update token received"
                    : "Plaid link token received"
            );
        } catch (error) {
            console.error("Plaid initialization failed:", error);

            setError(
                "Unable to initialize Plaid. Check the terminal."
            );

            setIsConnecting(false);
        }
    };

    const onSuccess = useCallback<PlaidLinkOnSuccess>(
        async (public_token: string | null) => {
            setIsConnecting(true);
            setError("");

            try {
                // Update existing bank connection
                if (mode === "update") {
                    const refreshed =
                        await refreshBankConnection();

                    if (!refreshed) {
                        throw new Error(
                            "Unable to refresh bank connection."
                        );
                    }

                    console.log(
                        "Plaid update mode completed successfully"
                    );
                } else {
                    // Create a new bank connection
                    if (!public_token) {
                        throw new Error(
                            "No public token received."
                        );
                    }

                    const result = await exchangePublicToken({
                        publicToken: public_token,
                        user: {
                            $id: userId,
                        },
                    });

                    if (
                        result?.publicTokenExchange !== "complete"
                    ) {
                        throw new Error(
                            "Bank connection failed."
                        );
                    }

                    console.log("Bank saved successfully");
                }

                router.push("/");
                router.refresh();

            } catch (error) {
                console.error("Bank connection failed:", error);

                setError(
                    "Unable to complete bank connection. Check the terminal."
                );

            } finally {
                setIsConnecting(false);
                setShouldOpen(false);
                setToken("");
            }
        },
        [mode, userId, router]
    );

    const config: PlaidLinkOptions = {
        token: token || null,
        onSuccess,

        onExit: () => {
            setIsConnecting(false);
            setShouldOpen(false);
            setToken("");
        },
    };

    const {
        open,
        ready,
        error: plaidError,
    } = usePlaidLink(config);

    // Automatically open Plaid when the token is ready
    useEffect(() => {
        if (
            ready &&
            token &&
            shouldOpen &&
            openedToken.current !== token
        ) {
            openedToken.current = token;

            setShouldOpen(false);

            open();
        }
    }, [ready, token, shouldOpen, open]);

    useEffect(() => {
        if (plaidError) {
            console.error("Plaid error:", plaidError);

            setError("Plaid failed to initialize.");
            setIsConnecting(false);
            setShouldOpen(false);
        }
    }, [plaidError]);

    return (
        <div className="flex flex-col gap-2">

            {variant === "primary" ? (
                <Button
                    type="button"
                    onClick={() => initializePlaid("create")}
                    disabled={isConnecting}
                    className="plaidlink-primary"
                >
                    {isConnecting
                        ? "Connecting..."
                        : "Connect Bank"}
                </Button>

            ) : variant === "ghost" ? (
                <Button
                    type="button"
                    variant="ghost"
                    onClick={() => initializePlaid("create")}
                    disabled={isConnecting}
                    className="plaidlink-ghost flex items-center gap-2"
                >
                    <Image
                        src="/icons/plus.svg"
                        width={20}
                        height={20}
                        alt="plus"
                    />

                    <span className="text-14 font-semibold text-gray-600">
                        {isConnecting
                            ? "Connecting..."
                            : "Add Bank"}
                    </span>
                </Button>

            ) : (
                <Button
                    type="button"
                    variant="ghost"
                    onClick={() => initializePlaid("create")}
                    disabled={isConnecting}
                    className="sidebar-link plaidlink-default h-auto w-full justify-start gap-3 bg-transparent shadow-none"
                >
                    <Image
                        src="/icons/connect-bank.svg"
                        alt="connect bank"
                        width={24}
                        height={24}
                    />

                    <span className="sidebar-label">
                        {isConnecting
                            ? "Connecting..."
                            : "Connect Bank"}
                    </span>
                </Button>
            )}

            {variant === "ghost" && (
                <Button
                    type="button"
                    variant="outline"
                    disabled={isConnecting}
                    onClick={() => initializePlaid("update")}
                    className="text-xs font-medium text-blue-600"
                >
                    Enable Transactions
                </Button>
            )}

            {error && (
                <p className="text-sm text-red-500">
                    {error}
                </p>
            )}
        </div>
    );
};

export default PlaidLink;