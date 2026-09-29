import React from 'react';
import Image from 'next/image';

interface LogoProps {
  className?: string;
  height?: number;
  /** `dark` is the lockup with a white wordmark and tagline, for dark backgrounds. */
  tone?: 'light' | 'dark';
  /** Preload it: right for the header, wasted on a logo below the fold. */
  priority?: boolean;
}

const SOURCES = {
  light: '/Bharatfill-logo.png',
  dark: '/Bharatfill-logo-on-dark.png',
} as const;

export function BharatfillLogo({
  className = '',
  height = 80,
  tone = 'light',
  priority = true,
}: LogoProps) {
  return (
    <div className={`flex items-center shrink-0 ${className}`}>
      <Image
        src={SOURCES[tone]}
        alt="Bharatfill - Smart Assistance, Seamless Solutions."
        width={480}
        height={160}
        style={{ height: height, width: 'auto' }}
        className="object-contain object-left"
        priority={priority}
      />
    </div>
  );
}
