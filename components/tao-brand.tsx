/** Deterministic SVG geometry keeps the identity crisp at any screen size. */
export function TaoMark({ className = "", animated = false }: { className?: string; animated?: boolean }) {
  return (
    <svg viewBox="0 0 240 240" fill="none" aria-hidden="true" className={className}>
      <g className={animated ? "tao-orbit" : undefined}>
        {Array.from({ length: 9 }, (_, ring) => {
          const rotation = ring * 20;
          const color = ring < 5 ? "#ff2828" : "#949494";
          return (
            <g key={ring} transform={`rotate(${rotation} 120 120)`} stroke={color}>
              <ellipse cx="120" cy="120" rx="102" ry="59" strokeWidth="0.85" opacity="0.75" />
              {[0, 72, 144, 216, 288].map((angle, i) => {
                const radians = angle * Math.PI / 180;
                return <circle key={angle} cx={120 + 102 * Math.cos(radians)} cy={120 + 59 * Math.sin(radians)} r={i === 0 ? 3.8 : 1.8} fill={color} stroke="none" />;
              })}
            </g>
          );
        })}
        <circle cx="120" cy="120" r="47" fill="#050505" />
      </g>
    </svg>
  );
}

export function TaoBrand({ large = false, animated = false }: { large?: boolean; animated?: boolean }) {
  return (
    <div className={large ? "flex flex-col items-center gap-5 sm:flex-row sm:gap-7" : "flex items-center gap-2"}>
      <TaoMark animated={animated} className={large ? "size-44 shrink-0 sm:size-60" : "size-9 shrink-0"} />
      <div>
        <div className={large ? "whitespace-nowrap font-display text-5xl tracking-tight text-white sm:text-6xl" : "whitespace-nowrap font-display text-lg tracking-tight text-white"}>
          <span className="font-bold">TAO</span>{" "}<span className="font-light text-mint-400">OS</span>
        </div>
        {large && <p className="mt-3 text-center text-[10px] uppercase tracking-[0.18em] text-navy-800/80 sm:text-left">Talent Acquisition Open OS</p>}
      </div>
    </div>
  );
}
