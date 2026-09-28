'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { findAccount } from '@/lib/accounts';
import { signIn } from '@/lib/session';

export function LoginView() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const account = findAccount(email, password);
    if (!account) {
      setError('That email and password do not match an account.');
      return;
    }
    signIn(account.email, account.role);
    router.replace('/');
  }

  return (
    <div className="gate">
      <div className="gate-left">
        <div className="gate-logo">
          <span>FIF</span>
          <svg viewBox="0 0 120 22" aria-hidden="true"><path d="M2 4C26 19 74 21 118 9" /></svg>
        </div>

        <form className="gate-form" onSubmit={submit} noValidate>
          <h1 className="gate-h1"><i aria-hidden="true">✦</i>Welcome back</h1>

          <div className="gate-input">
            <input
              type="email" value={email} autoFocus autoComplete="email" placeholder="email"
              aria-label="Email" aria-invalid={!!error}
              onChange={(e) => { setEmail(e.target.value); setError(''); }}
            />
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="8" r="3.4" /><path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" />
            </svg>
          </div>

          <div className="gate-input">
            <input
              type="password" value={password} autoComplete="current-password" placeholder="password"
              aria-label="Password" aria-invalid={!!error}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
            />
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="7.5" r="3.2" /><path d="M12 10.7V19M12 15.4h3" />
            </svg>
          </div>

          <p className="gate-err" role="alert">{error}</p>

          <button className="gate-go" type="submit">Sign in</button>
        </form>
      </div>

      <div className="gate-right" aria-hidden="true">
        <Signal />
      </div>
    </div>
  );
}

/* Branch Signal, drawn rather than photographed: arcs spreading from one point, the way a
 * complaint spreads from one counter. Monotone, no second hue. */
function Signal() {
  /* Scattered with integer arithmetic only. Math.sin disagreed with itself in the last few
   * decimals between Node and V8, which React reported as a hydration mismatch on every star. */
  const stars = Array.from({ length: 78 }, (_, i) => {
    const h = (i * 2654435761) % 2147483647;
    return {
      x: h % 400,
      y: Math.floor(h / 400) % 330,
      r: i % 7 === 0 ? 1.8 : i % 3 === 0 ? 1.2 : 0.8,
      o: (16 + ((i * 37) % 60)) / 100,
    };
  });

  return (
    <svg className="gate-art" viewBox="0 0 400 420" role="img" aria-label="">
      <defs>
        <clipPath id="squircle">
          <path d="M200 4C342 4 396 58 396 200v20c0 142-54 196-196 196S4 362 4 220v-20C4 58 58 4 200 4Z" />
        </clipPath>
        <linearGradient id="field" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#18352F" /><stop offset="62%" stopColor="#102A27" />
          <stop offset="100%" stopColor="#0A211F" />
        </linearGradient>
        <radialGradient id="halo" cx="50%" cy="50%">
          <stop offset="0%" stopColor="#EAF7F6" stopOpacity=".34" />
          <stop offset="100%" stopColor="#EAF7F6" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g clipPath="url(#squircle)">
        <rect width="400" height="420" fill="url(#field)" />

        {stars.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#BEE9E6" opacity={s.o} />
        ))}

        {/* the mast the signal leaves from */}
        <path d="M300 34v300M300 58h58" stroke="#3E6A65" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        <circle cx="358" cy="58" r="5" fill="#7FA6A1" opacity=".8" />

        {[46, 92, 140, 190, 242, 296, 352].map((r, i) => (
          <circle key={r} cx="150" cy="300" r={r} fill="none" stroke="#53DBD5"
            strokeWidth={i < 2 ? 1.6 : 1.1} opacity={0.5 - i * 0.055} />
        ))}

        <circle cx="150" cy="300" r="96" fill="url(#halo)" />
        <circle cx="150" cy="300" r="34" fill="#F2FAF9" />

        <path d="M-20 336c84-34 150-18 232 14s136 36 208 6v84H-20Z" fill="#0D2624" />
        <path d="M-20 378c96-28 158-12 234 10s136 22 206 0v52H-20Z" fill="#17423D" opacity=".7" />
      </g>
    </svg>
  );
}
