import HeaderBox from '@/components/HeaderBox';
import PaymentTransferForm from '@/components/PaymentTransferForm';
import { getAccounts } from '@/lib/actions/bank.actions';
import { getLoggedInUser } from '@/lib/actions/user.actions';
import { redirect } from 'next/navigation';
import React from 'react';

const Transfer = async () => {
    const loggedIn = await getLoggedInUser();

    if (!loggedIn) redirect('/sign-in');

    const accounts = await getAccounts({
        userId: loggedIn.$id,
    });

    const accountsData = accounts?.data ?? [];

    return (
        <section className="payment-transfer">
            <HeaderBox
                title="Payment Transfer"
                subtext="Please provide any specific details or notes related to the payment transfer"
            />

            <section className="size-full pt-5">
                {accountsData.length > 0 ? (
                    <PaymentTransferForm accounts={accountsData} />
                ) : (
                    <p className="text-14 text-gray-600">
                        Please connect a bank account first.
                    </p>
                )}
            </section>
        </section>
    );
};

export default Transfer;