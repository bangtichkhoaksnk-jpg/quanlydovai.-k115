import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function Home() { redirect((await getSession()) ? '/dashboard' : '/login'); }
