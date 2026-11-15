import React, { useEffect, useState } from 'react';

interface AnimatedNumberProps {
  value: number | string | null | undefined;
  duration?: number; // ms, default 750ms for snappy, synchronous counting
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  duration = 750,
  decimals,
  prefix = '',
  suffix = '',
  className = '',
}) => {
  const parseValue = (val: any) => {
    if (val === null || val === undefined || val === '' || val === '—' || val === '-') {
      return { numeric: 0, hasDecimals: false, decimalCount: 0, detectedPrefix: '', detectedSuffix: '', isValid: false };
    }

    if (typeof val === 'number') {
      const str = val.toString();
      const parts = str.split('.');
      return {
        numeric: val,
        hasDecimals: parts.length > 1,
        decimalCount: decimals !== undefined ? decimals : (parts.length > 1 ? parts[1].length : 0),
        detectedPrefix: prefix,
        detectedSuffix: suffix,
        isValid: !isNaN(val),
      };
    }

    const str = String(val).trim();
    // Match prefix, number (with optional commas/decimals), and suffix (e.g. "98.2%", "220 units")
    const match = str.match(/^([^\d\.\-\+]*)([\-\+]?\d+(?:,\d+)*(?:\.\d+)?)(.*)$/);
    if (!match) {
      return { numeric: 0, hasDecimals: false, decimalCount: 0, detectedPrefix: '', detectedSuffix: '', isValid: false };
    }

    const cleanNum = match[2].replace(/,/g, '');
    const num = parseFloat(cleanNum);
    if (isNaN(num)) {
      return { numeric: 0, hasDecimals: false, decimalCount: 0, detectedPrefix: '', detectedSuffix: '', isValid: false };
    }

    const parts = match[2].split('.');
    const dCount = decimals !== undefined ? decimals : (parts.length > 1 ? parts[1].length : 0);

    return {
      numeric: num,
      hasDecimals: dCount > 0,
      decimalCount: dCount,
      detectedPrefix: prefix || match[1],
      detectedSuffix: suffix || match[3],
      isValid: true,
    };
  };

  const parsedInfo = parseValue(value);
  const [displayValue, setDisplayValue] = useState<number>(0);

  useEffect(() => {
    if (!parsedInfo.isValid) return;

    let startTimestamp: number | null = null;
    let animId: number;
    const endVal = parsedInfo.numeric;
    // Detect single-digit integers (0 to 9 without decimals) like 3, 4, 2, 1, 0.
    // In a standard linear/ease counter, small integers only have 2-4 discrete ticks,
    // causing them to finish in ~150-300ms and freeze while big numbers (like 226) spin rapidly for 750ms.
    // By using a high-speed ticker reel (2 full cycles of digits + targetEnd), small numbers
    // flip digits at the exact same ~30ms ticker speed and smoothly decelerate into the target integer
    // across the exact same full 750ms duration, perfectly synchronizing with big numbers!
    const isSingleDigitInt = !parsedInfo.hasDecimals && endVal >= 0 && endVal <= 9;
    const targetEnd = Math.floor(endVal);
    // 2 cycles (20 steps) + targetEnd ensures identical ~30ms ticker speed and lands cleanly on target
    const totalReelSteps = isSingleDigitInt ? 20 + targetEnd : 0;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const elapsed = timestamp - startTimestamp;
      const progress = Math.min(elapsed / duration, 1);

      if (isSingleDigitInt) {
        if (progress >= 1) {
          setDisplayValue(targetEnd);
          return;
        }
        // Smooth ease-out reel deceleration (power 1.6 prevents late freezing and eases gracefully into target)
        const ease = 1 - Math.pow(1 - progress, 1.6);
        const currentStep = Math.min(totalReelSteps, Math.floor(totalReelSteps * ease));
        const currentDigit = currentStep >= totalReelSteps ? targetEnd : (currentStep % 10);
        setDisplayValue(currentDigit);
      } else {
        // Standard large number or decimal counter with smooth ease-out curve
        const easeOut = 1 - Math.pow(1 - progress, 2.2);
        const current = endVal * easeOut;
        setDisplayValue(progress >= 1 ? endVal : current);
      }

      if (progress < 1) {
        animId = requestAnimationFrame(step);
      } else {
        setDisplayValue(endVal);
      }
    };

    animId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animId);
  }, [value, duration]);

  if (!parsedInfo.isValid) {
    return <span className={className}>{value != null ? String(value) : '—'}</span>;
  }

  const formattedNumber = displayValue.toLocaleString('en-US', {
    minimumFractionDigits: parsedInfo.decimalCount,
    maximumFractionDigits: parsedInfo.decimalCount,
  });

  return (
    <span className={className}>
      {parsedInfo.detectedPrefix}
      {formattedNumber}
      {parsedInfo.detectedSuffix}
    </span>
  );
};
