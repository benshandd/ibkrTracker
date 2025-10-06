import { Html, Head, Main, NextScript } from 'next/document'

// Stub for Pages router Document to satisfy Next build in environments
// where the canary attempts to resolve '/_document'. Safe to keep alongside App Router.
export default function Document() {
  return (
    <Html lang="en">
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}

