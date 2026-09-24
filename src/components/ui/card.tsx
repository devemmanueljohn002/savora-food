import type { HTMLAttributes } from "react";

export function Card({ className = "", children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={["card", "card-static", className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </div>
  );
}

export function CardBody({ className = "", children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={["card-body", className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </div>
  );
}