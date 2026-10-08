"use client";

import Link from "next/link";
import { Home, AlertTriangle } from "lucide-react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  console.error("[Global error]", error);

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Error | Savora Food</title>
        <style jsx>{`
          body { margin: 0; font-family: Arial, Helvetica, sans-serif; background: #faf8f4; color: #302b27; }
          .container { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 20px; text-align: center; }
          h1 { margin: 16px 0 8px; font-size: 28px; }
          p { color: #716b65; margin: 0 0 24px; max-width: 400px; }
          .btn { display: inline-flex; align-items: center; gap: 8px; padding: 12px 24px; border-radius: 12px; font-weight: 700; text-decoration: none; cursor: pointer; }
          .btn-primary { background: #ff6500; color: white; }
          .btn-secondary { background: white; color: #302b27; border: 1px solid #e6ddd3; }
          .icon { font-size: 40px; color: #c0392b; margin-bottom: 16px; }
        `}</style>
      </head>
      <body>
        <div className="container">
          <AlertTriangle className="icon" aria-hidden="true" />
          <h1>Something went wrong</h1>
          <p>An unexpected server error occurred. Our team has been notified.</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button className="btn btn-primary" onClick={() => reset()}>Try again</button>
            <Link className="btn btn-secondary" href="/">Home</Link>
          </div>
        </div>
      </body>
    </html>
  );
}