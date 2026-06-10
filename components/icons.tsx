import type { ComponentProps } from "react";

// Duotone line icons — DESIGN.md §5. 24×24 grid, 1.75px stroke, round caps,
// one closed shape filled mint-400 at 22% as the "highlight". Inline SVG,
// aria-hidden with adjacent text labels.

type IconProps = ComponentProps<"svg"> & { size?: number };

function Svg({ size = 24, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={size >= 48 ? 1.5 : 1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

const mint = "rgba(91, 200, 168, 0.22)";
const amber = "rgba(226, 163, 60, 0.22)";

export function IconWorkflowNodes(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="6" height="6" rx="2" fill={mint} />
      <rect x="15" y="15" width="6" height="6" rx="2" />
      <circle cx="18" cy="6" r="3" />
      <path d="M9 6h6M6 9v6a3 3 0 0 0 3 3h6" />
    </Svg>
  );
}

export function IconDocumentCheck(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M6 3h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"
        fill={mint}
      />
      <path d="M14 3v4h4" />
      <path d="m9 14 2.2 2.2L15.5 12" />
    </Svg>
  );
}

export function IconClientsBuilding(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="6" width="10" height="15" rx="1.5" fill={mint} />
      <path d="M14 10h5a1 1 0 0 1 1 1v10" />
      <path d="M2 21h20" />
      <path d="M7.5 10h3M7.5 13.5h3M7.5 17h3M17 14h.01M17 17.5h.01" />
    </Svg>
  );
}

export function IconAiSpark(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M12 3.5c.9 4.4 3.1 6.6 7.5 7.5-4.4.9-6.6 3.1-7.5 7.5-.9-4.4-3.1-6.6-7.5-7.5 4.4-.9 6.6-3.1 7.5-7.5Z"
        fill={mint}
      />
      <path d="M19 16.5c.4 1.8 1.2 2.6 3 3-1.8.4-2.6 1.2-3 3-.4-1.8-1.2-2.6-3-3 1.8-.4 2.6-1.2 3-3Z" />
    </Svg>
  );
}

export function IconOpenSourceShield(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M12 3 5 5.5v6c0 4.4 2.9 7.6 7 9.5 4.1-1.9 7-5.1 7-9.5v-6L12 3Z"
        fill={mint}
      />
      <path d="M12 9.5a2.8 2.8 0 0 1 1 5.4l.6 2.1h-3.2l.6-2.1a2.8 2.8 0 0 1 1-5.4Z" />
    </Svg>
  );
}

export function IconIntegrationPlug(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M8 7h8v4a4 4 0 0 1-4 4 4 4 0 0 1-4-4V7Z"
        fill={mint}
      />
      <path d="M9.5 7V3.5M14.5 7V3.5M12 15v2.5a3 3 0 0 1-3 3H7" />
    </Svg>
  );
}

export function IconKey(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="14" r="4.5" fill={mint} />
      <circle cx="8" cy="14" r="1.4" />
      <path d="m11.5 10.5 8-8M16 5l3 3M13.5 7.5l2.5 2.5" />
    </Svg>
  );
}

export function IconDatabase(props: IconProps) {
  return (
    <Svg {...props}>
      <ellipse cx="12" cy="5.5" rx="7" ry="2.8" fill={mint} />
      <path d="M5 5.5v13c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-13" />
      <path d="M5 12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8" />
    </Svg>
  );
}

export function IconMagnet(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M6 4h4v8a2 2 0 0 0 4 0V4h4v8a6 6 0 0 1-12 0V4Z"
        fill={mint}
      />
      <path d="M6 7.5h4M14 7.5h4" />
    </Svg>
  );
}

export function IconEnvelope(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="5.5" width="18" height="13" rx="2" fill={mint} />
      <path d="m4 7.5 8 6 8-6" />
    </Svg>
  );
}

export function IconScorecard(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="3.5" width="16" height="17" rx="2" fill={mint} />
      <path d="M8 8h8M8 12h4" />
      <path d="m8.5 16.5 1.6 1.6 3-3" />
    </Svg>
  );
}

export function IconRocket(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M12 3.5c3.5 1.5 5.5 5 5.5 9l-2.5 2.5h-6L6.5 12.5c0-4 2-7.5 5.5-9Z"
        fill={mint}
      />
      <circle cx="12" cy="9.5" r="1.6" />
      <path d="M9 15v3.5l3-1.5 3 1.5V15M12 18.5V21" />
    </Svg>
  );
}

export function IconWarning(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M12 4 2.8 19.5a1 1 0 0 0 .9 1.5h16.6a1 1 0 0 0 .9-1.5L12 4Z"
        fill={amber}
      />
      <path d="M12 10v4.5M12 17.8h.01" />
    </Svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" fill={mint} />
      <path d="m8.5 12.2 2.4 2.4 4.8-5" />
    </Svg>
  );
}
