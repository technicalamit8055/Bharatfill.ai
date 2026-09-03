type IconProps = { className?: string };

const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export function FormIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  );
}

export function UsersIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M16 6.5c1.5.3 2.5 1.6 2.5 3.1 0 1.4-.9 2.7-2.2 3.1" />
      <path d="M21 20c0-2.5-1.6-4.6-3.8-5.4" />
    </svg>
  );
}

export function DocumentIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h6" />
    </svg>
  );
}

export function ClipboardIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
      <path d="M9 11h6M9 15h4" />
    </svg>
  );
}

export function AlertIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5" />
      <path d="M12 16.5h.01" />
    </svg>
  );
}

export function ClockIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function UploadIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

export function PlayIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M10.5 8.5v7l6-3.5Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function SearchIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

export function CameraIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 8h2.5l1.3-2h8.4L17.5 8H20a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </svg>
  );
}

/** A signature stroke — the crop/clean-up tool. */
export function SignatureIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 16c2.5 0 3.3-9 5.5-9S10 15 12 15s2-4.5 3.5-4.5S17 14 21 12" />
      <path d="M4 20h16" />
    </svg>
  );
}

export function PdfIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9Z" />
      <path d="M13 3v6h6" />
      <path d="M9 13.5h1.5a1 1 0 0 1 0 2H9v2.5M14.5 18v-4.5h1.6" />
    </svg>
  );
}

export function IdCardIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <circle cx="8.5" cy="11" r="2" />
      <path d="M5.5 16c0-1.5 1.3-2.5 3-2.5s3 1 3 2.5" />
      <path d="M14.5 10h4M14.5 13.5h4" />
    </svg>
  );
}

export function GridIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.2" />
    </svg>
  );
}

/** Concentric sweep — the schemes opportunity radar. */
export function RadarIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M19.1 6.4A9 9 0 1 0 12 21a9 9 0 0 0 8.9-7.6" />
      <path d="M15.6 9.9A5 5 0 1 0 12 17" />
      <path d="M12 12 20.5 4" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function TrendUpIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3.5 17 10 10.5l3.5 3.5L20.5 7" />
      <path d="M15.5 7h5v5" />
    </svg>
  );
}

export function TrendDownIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3.5 7 10 13.5l3.5-3.5L20.5 17" />
      <path d="M15.5 17h5v-5" />
    </svg>
  );
}

export function PhoneIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M6.5 3h2.2l1.5 4-2 1.4a11 11 0 0 0 5.4 5.4l1.4-2 4 1.5v2.2a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 4.5 5.2 2 2 0 0 1 6.5 3Z" />
    </svg>
  );
}

/**
 * WhatsApp's outline glyph. Drawn here rather than pulled from a brand asset pack: the shape is
 * generic enough to read as "chat on WhatsApp" without shipping someone else's logo file.
 */
export function WhatsappIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3.5 20.5l1.3-3.8A8 8 0 1 1 12 20a8 8 0 0 1-3.9-1l-4.6 1.5Z" />
      <path d="M9 9c0 3 2 5 5 5 1 0 1.5-.6 1.5-1.2 0-.3-1.6-1.2-1.9-1.1-.3.1-.5.7-.8.7-.6 0-2.2-1.6-2.2-2.2 0-.3.6-.5.7-.8.1-.3-.8-1.9-1.1-1.9C9.6 7.5 9 8 9 9Z" />
    </svg>
  );
}

export function ExtensionIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M10 4.5a1.8 1.8 0 0 1 3.6 0V6h2.9a1 1 0 0 1 1 1v3h1.2a1.8 1.8 0 0 1 0 3.6H17.5v3.9a1 1 0 0 1-1 1H7.5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1H10Z" />
    </svg>
  );
}

export function CalendarIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3.5" y="5" width="17" height="16" rx="2" />
      <path d="M3.5 10h17M8 3v3.5M16 3v3.5" />
    </svg>
  );
}

export function SparkIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z" />
      <path d="M18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7Z" />
    </svg>
  );
}

export function KeyboardIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M6 9.5h.01M9.5 9.5h.01M13 9.5h.01M16.5 9.5h.01M6 12.8h.01M9.5 12.8h.01M13 12.8h.01M16.5 12.8h.01M8 15.5h8" />
    </svg>
  );
}

export function ArrowRightIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4.5 12h15M14 6.5l5.5 5.5L14 17.5" />
    </svg>
  );
}

export function EyeIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/**
 * A QR code, drawn as three finder squares and a scatter of modules.
 *
 * Not a real encoding — a recognisable glyph. The scannable article is generated by
 * lib/document-drop/qr.ts.
 */
export function QrIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM19.5 14v.01M14 19.5v.01M19.5 19.5v.01" />
    </svg>
  );
}

/** A phone with an upward arrow: the citizen sending a document from their own handset. */
export function PhoneUploadIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <path d="M10.5 19h3" />
      <path d="M12 13.5V8m0 0-2 2m2-2 2 2" />
    </svg>
  );
}

/** An inbox tray, for the walk-in queue waiting to be claimed. */
export function InboxIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 13.5 5.5 5A2 2 0 0 1 7.4 3.5h9.2A2 2 0 0 1 18.5 5L21 13.5" />
      <path d="M3 13.5h4l1.2 2.2h7.6L17 13.5h4v4A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5Z" />
    </svg>
  );
}
