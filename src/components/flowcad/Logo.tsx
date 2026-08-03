import { Link } from "@tanstack/react-router";

export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  const dim = size === "lg" ? 34 : 26;
  return (
    <Link to="/" className="group flex items-center gap-2.5">
      <svg width={dim} height={dim} viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <rect
          x="1.5"
          y="1.5"
          width="29"
          height="29"
          rx="7"
          className="fill-panel-raised stroke-border"
          strokeWidth="1"
        />
        <path
          d="M8 21.5V10.5h9M8 16.2h7"
          className="stroke-teal"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <circle cx="23" cy="10.5" r="2.6" className="fill-primary" />
        <circle cx="23" cy="21.5" r="2.6" className="fill-teal" />
        <path d="M23 13.1v5.8" className="stroke-primary" strokeWidth="1.6" />
      </svg>
      <span className="text-[15px] font-semibold tracking-tight">
        Flow<span className="text-teal">CAD</span>
      </span>
    </Link>
  );
}
