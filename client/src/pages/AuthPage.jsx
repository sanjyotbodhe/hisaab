import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button, Field, FormError } from '../components/ui.jsx';
import { useAuth } from '../lib/auth.jsx';

export default function AuthPage({ mode }) {
  const { login, register } = useAuth();
  const location = useLocation();
  const isLogin = mode === 'login';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);

  const clear = (key) => setErrors(({ [key]: _, ...rest }) => rest);

  async function submit(e) {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    const local = {};
    if (!isLogin && !name.trim()) local.name = 'Enter your name';
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) local.email = 'Enter a valid email address';
    if (!isLogin && password.length < 8) local.password = 'Use at least 8 characters';
    if (isLogin && !password) local.password = 'Enter your password';
    if (Object.keys(local).length) return setErrors(local);

    setBusy(true);
    try {
      if (isLogin) await login(email.trim(), password);
      else await register(name.trim(), email.trim(), password);
      // PublicOnly redirects to ?next= (e.g. back to an invite link) once the user is set.
    } catch (err) {
      setErrors(err.fieldErrors?.() ?? {});
      setFormError(err);
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <section className="auth-intro">
        <div className="brand brand-lg">
          <span className="brand-mark" aria-hidden="true">
            ₹
          </span>
          <span className="brand-name">Hisaab</span>
        </div>
        <p className="auth-lede">
          Shared expenses for flatmates, trips and friends, with the fewest payments to settle up.
        </p>
        <div className="ledger-demo" aria-hidden="true">
          <p className="hand">Goa trip, 4 people, 23 expenses</p>
          <p className="hand neg">Rohan pays Meera ₹2,140.00</p>
          <p className="hand neg">Kabir pays Meera ₹860.50</p>
          <p className="hand pos">All square in 2 payments, not 9.</p>
        </div>
        <ul className="feature-stickers" aria-label="What Hisaab does">
          <li className="sticker sticker-lemon">Split 4 ways: equal, exact, %, shares</li>
          <li className="sticker sticker-pink">Plan trips on a map</li>
          <li className="sticker sticker-mint">Pay by UPI or Razorpay</li>
          <li className="sticker sticker-sky">Rent adds itself monthly</li>
          <li className="sticker sticker-lilac">Insights on your spending</li>
        </ul>
      </section>

      <section className="auth-card">
        <h1>{isLogin ? 'Log in' : 'Create your account'}</h1>
        <form className="form" onSubmit={submit} noValidate>
          {!isLogin && (
            <Field label="Name" htmlFor="name" error={errors.name}>
              <input
                id="name"
                autoComplete="name"
                value={name}
                maxLength={50}
                onChange={(e) => {
                  setName(e.target.value);
                  clear('name');
                }}
              />
            </Field>
          )}
          <Field label="Email" htmlFor="email" error={errors.email}>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clear('email');
              }}
            />
          </Field>
          <Field
            label="Password"
            htmlFor="password"
            error={errors.password}
            hint={isLogin ? undefined : 'At least 8 characters'}
          >
            <input
              id="password"
              type="password"
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              value={password}
              maxLength={72}
              onChange={(e) => {
                setPassword(e.target.value);
                clear('password');
              }}
            />
          </Field>
          <FormError error={formError} />
          <Button type="submit" loading={busy} className="btn-primary btn-block">
            {isLogin ? 'Log in' : 'Create account'}
          </Button>
        </form>
        <p className="auth-switch">
          {isLogin ? 'New to Hisaab? ' : 'Already have an account? '}
          <Link to={`${isLogin ? '/register' : '/login'}${location.search}`}>
            {isLogin ? 'Create an account' : 'Log in'}
          </Link>
        </p>
      </section>
    </div>
  );
}
