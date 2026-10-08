"use client";

import { HTMLAttributes, forwardRef } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "outlined" | "elevated";
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ variant = "elevated", className = "", children, ...rest }, ref) => {
    const classes = ["card", "card-static", variant === "outlined" && "card-outlined", className]
      .filter(Boolean)
      .join(" ");
    return <div ref={ref} className={classes} {...rest}>{children}</div>;
  },
);

Card.displayName = "Card";

export interface CardBodyProps extends HTMLAttributes<HTMLDivElement> {}

export const CardBody = forwardRef<HTMLDivElement, CardBodyProps>(
  ({ className = "", children, ...rest }, ref) => {
    return <div ref={ref} className={["card-body", className].filter(Boolean).join(" ")} {...rest}>{children}</div>;
  },
);

CardBody.displayName = "CardBody";

export interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {}

export const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className = "", children, ...rest }, ref) => {
    return <div ref={ref} className={["card-header", className].filter(Boolean).join(" ")} {...rest}>{children}</div>;
  },
);

CardHeader.displayName = "CardHeader";

export interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {}

export const CardFooter = forwardRef<HTMLDivElement, CardFooterProps>(
  ({ className = "", children, ...rest }, ref) => {
    return <div ref={ref} className={["card-footer", className].filter(Boolean).join(" ")} {...rest}>{children}</div>;
  },
);

CardFooter.displayName = "CardFooter";