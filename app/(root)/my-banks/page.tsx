import HeaderBox from '@/components/HeaderBox';
import BankCard from '@/components/BankCard';
import { getLoggedInUser } from '@/lib/actions/user.actions';
import { getAccounts } from '@/lib/actions/bank.actions';
import { redirect } from 'next/navigation';
import React from 'react';

const MyBanks = async () => {
  const loggedIn = await getLoggedInUser();

  if (!loggedIn) redirect('/sign-in');

  const accounts = await getAccounts({
    userId: loggedIn.$id,
  });

  const accountsData = accounts?.data ?? [];

  return (
    <section className="flex">
      <div className="my-banks">
        <HeaderBox
          title="My Bank Accounts"
          subtext="Effortlessly manage your banking activities."
        />

        <div className="space-y-4">
          <h2 className="header-2">Your cards</h2>

          <div className="flex flex-wrap gap-6">
            {accountsData.map((account: Account) => (
              <BankCard
                key={account.appwriteItemId}
                account={account}
                userName={loggedIn.firstName}
              />
            ))}

            {accountsData.length === 0 && (
              <p className="text-sm text-gray-500">
                No bank accounts connected yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default MyBanks;