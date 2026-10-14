"use client";

import { type ReactNode } from "react";
import { Card, CardBody } from "./card";

export interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
}

/** One KPI card: caption label + semibold value (ink, never orange). */
export function StatCard({ label, value, icon }: StatCardProps) {
  return (
    <Card>
      <CardBody className="stat-new">
        <span className="stat-new-label">
          {icon ? (
            <span className="stat-new-ico" aria-hidden="true">
              {icon}
            </span>
          ) : null}
          {label}
        </span>
        <strong className="stat-new-value">{value}</strong>
      </CardBody>
    </Card>
  );
}
