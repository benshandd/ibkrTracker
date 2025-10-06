'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { CircleIcon, Loader2 } from 'lucide-react';
import { signIn, signUp } from './actions';
import { ActionState } from '@/lib/auth/middleware';

export function Login({ mode = 'signin' }: { mode?: 'signin' | 'signup' }) {
  const searchParams = useSearchParams();
  const redirect = searchParams?.get('redirect') ?? '';
  const priceId = searchParams?.get('priceId') ?? '';
  const inviteId = searchParams?.get('inviteId') ?? '';
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    mode === 'signin' ? signIn : signUp,
    { error: '' }
  );

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center">

          <CardTitle className="mt-2 text-center">
            {mode === 'signin' ? 'Sign in to your account' : 'Create your account'}
          </CardTitle>
        </CardHeader>
        <CardContent>
        <form className="space-y-4" action={formAction}>
          <input type="hidden" name="redirect" value={redirect} />
          <input type="hidden" name="priceId" value={priceId} />
          <input type="hidden" name="inviteId" value={inviteId} />
          <div>
            <Label
              htmlFor="email"
              className="block text-sm font-medium"
            >
              Email
            </Label>
            <div className="mt-1">
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                defaultValue={state.email}
                required
                maxLength={50}
                placeholder="Enter your email"
              />
            </div>
          </div>

          <div>
            <Label
              htmlFor="password"
              className="block text-sm font-medium"
            >
              Password
            </Label>
            <div className="mt-1">
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete={
                  mode === 'signin' ? 'current-password' : 'new-password'
                }
                required
                minLength={8}
                maxLength={100}
                placeholder="Enter your password"
              />
            </div>
          </div>

          {state?.error && (
            <div className="text-destructive text-sm">{state.error}</div>
          )}

          <div>
            <Button
              type="submit"
              className="w-full flex justify-center items-center gap-2"
              disabled={pending}
            >
              {pending ? (
                <>
                  <Loader2 className="animate-spin mr-2 h-4 w-4" />
                  Loading...
                </>
              ) : mode === 'signin' ? (
                'Sign in'
              ) : (
                'Sign up'
              )}
            </Button>
          </div>
        </form>
        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-background text-muted-foreground">
                {mode === 'signin' ? 'New to IBKR Tracker?' : 'Already have an account?'}
              </span>
            </div>
          </div>

          <div className="mt-6">
            <Link
              href={`${mode === 'signin' ? '/sign-up' : '/sign-in'}${
                redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''
              }${priceId ? `${redirect ? '&' : '?'}priceId=${encodeURIComponent(priceId)}` : ''}`}
              className="w-full inline-flex justify-center py-2 px-4 border rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground border-input"
            >
              {mode === 'signin' ? 'Create an account' : 'Sign in to existing account'}
            </Link>
          </div>
        </div>
        </CardContent>
      </Card>
    </div>
  );
}
