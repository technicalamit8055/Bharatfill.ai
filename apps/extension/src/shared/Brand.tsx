/**
 * Brand furniture and inline icons.
 *
 * The logo ships with the extension (apps/extension/public/icons, generated from
 * Assests/assistfill-logo.png) and is referenced through `chrome.runtime.getURL` so it resolves
 * in the popup, the side panel and any future surface. Icons are inline SVG rather than a font
 * or sprite sheet: MV3 forbids remotely hosted resources, and inlining keeps the bundle honest.
 */

import type { ReactNode } from 'react';

export const asset = (file: string): string =>
  typeof chrome !== 'undefined' && chrome.runtime?.getURL
    ? chrome.runtime.getURL(`icons/${file}`)
    : `icons/${file}`;

/** Full logo lockup — mark plus "Bharatfill.ai" and the tagline. */
export function Wordmark({ height = 36, className = '' }: { height?: number; className?: string }) {
  return (
    <img
      className={`brand-logo ${className}`.trim()}
      src={asset('wordmark.png')}
      alt="Bharatfill.ai"
      style={{ height, width: 'auto' }}
      draggable={false}
    />
  );
}

/** Just the rounded-square mark, for tight headers where the lockup would crowd. */
export function Mark({ size = 22, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      className={`brand-mark ${className}`.trim()}
      src={asset('icon-128.png')}
      alt=""
      style={{ height: size, width: size }}
      draggable={false}
    />
  );
}

/**
 * Header used by both surfaces. Renders the logo lockup and optional right-aligned metadata/badges.
 */
export function Header({ title, right }: { title?: string; right?: ReactNode }) {
  return (
    <header className="app-header">
      <div className="brand">
        {title ? (
          <>
            <Mark size={20} />
            <h1 className="truncate">{title}</h1>
          </>
        ) : (
          <Wordmark height={36} />
        )}
      </div>
      {right}
    </header>
  );
}

type IconProps = { size?: number; className?: string };

const svg = (size: number, className: string | undefined, children: ReactNode) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const SearchIcon = ({ size = 14, className }: IconProps) =>
  svg(size, className, [
    <circle key="c" cx="11" cy="11" r="7" />,
    <path key="l" d="m20 20-3.5-3.5" />,
  ]);

export const ShieldIcon = ({ size = 14, className }: IconProps) =>
  svg(size, className, [
    <path key="s" d="M12 3l7 3v6c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6l7-3Z" />,
    <path key="t" d="m9 12 2 2 4-4" />,
  ]);

export const CheckIcon = ({ size = 14, className }: IconProps) =>
  svg(size, className, <path d="m4 12 5 5L20 6" />);

export const AlertIcon = ({ size = 14, className }: IconProps) =>
  svg(size, className, [
    <circle key="c" cx="12" cy="12" r="9" />,
    <path key="l" d="M12 8v5" />,
    <path key="d" d="M12 16.5h.01" />,
  ]);

export const SparkIcon = ({ size = 14, className }: IconProps) =>
  svg(size, className, [
    <path key="a" d="M12 3v4M12 17v4M3 12h4M17 12h4" />,
    <path key="b" d="m6.3 6.3 2.5 2.5M15.2 15.2l2.5 2.5M17.7 6.3l-2.5 2.5M8.8 15.2l-2.5 2.5" />,
  ]);

export const ArrowIcon = ({ size = 14, className }: IconProps) =>
  svg(size, className, [<path key="l" d="M5 12h13" />, <path key="a" d="m13 6 6 6-6 6" />]);

export const PlugIcon = ({ size = 14, className }: IconProps) =>
  svg(size, className, [
    <path key="a" d="M9 3v6M15 3v6" />,
    <path key="b" d="M6 9h12v2a6 6 0 0 1-12 0V9Z" />,
    <path key="c" d="M12 17v4" />,
  ]);

export const ScanIcon = ({ size = 14, className }: IconProps) =>
  svg(size, className, [
    <path key="a" d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />,
    <path key="b" d="M8 12h8" />,
  ]);

export const ExternalIcon = ({ size = 14, className }: IconProps) =>
  svg(size, className, [
    <path key="a" d="M14 4h6v6" />,
    <path key="b" d="m20 4-8 8" />,
    <path key="c" d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />,
  ]);

export const DownloadIcon = ({ size = 14, className }: IconProps) =>
  svg(size, className, [
    <path key="a" d="M12 4v10" />,
    <path key="b" d="m8 11 4 4 4-4" />,
    <path key="c" d="M5 19h14" />,
  ]);

export const LinkIcon = ({ size = 14, className }: IconProps) =>
  svg(size, className, [
    <path key="a" d="M9 15 15 9" />,
    <path key="b" d="M11 6.5 12.3 5.2a3.5 3.5 0 0 1 5 5L16 11.5" />,
    <path key="c" d="M13 17.5 11.7 18.8a3.5 3.5 0 0 1-5-5L8 12.5" />,
  ]);

export const HelpIcon = ({ size = 14, className }: IconProps) =>
  svg(size, className, [
    <circle key="c" cx="12" cy="12" r="9" />,
    <path key="q" d="M9.5 9.3a2.6 2.6 0 0 1 5-.9c0 1.7-2 1.9-2.3 3.4" />,
    <path key="d" d="M12 16.8h.01" />,
  ]);

export const RefreshIcon = ({ size = 14, className }: IconProps) =>
  svg(size, className, [
    <path key="a" d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />,
    <path key="b" d="M21 3v5h-5" />,
    <path key="c" d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />,
    <path key="d" d="M3 21v-5h5" />,
  ]);

export const EyeIcon = ({ size = 14, className }: IconProps) =>
  svg(size, className, [
    <path key="a" d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />,
    <circle key="b" cx="12" cy="12" r="3" />,
  ]);

export const CloseIcon = ({ size = 14, className }: IconProps) =>
  svg(size, className, [<path key="a" d="M18 6 6 18" />, <path key="b" d="m6 6 12 12" />]);

export const ZoomInIcon = ({ size = 14, className }: IconProps) =>
  svg(size, className, [
    <circle key="c" cx="11" cy="11" r="7" />,
    <path key="l" d="m20 20-3.5-3.5" />,
    <path key="p" d="M11 8v6M8 11h6" />,
  ]);

export const ZoomOutIcon = ({ size = 14, className }: IconProps) =>
  svg(size, className, [
    <circle key="c" cx="11" cy="11" r="7" />,
    <path key="l" d="m20 20-3.5-3.5" />,
    <path key="p" d="M8 11h6" />,
  ]);

export const FileTextIcon = ({ size = 14, className }: IconProps) =>
  svg(size, className, [
    <path key="a" d="M14 3v4a1 1 0 0 0 1 1h4" />,
    <path key="b" d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />,
    <path key="c" d="M9 13h6M9 17h6M9 9h1" />,
  ]);

export const PaperclipIcon = ({ size = 14, className }: IconProps) =>
  svg(
    size,
    className,
    <path d="M20.5 12.5 12 21a5 5 0 0 1-7-7l8-8a3.5 3.5 0 0 1 5 5l-8 8a2 2 0 0 1-3-3l7-7" />,
  );

export const FolderIcon = ({ size = 14, className }: IconProps) =>
  svg(size, className, [
    <path key="a" d="M4 7a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z" />,
    <path key="b" d="M4 10h16" />,
  ]);

export const ImageIcon = ({ size = 14, className }: IconProps) =>
  svg(size, className, [
    <rect key="a" x="4" y="4" width="16" height="16" rx="2" />,
    <circle key="b" cx="9.5" cy="9.5" r="1.5" />,
    <path key="c" d="m5 17 4.5-4.5L13 16l2.5-2.5L19 17" />,
  ]);
