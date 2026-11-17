'use client';

import { useState, type InputHTMLAttributes } from 'react';
import styles from './AuthShell.module.css';

const MailIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 6h16v12H4V6Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const LockIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M7 11V8a5 5 0 0 1 10 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M6 11h12v9H6v-9Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  </svg>
);

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  id: string;
  invalid?: boolean;
}

export function EmailField({ label, id, invalid, ...input }: FieldProps) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>{label}</label>
      <div className={`${styles.inputWrap} ${invalid ? styles.invalid : ''}`}>
        <span className={styles.icon}>{MailIcon}</span>
        <input id={id} type="email" autoComplete="email" maxLength={255} className={styles.input} {...input} />
      </div>
    </div>
  );
}

export function PasswordField({ label, id, invalid, ...input }: FieldProps) {
  const [show, setShow] = useState(false);
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>{label}</label>
      <div className={`${styles.inputWrap} ${invalid ? styles.invalid : ''}`}>
        <span className={styles.icon}>{LockIcon}</span>
        <input id={id} type={show ? 'text' : 'password'} maxLength={128} className={styles.input} {...input} />
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setShow((v) => !v)}
          aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-pressed={show}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
            {show && <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
          </svg>
        </button>
      </div>
    </div>
  );
}

export const PASSWORD_RULES = (value: string) => [
  { label: 'Mínimo 8 caracteres', valid: value.length >= 8 },
  { label: 'Una mayúscula', valid: /[A-Z]/.test(value) },
  { label: 'Una minúscula', valid: /[a-z]/.test(value) },
  { label: 'Un número', valid: /[0-9]/.test(value) },
  { label: 'Un carácter especial', valid: /[^\p{L}\p{N}\s]/u.test(value) },
];

export function PasswordRules({ value }: { value: string }) {
  return (
    <ul className={styles.rules} aria-label="Requisitos de la contraseña">
      {PASSWORD_RULES(value).map((r) => (
        <li key={r.label} className={`${styles.rule} ${r.valid ? styles.ruleOk : ''}`}>
          {r.label}
          <span className="sr-only">{r.valid ? ' (cumplido)' : ' (pendiente)'}</span>
        </li>
      ))}
    </ul>
  );
}
