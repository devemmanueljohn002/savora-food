"use client";

import { useState, type FormEvent } from "react";

export default function NewsletterJoin() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) return;
    setDone(true);
  }

  if (done) {
    return <div className="newsletter-done">✓ Subscribed</div>;
  }

  return (
    <form className="newsletter-form" onSubmit={submit} aria-label="Newsletter signup">
      <input
        className="newsletter-input"
        placeholder="you@email.com"
        aria-label="Email address"
        type="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <button className="newsletter-btn" type="submit">
        Join
      </button>
    </form>
  );
}
