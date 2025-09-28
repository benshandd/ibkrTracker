"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function PortfolioSettingsPage() {
  const [flexToken, setFlexToken] = useState('')
  const [queryId, setQueryId] = useState('')
  const [baseCcy, setBaseCcy] = useState('USD')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch('/api/settings/ibkr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flexToken, queryId, baseCcy }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Failed to save')
      setMsg('Saved!')
    } catch (e: any) {
      setMsg(e?.message || 'Error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <h1 className="text-xl font-semibold">Portfolio Settings</h1>
      <form onSubmit={handleSave} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="baseCcy">Base Currency</Label>
          <Input id="baseCcy" value={baseCcy} onChange={(e) => setBaseCcy(e.target.value)} placeholder="USD" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="flexToken">IBKR Flex Token</Label>
          <Input id="flexToken" value={flexToken} onChange={(e) => setFlexToken(e.target.value)} placeholder="Paste your token" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="queryId">IBKR Flex Query ID</Label>
          <Input id="queryId" value={queryId} onChange={(e) => setQueryId(e.target.value)} placeholder="123456" />
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          {msg && <div className="text-sm text-muted-foreground">{msg}</div>}
        </div>
      </form>
    </main>
  )
}

