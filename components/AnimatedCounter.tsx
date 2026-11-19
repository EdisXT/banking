
"use client";

import CountUp from "react-countup";

const AnimatedCounter = ({ amount }: { amount: number }) => {
  return (
    <span>
      <CountUp
        duration={2.75}
        decimals={2}
        decimal="."
        separator=","
        prefix="$"
        end={amount}
      />
    </span>
  );
};

export default AnimatedCounter;
