import './globals.css'
import type { Metadata } from 'next'
import { Navbar } from '../components/navbar'

export const metadata: Metadata = {
  title: 'Floorplan Segmentation',
  description: 'Roboflow serverless inference demo',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet" />
      </head>
      <body style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Arial' }}>
        <Navbar />
        {children}
      </body>
    </html>
  )
}

