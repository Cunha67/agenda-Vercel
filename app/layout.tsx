import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'MedAgenda | Gestão clínica',
  description: 'Gestão segura de pacientes, médicos, agendas e agendamentos para clínicas e consultórios.',
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f6f9fc',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
