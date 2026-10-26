import type { SVGProps } from "react";

export function BlackHoleIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d="M 3 12 C 3 5, 7 2, 12 2 C 17 2, 21 5, 21 12" />
      <path d="M 5.5 12 C 5.5 16.5, 8.5 19.5, 12 19.5 C 15.5 19.5, 18.5 16.5, 18.5 12" />
      <circle cx="12" cy="12" r="4" />
      <path d="M 1.5 12 H 8 Q 12 13.5 16 12 H 22.5" />
    </svg>
  );
}
