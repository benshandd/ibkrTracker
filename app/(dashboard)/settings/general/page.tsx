'use client';

import { useActionState, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { updateAccount } from '@/app/(login)/actions';
import { User } from '@/lib/db/schema';
import useSWR from 'swr';
import { Suspense } from 'react';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type ActionState = {
  name?: string;
  error?: string;
  success?: string;
};

type AccountFormProps = {
  state: ActionState;
  nameValue?: string;
  emailValue?: string;
};

function AccountForm({
  state,
  nameValue = '',
  emailValue = ''
}: AccountFormProps) {
  return (
    <>
      <div>
        <Label htmlFor="name" className="mb-2">
          Name
        </Label>
        <Input
          id="name"
          name="name"
          placeholder="Enter your name"
          defaultValue={state.name || nameValue}
          required
        />
      </div>
      <div>
        <Label htmlFor="email" className="mb-2">
          Email
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="Enter your email"
          defaultValue={emailValue}
          required
        />
      </div>
    </>
  );
}

function AccountFormWithData({ state }: { state: ActionState }) {
  const { data: user } = useSWR<User>('/api/user', fetcher);
  return (
    <AccountForm
      state={state}
      nameValue={user?.name ?? ''}
      emailValue={user?.email ?? ''}
    />
  );
}

export default function GeneralPage() {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    updateAccount,
    {}
  );
  const { data: user } = useSWR<User>('/api/user', fetcher);

  // IBKR/Portfolio settings state
  const [flexToken, setFlexToken] = useState('');
  const [queryId, setQueryId] = useState('');
  const [baseCcy, setBaseCcy] = useState('USD');
  const [savingIbkr, setSavingIbkr] = useState(false);
  const [ibkrMsg, setIbkrMsg] = useState<string | null>(null);

  useEffect(() => {
    if (user?.baseCcy) setBaseCcy(user.baseCcy);
  }, [user?.baseCcy]);

  async function handleSaveIbkr(e: React.FormEvent) {
    e.preventDefault();
    setSavingIbkr(true);
    setIbkrMsg(null);
    try {
      const res = await fetch('/api/settings/ibkr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flexToken, queryId, baseCcy }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to save');
      setIbkrMsg('Saved!');
    } catch (e: any) {
      setIbkrMsg(e?.message || 'Error');
    } finally {
      setSavingIbkr(false);
    }
  }

  return (
    <section className="flex-1 p-4 lg:p-8">
      <h1 className="text-lg lg:text-2xl font-medium text-gray-900 mb-6">
        General Settings
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>Account Information</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" action={formAction}>
            <Suspense fallback={<AccountForm state={state} />}>
              <AccountFormWithData state={state} />
            </Suspense>
            {state.error && (
              <p className="text-red-500 text-sm">{state.error}</p>
            )}
            {state.success && (
              <p className="text-green-500 text-sm">{state.success}</p>
            )}
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Portfolio Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveIbkr} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="baseCcy">Base Currency</Label>
              <Input
                id="baseCcy"
                value={baseCcy}
                onChange={(e) => setBaseCcy(e.target.value)}
                placeholder="USD"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="flexToken">IBKR Flex Token</Label>
              <Input
                id="flexToken"
                value={flexToken}
                onChange={(e) => setFlexToken(e.target.value)}
                placeholder="Paste your token"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="queryId">IBKR Flex Query ID</Label>
              <Input
                id="queryId"
                value={queryId}
                onChange={(e) => setQueryId(e.target.value)}
                placeholder="123456"
              />
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={savingIbkr}>
                {savingIbkr ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save'
                )}
              </Button>
              {ibkrMsg && (
                <div className="text-sm text-muted-foreground">{ibkrMsg}</div>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
