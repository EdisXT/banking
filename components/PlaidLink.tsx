'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
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
    const [error, setError] = useState('');
    const [isConnecting, setIsConnecting] = useState(false);

    useEffect(() => {
        const getLinkToken = async () => {
            try {
                console.log('Plaid component mounted');

                const data = await createLinkToken(user);

                if (!data?.linkToken) {
                    setError('Unable to create Plaid link token.');
                    return;
                }

                setToken(data.linkToken);
                setError('');

                console.log('Plaid token received');

            } catch (error) {
                console.error('Plaid initialization failed:', error);
                setError('Unable to initialize Plaid.');
            }
        };

        getLinkToken();
    }, [user]);

    const onSuccess = useCallback<PlaidLinkOnSuccess>(
        async (public_token: string | null) => {
            if (!public_token) {
                setError('No public token received.');
                return;
            }

            setIsConnecting(true);
            setError('');

            try {
                const result = await exchangePublicToken({
                    publicToken: public_token,
                    user,
                });

                if (result?.publicTokenExchange !== 'complete') {
                    throw new Error('Bank connection failed.');
                }

                console.log('Bank saved successfully');

                router.push('/');
                router.refresh();

            } catch (error) {
                console.error('Bank connection failed:', error);
                setError('Unable to save bank. Check the terminal.');

            } finally {
                setIsConnecting(false);
            }
        },
        [user, router]
    );

    const config: PlaidLinkOptions = {
        token,
        onSuccess,
    };

    const { open, ready, error: plaidError } = usePlaidLink(config);

    useEffect(() => {
        console.log('Plaid ready:', ready);

        if (plaidError) {
            console.error('Plaid error:', plaidError);
            setError('Plaid failed to initialize.');
        }
    }, [ready, plaidError]);

    return (
        <div className="flex flex-col gap-2">
            <Button
                type="button"
                variant={variant === 'ghost' ? 'ghost' : 'default'}
                onClick={() => {
                    console.log('Bank button clicked');
                    open();
                }}
                disabled={!ready || isConnecting}
                className={
                    variant === 'primary'
                        ? 'plaidlink-primary'
                        : 'flex gap-2'
                }
            >
                {variant === 'ghost' && (
                    <Image
                        src="/icons/plus.svg"
                        width={20}
                        height={20}
                        alt="plus"
                    />
                )}

                {isConnecting
                    ? 'Connecting...'
                    : !ready
                    ? 'Loading Plaid...'
                    : variant === 'ghost'
                    ? 'Add Bank'
                    : 'Connect Bank'}
            </Button>

            {error && (
                <p className="text-sm text-red-500">
                    {error}
                </p>
            )}
        </div>
    );
};

export default PlaidLink;