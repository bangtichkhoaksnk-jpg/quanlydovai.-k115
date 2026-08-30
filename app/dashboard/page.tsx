import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import DashboardApp from '@/components/DashboardApp';

export const dynamic = 'force-dynamic';

export default async function DashboardPage(){if(!(await getSession()))redirect('/login');return <DashboardApp/>}
