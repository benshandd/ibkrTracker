export const dynamic = 'force-dynamic'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowRight, BarChart3, ShieldCheck, RefreshCcw, Wallet, Table, Zap, HelpCircle } from 'lucide-react'
import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Hero */}
      <section className="relative py-20 sm:py-24">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/5 to-transparent" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div>
              <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
                IBKR Tracker
              </h1>
              <p className="mt-4 text-lg text-muted-foreground">
                See your Interactive Brokers portfolio at a glance. Clean, real-time summaries of positions and cash in your base currency.
              </p>
              <div className="mt-8 flex gap-3">
                <Link href="/sign-up">
                  <Button size="lg" className="gap-2">
                    Get Started <ArrowRight className="h-5 w-5" />
                  </Button>
                </Link>
                <Link href="/sign-in">
                  <Button size="lg" variant="outline">Sign In</Button>
                </Link>
              </div>
              <div className="mt-4 text-xs text-muted-foreground">No fluff. Just your account value, positions, and cash—instantly.</div>
            </div>
            <div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">What you’ll see</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid sm:grid-cols-3 gap-4 text-sm">
                    <div className="p-3 rounded-md border bg-muted/30">
                      <div className="text-muted-foreground">Account Value</div>
                      <div className="text-2xl font-semibold">$123,456</div>
                    </div>
                    <div className="p-3 rounded-md border bg-muted/30">
                      <div className="text-muted-foreground">P/L Today</div>
                      <div className="text-2xl font-semibold text-green-600">+$842</div>
                    </div>
                    <div className="p-3 rounded-md border bg-muted/30">
                      <div className="text-muted-foreground">Cash</div>
                      <div className="text-2xl font-semibold">$22,732</div>
                    </div>
                  </div>
                  <div className="mt-4 grid sm:grid-cols-2 gap-3 text-sm">
                    <div className="flex items-center gap-2"><Table className="h-4 w-4" /> Open positions with live weights</div>
                    <div className="flex items-center gap-2"><Wallet className="h-4 w-4" /> Multi-currency cash, converted</div>
                    <div className="flex items-center gap-2"><BarChart3 className="h-4 w-4" /> P/L in base currency</div>
                    <div className="flex items-center gap-2"><RefreshCcw className="h-4 w-4" /> One-click refresh</div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Problem → Value */}
      <section className="py-16 border-t">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-10">
          <Card>
            <CardHeader>
              <CardTitle>Without IBKR Tracker</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground space-y-2">
              <p>Data scattered across reports. Manual FX conversions. Hard to see the big picture.</p>
              <p>Positions, cash, and P/L all live in different places and formats.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>With IBKR Tracker</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2"><Zap className="h-4 w-4 text-primary" /> Unified account value in your base currency</div>
              <div className="flex items-center gap-2"><Table className="h-4 w-4 text-primary" /> Clean, sortable positions table</div>
              <div className="flex items-center gap-2"><Wallet className="h-4 w-4 text-primary" /> Cash balances by currency with conversions</div>
              <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Secure by default — your data stays yours</div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Features */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-semibold tracking-tight">Features</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: Table, title: 'Positions Summary', desc: 'Ticker, cost, current, P/L and base weights.' },
              { icon: Wallet, title: 'Cash by Currency', desc: 'Per-currency balances and converted totals.' },
              { icon: RefreshCcw, title: 'On-demand Refresh', desc: 'Pull latest statement and prices with one click.' },
              { icon: BarChart3, title: 'Base Currency View', desc: 'Everything converted to your reporting currency.' },
              { icon: ShieldCheck, title: 'Secure', desc: 'Server-only secrets and strong auth.' },
              { icon: Zap, title: 'Fast UI', desc: 'Responsive, keyboard-friendly, and clean.' },
            ].map((f, i) => (
              <Card key={i}>
                <CardHeader className="flex-row items-center gap-3">
                  <f.icon className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">{f.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{f.desc}</CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 border-t">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-semibold tracking-tight">FAQ</h2>
          <div className="mt-6 space-y-3">
            {[
              { q: 'How do you get my data?', a: 'You connect your IBKR Flex query credentials. We fetch statements and derive positions and cash locally.' },
              { q: 'Which currencies are supported?', a: 'Any currency IBKR reports — values are converted using derived FX into your base.' },
              { q: 'Can I export?', a: 'Planned. For now, copy tables or use the API endpoints for your account.' },
            ].map((item, i) => (
              <Card key={i}>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2"><HelpCircle className="h-4 w-4" /> {item.q}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{item.a}</CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h3 className="text-2xl font-semibold">Start tracking with IBKR Tracker</h3>
          <p className="mt-2 text-muted-foreground">Create an account and connect your statement to see your full picture.</p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/sign-up"><Button size="lg">Create Account</Button></Link>
            <Link href="/sign-in"><Button size="lg" variant="outline">Sign In</Button></Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 text-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between text-muted-foreground">
          <div>© {new Date().getFullYear()} IBKR Tracker</div>
          <div className="flex items-center gap-4">
            <Link href="/sign-in" className="hover:underline">Sign In</Link>
            <Link href="/sign-up" className="hover:underline">Get Started</Link>
          </div>
        </div>
      </footer>
    </main>
  )
}
