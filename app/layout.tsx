import './globals.css';

export const metadata = { title: 'Hệ thống quản lý đồ vải', description: 'Quản lý đồ vải và vật tư bệnh viện' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body>{children}</body></html>;
}

