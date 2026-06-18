import './globals.css'

export const metadata = {
  title: 'ScolaDesk — Central Admin',
  description: 'Panneau d\'administration central ScolaDesk',
}

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-steel-50 text-steel-900 antialiased">
        {children}
      </body>
    </html>
  )
}
