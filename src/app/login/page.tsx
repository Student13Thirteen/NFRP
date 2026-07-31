import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { AppBrand, PoweredByNFRP } from '@/components/AppBrand';
import { getBranding } from '@/lib/branding';
import { loginAction } from './actions';

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = await searchParams;
  const [user, branding] = await Promise.all([getCurrentUser(), getBranding()]);
  if (user) redirect('/dashboard');

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <AppBrand branding={branding} variant="auth" />
        <form action={loginAction} className="form-stack">
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          {resolvedSearchParams.error ? <p className="form-error">Credenziali non valide.</p> : null}
          <button className="primary-button" type="submit">
            Accedi
          </button>
        </form>
      </section>
      <PoweredByNFRP />
    </main>
  );
}
