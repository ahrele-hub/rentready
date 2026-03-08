export const metadata = {
  title: 'RentReady - Vehicle Rental',
  description: 'Reserve your ride',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,500;0,9..40,700;1,9..40,400&family=Playfair+Display:wght@600;800&display=swap" rel="stylesheet" />
      </head>
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
