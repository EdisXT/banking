'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    PlaidLinkOnSuccess,
    PlaidLinkOptions,
    usePlaidLink,
} from 'react-plaid-link';
import { useRouter } from 'next/navigation';
import {
    createLinkToken,
    exchangePublicToken,
} from '@/lib/actions/user.actions';

const PlaidLink = ({ user, variant }: PlaidLinkProps) => {
    const router = useRouter();
    const [token, setToken] = useState('');

    useEffect(() => {
        const getLinkToken = async () => {
            const data = await createLinkToken(user);
            setToken(data?.linkToken ?? '');
        };

        getLinkToken();
    }, [user]);

    const onSuccess = useCallback<PlaidLinkOnSuccess>(
        async (public_token: string | null) => {
            if (!public_token) return;

            // Exchange public token
            const result = await exchangePublicToken({
                publicToken: public_token,
                user,
            });

            if (result?.publicTokenExchange === 'complete') {
                router.push('/');
            }
        },
        [user, router]
    );

    const config: PlaidLinkOptions = {
        token,
        onSuccess,
    };

    const { open, ready } = usePlaidLink(config);

    return (
        <>
            {variant === 'primary' ? (
                <Button
                    onClick={() => open()}
                    disabled={!ready}
                    className="plaidlink-primary"
                >
                    Connect Bank
                </Button>
            ) : variant === 'ghost' ? (
                <Button>
                    Connect Bank
                </Button>
            ) : (
                <Button>
                    Connect Bank
                </Button>
            )}
        </>
    );
};

export default PlaidLink;