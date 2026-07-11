import { useEffect, useRef, useState } from "react";
import { IconCheck, IconCopy } from "./icons";

async function writeClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  throw new Error("Clipboard API not available");
}

/** Quiet copy affordance for code fences / tool output. */
export function CopyButton({
  text,
  className,
  label = "Copy",
}: {
  text: string;
  className?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onCopy = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!text || copied) return;
    try {
      await writeClipboard(text);
      setCopied(true);
      timer.current = window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* native select-to-copy still works if clipboard is blocked */
    }
  };

  return (
    <button
      type="button"
      className={`copy-btn${copied ? " is-copied" : ""}${className ? ` ${className}` : ""}`}
      onClick={onCopy}
      onMouseDown={(event) => event.stopPropagation()}
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
    >
      {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
    </button>
  );
}
