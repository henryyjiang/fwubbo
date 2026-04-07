import React from "react";

const QUOTES = [
  { text: "The best way to predict the future is to invent it.", author: "Alan Kay" },
  { text: "Simplicity is the ultimate sophistication.", author: "Leonardo da Vinci" },
  { text: "Make it work, make it right, make it fast.", author: "Kent Beck" },
];

export function DemoQuoteWidget({ data: _data }: { data: Record<string, unknown> | null }) {
  const quote = QUOTES[Math.floor(Date.now() / 86400000) % QUOTES.length]; // rotate daily

  return (
    <div className="flex flex-col justify-center h-full gap-3">
      <blockquote className="text-lg font-display text-text-primary leading-relaxed italic">
        &ldquo;{quote.text}&rdquo;
      </blockquote>
      <p className="text-sm text-accent-primary font-body">— {quote.author}</p>
    </div>
  );
}
