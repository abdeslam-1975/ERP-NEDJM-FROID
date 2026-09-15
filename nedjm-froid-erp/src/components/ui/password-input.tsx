"use client";

import { useState, type InputHTMLAttributes } from "react";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  wrapperClassName?: string;
};

export function PasswordInput({
  className = "",
  wrapperClassName = "",
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const label = visible
    ? "Masquer le mot de passe · إخفاء"
    : "Afficher le mot de passe · إظهار";

  return (
    <div className={`relative ${wrapperClassName}`}>
      <input
        {...props}
        type={visible ? "text" : "password"}
        className={`pe-11 ${className}`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={label}
        title={label}
        className="absolute end-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-foreground/60 hover:bg-brand-muted hover:text-foreground"
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a3 3 0 0 0 4.2 4.2" />
      <path d="M9.9 5.1A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a18.6 18.6 0 0 1-3.2 3.8" />
      <path d="M6.1 6.1C3.6 7.8 2 12 2 12s3.5 7 10 7a10.7 10.7 0 0 0 4.4-.9" />
    </svg>
  );
}
