'use server';

import { redirect } from 'next/navigation';
import { authenticate, clearSession, setSession } from '@/lib/auth';
import { setFlashMessage } from '@/lib/flash';

export async function loginAction(formData: FormData) {
  const email = String(formData.get('email') || '');
  const password = String(formData.get('password') || '');

  const user = await authenticate(email, password);
  if (!user) {
    redirect('/login?error=1');
  }

  await setSession(user);
  await setFlashMessage({
    type: 'success',
    title: 'Accesso effettuato',
    message: 'Sessione avviata correttamente.'
  });
  redirect('/dashboard');
}

export async function logoutAction() {
  await clearSession();
  redirect('/login');
}
