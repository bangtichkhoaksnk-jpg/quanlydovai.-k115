import { db } from '@/lib/supabase';
import { requireSession } from '@/lib/auth';
import { fail, ok } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await requireSession();
    const s = db();
    const [settings, departments, staff, items, packages, packageItems, patients, stock, transactions, losses, issues, collections, inventories] = await Promise.all([
      s.from('settings').select('*').order('key'),
      s.from('departments').select('*').order('sort_order'),
      s.from('staff').select('*').order('full_name'),
      s.from('catalog_items').select('*').order('sort_order'),
      s.from('issue_packages').select('*').order('sort_order'),
      s.from('issue_package_items').select('*'),
      s.from('patients').select('*,departments(name)').order('created_at', { ascending: false }),
      s.from('warehouse_stock').select('*,catalog_items(*)').order('updated_at', { ascending: false }),
      s.from('warehouse_transactions').select('*,catalog_items(name,code,unit,item_type),patients(medical_code,full_name)').order('created_at', { ascending: false }).limit(300),
      s.from('losses').select('*,patients(medical_code,full_name),catalog_items(name,code,unit)').order('loss_date', { ascending: false }).limit(500),
      s.from('issue_slips').select('*,patients(medical_code,full_name,departments(name)),issue_items(*,catalog_items(*))').order('created_at', { ascending: false }).limit(500),
      s.from('collections').select('*,collection_items(*,catalog_items(*))').order('created_at',{ascending:false}).limit(500),
      s.from('inventories').select('*,departments(name),inventory_items(*)').order('inventory_time',{ascending:false}).limit(500)
    ]);
    const errors = [settings, departments, staff, items, packages, packageItems, patients, stock, transactions, losses, issues, collections, inventories].map(x => x.error).filter(Boolean);
    if (errors.length) throw errors[0];
    const activePatients = (patients.data || []).filter((p: any) => p.status === 'ACTIVE');
    const stockRows: any[] = stock.data || [];
    const summary = {
      activePatients: activePatients.length,
      totalLinen: stockRows.filter((r: any) => r.catalog_items?.item_type === 'LINEN').reduce((a: number, r: any) => a + Number(r.quantity), 0),
      totalSupply: stockRows.filter((r: any) => r.catalog_items?.item_type === 'SUPPLY').reduce((a: number, r: any) => a + Number(r.quantity), 0),
      lowCount: stockRows.filter((r: any) => Number(r.quantity) <= Number(r.warning_level)).length,
      outCount: stockRows.filter((r: any) => Number(r.quantity) <= 0).length
    };
    return ok({ session, settings: settings.data, departments: departments.data, staff: staff.data, items: items.data, packages: packages.data, packageItems: packageItems.data, patients: patients.data, stock: stockRows, transactions: transactions.data, losses: losses.data, issues: issues.data, collections: collections.data, inventories: inventories.data, summary });
  } catch (error) { return fail(error); }
}
