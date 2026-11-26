"use client";

import Image from "next/image";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
} from "@/components/ui/select";

import { formUrlQuery, formatAmount } from "@/lib/utils";

export const BankDropdown = ({
    accounts = [],
    setValue,
    otherStyles,
}: BankDropdownProps) => {
    const searchParams = useSearchParams();
    const router = useRouter();

    const urlBankId = searchParams.get("id");

    const [selectedId, setSelectedId] = useState(
        () =>
            accounts.find(
                (account) =>
                    account.appwriteItemId === urlBankId
            )?.appwriteItemId ??
            accounts[0]?.appwriteItemId ??
            ""
    );

    const selected =
        accounts.find(
            (account) =>
                account.appwriteItemId === selectedId
        ) ?? accounts[0];

    const activeId = selected?.appwriteItemId ?? "";

    useEffect(() => {
        if (setValue) {
            setValue("senderBank", activeId, {
                shouldValidate: true,
            });
        }
    }, [activeId, setValue]);

    const handleBankChange = (id: string | null) => {
        if (!id) return;

        const account = accounts.find(
            (account) => account.appwriteItemId === id
        );

        if (!account) return;

        setSelectedId(id);

        if (setValue) {
            setValue("senderBank", id, {
                shouldValidate: true,
                shouldDirty: true,
            });

            return;
        }

        const newUrl = formUrlQuery({
            params: searchParams.toString(),
            key: "id",
            value: id,
        });

        router.push(newUrl, { scroll: false });
    };

    return (
        <Select
            value={activeId}
            onValueChange={handleBankChange}
        >
            <SelectTrigger
                className={`flex w-full gap-3 bg-white md:w-[300px] ${
                    otherStyles ?? ""
                }`}
            >
                <Image
                    src="/icons/credit-card.svg"
                    width={20}
                    height={20}
                    alt="account"
                />

                <p className="line-clamp-1 w-full text-left">
                    {selected
                        ? `${selected.name} •••• ${selected.mask}`
                        : "Select a bank"}
                </p>
            </SelectTrigger>

            <SelectContent
                className={`w-full bg-white md:w-[300px] ${
                    otherStyles ?? ""
                }`}
                align="end"
            >
                <SelectGroup>
                    <SelectLabel className="py-2 font-normal text-gray-500">
                        Select a bank to display
                    </SelectLabel>

                    {accounts.map((account: Account) => (
                        <SelectItem
                            key={account.appwriteItemId}
                            value={account.appwriteItemId}
                            className="cursor-pointer border-t"
                        >
                            <div className="flex flex-col">
                                <p className="text-16 font-medium">
                                    {account.name} •••• {account.mask}
                                </p>

                                <p className="text-14 font-medium text-blue-600">
                                    {formatAmount(
                                        account.currentBalance
                                    )}
                                </p>
                            </div>
                        </SelectItem>
                    ))}
                </SelectGroup>
            </SelectContent>
        </Select>
    );
};