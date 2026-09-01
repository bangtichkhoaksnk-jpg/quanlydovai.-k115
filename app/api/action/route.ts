import { hash } from 'bcryptjs';
import { after } from 'next/server';
import { db } from '@/lib/supabase';
import { createClient as createUserClient } from '@/lib/supabase/server';
import { requireSession } from '@/lib/auth';
import { fail, ok } from '@/lib/http';

type Line = { itemId: string; quantity: number; returnedQty?: number };

async function audit(user: string, action: string, entity: string, entityId = '', detail = '') {
  await db().from('audit_logs').insert({ user_name: user, action, entity, entity_id: entityId, detail });
}

function cleanStockLines(lines: unknown): Line[] {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error('Phiếu kho chưa có mặt hàng.');
  }

  const merged = new Map<string, number>();
  for (const row of lines) {
    const itemId = typeof row?.itemId === 'string' ? row.itemId.trim() : '';
    const quantity = Number(row?.quantity);
    if (!itemId) throw new Error('Vui lòng chọn đầy đủ mặt hàng.');
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error('Số lượng nhập kho phải lớn hơn 0.');
    }
    merged.set(itemId, (merged.get(itemId) || 0) + quantity);
  }

  return [...merged].map(([itemId, quantity]) => ({ itemId, quantity }));
}

function cleanIssueLines(lines: unknown): Line[] {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error('Chưa chọn đồ cấp phát.');
  }

  const merged = new Map<string, number>();
  for (const row of lines) {
    const itemId = typeof row?.itemId === 'string' ? row.itemId.trim() : '';
    const quantity = Number(row?.quantity);
    if (!itemId) throw new Error('Vui lòng chọn đầy đủ mặt hàng.');
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error('Số lượng cấp phát phải lớn hơn 0.');
    }
    merged.set(itemId, (merged.get(itemId) || 0) + quantity);
  }

  return [...merged].map(([itemId, quantity]) => ({ itemId, quantity }));
}

async function changeStock(s: any, lines: unknown, type: 'RECEIPT'|'ADMISSION_ISSUE'|'EMERGENCY_ISSUE', meta: Record<string, any>) {
  const clean = cleanStockLines(lines);
  const { error } = await s.rpc('apply_stock_transaction', { p_lines: clean, p_type: type, p_date: meta.date || new Date().toISOString().slice(0,10), p_patient_id: meta.patientId || null, p_department: meta.department || null, p_performed_by: meta.performedBy, p_note: meta.note || null });
  if (error) throw error;
  return clean;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = body.action as string;
    const session = await requireSession(['saveSettings','saveCatalog','changePassword','saveDepartment','savePackage','savePackageItems','saveStaff'].includes(action));
    const s = db();
    const userClient = await createUserClient();

    if (action === 'receiveStock') {
      if (!body.date || !body.performedBy) throw new Error('Vui lòng chọn ngày nhập và người nhập kho.');
      const lines = await changeStock(userClient, body.items, 'RECEIPT', { date: body.date, performedBy: body.performedBy, note: body.note });
      await audit(session.fullName, 'NHAP_KHO', 'WAREHOUSE', '', `${lines.length} mặt hàng`);
      return ok(true);
    }

    if (action === 'saveIssue') {
      if (!body.medicalCode || !body.fullName || !body.departmentId) throw new Error('Thiếu mã KCB, họ tên hoặc khoa điều trị.');
      if (!body.issueDate || !body.issuer) throw new Error('Thiếu ngày cấp hoặc nhân viên cấp.');
      const lines = cleanIssueLines(body.items);
      const medicalCode = body.medicalCode.trim();
      const patientValues = {
        full_name: body.fullName.trim(),
        gender: body.gender,
        department_id: body.departmentId,
        status: 'ACTIVE',
        discharge_date: null,
        updated_at: new Date().toISOString(),
      };
      let { data: patient, error: patientError } = await s
        .from('patients')
        .select('id')
        .eq('medical_code', medicalCode)
        .maybeSingle();
      if (patientError) throw patientError;
      const existingPatient = Boolean(patient);
      if (!patient) {
        const created = await s.from('patients').insert({
          medical_code: medicalCode,
          full_name: patientValues.full_name,
          gender: patientValues.gender,
          department_id: patientValues.department_id,
          admission_date: body.admissionDate,
          status: 'ACTIVE',
          note: body.patientNote,
        }).select('id').single();
        if (created.error) throw created.error; patient = created.data;
      }
      let slipData: Record<string, any> | null = null;
      if (existingPatient) {
        const [updated, oldSlip] = await Promise.all([
          s.from('patients').update(patientValues).eq('id', patient.id),
          s.from('issue_slips').select('id,slip_no').eq('patient_id', patient.id).order('created_at',{ascending:false}).limit(1).maybeSingle(),
        ]);
        if (updated.error) throw updated.error;
        if (oldSlip.error) throw oldSlip.error;
        slipData = oldSlip.data;
      }
      if (!slipData) {
        const slipNo = `CP-${Date.now().toString(36).toUpperCase()}`;
        const slip = await s.from('issue_slips').insert({ slip_no: slipNo, patient_id: patient.id, issue_date: body.issueDate, issuer: body.issuer, receiver: body.receiver, package_name: body.packageName, note: body.note, image_url: body.imageUrl || null }).select().single();
        if (slip.error) throw slip.error;
        slipData = slip.data;
      }
      if (!slipData) throw new Error('Không tạo được phiếu cấp phát.');
      const savedItems = await s.from('issue_items').insert(
        lines.map(line => ({ slip_id: slipData!.id, item_id: line.itemId, quantity: line.quantity })),
      );
      if (savedItems.error) throw savedItems.error;

      after(() => audit(
        session.fullName,
        existingPatient ? 'BO_SUNG_PHIEU_CU' : 'CAP_PHAT',
        'ISSUE',
        slipData!.id,
        slipData!.slip_no,
      ).catch(error => console.error('Không thể ghi nhật ký cấp phát:', error)));

      return ok({ slipNo: slipData.slip_no, appended: existingPatient, itemCount: lines.length });
    }

    if (action === 'emergencyIssue') {
      if (!body.date || !body.patientId || !body.performedBy) throw new Error('Vui lòng chọn ngày cấp, bệnh nhân và nhân viên cấp.');
      const { data: patient } = await s.from('patients').select('*,departments(name)').eq('id', body.patientId).eq('status', 'ACTIVE').single();
      if (!patient) throw new Error('Không tìm thấy bệnh nhân đang điều trị.');
      await changeStock(userClient, body.items, 'EMERGENCY_ISSUE', { date: body.date, patientId: patient.id, department: patient.departments?.name, performedBy: body.performedBy, note: body.note });
      await audit(session.fullName, 'CAP_DOT_XUAT', 'WAREHOUSE', patient.id, 'Không thay đổi phiếu mượn bệnh nhân');
      return ok(true);
    }

    if (action === 'collectDischarge') {
      const { data: patient } = await s.from('patients').select('*').eq('id', body.patientId).eq('status', 'ACTIVE').single();
      if (!patient) throw new Error('Không tìm thấy bệnh nhân đang điều trị.');
      const collection = await s.from('collections').insert({ patient_id: patient.id, collection_date: body.date, collector: body.collector, deliverer: body.deliverer, discharged: Boolean(body.discharged), note: body.note, image_url: body.imageUrl || null }).select().single();
      if (collection.error) throw collection.error;
      const details = body.items.map((x: any) => ({ collection_id: collection.data.id, item_id: x.itemId, borrowed_qty: Number(x.borrowedQty), returned_qty: Number(x.returnedQty), missing_qty: Math.max(0, Number(x.borrowedQty)-Number(x.returnedQty)) }));
      const detailResult = await s.from('collection_items').insert(details);
      if (detailResult.error) throw detailResult.error;
      const missing = details.filter((x: any) => x.missing_qty > 0).map((x: any) => ({ patient_id: patient.id, collection_id: collection.data.id, item_id: x.item_id, loss_date: body.date, quantity: x.missing_qty, reason: body.reason, resolution: body.resolution, recorder: body.collector, note: body.note }));
      if (missing.length) { const lossResult = await s.from('losses').insert(missing); if (lossResult.error) throw lossResult.error; }
      if (body.discharged) {
        const discharged = await s.from('patients').update({ status: 'DISCHARGED', discharge_date: body.date, updated_at: new Date().toISOString() }).eq('id', patient.id);
        if (discharged.error) throw discharged.error;
      }
      await audit(session.fullName, 'THU_GOM_RA_VIEN', 'PATIENT', patient.id, `Thiếu ${missing.length} loại`);
      return ok({
        lossCount: missing.length,
        collectionId: collection.data.id,
        collectionNo: `TG-${String(collection.data.id).slice(0,8).toUpperCase()}`,
        missing: details.filter((x: any) => x.missing_qty > 0),
        patient: { medicalCode: body.medicalCode || '', fullName: body.fullName || '', department: body.departmentName || '' },
        collector: body.collector,
        deliverer: body.deliverer,
        date: body.date,
        reason: body.reason || 'Chưa xác định',
        resolution: body.resolution || 'Tiếp tục xác minh và xử lý theo quy định của bệnh viện.'
      });
    }

    if (action === 'saveLoss') {
      if (!body.itemId || !body.lossDate || Number(body.quantity) <= 0) throw new Error('Thiếu ngày, mặt hàng hoặc số lượng mất.');
      let patientId: string | null = body.patientId || null;
      if (!patientId && body.medicalCode) {
        const patient = await s.from('patients').select('id').eq('medical_code', String(body.medicalCode).trim()).maybeSingle();
        if (patient.error) throw patient.error;
        patientId = patient.data?.id || null;
      }
      const saved = await s.from('losses').insert({
        patient_id: patientId,
        item_id: body.itemId,
        loss_date: body.lossDate,
        quantity: Number(body.quantity),
        reason: body.reason || null,
        resolution: body.resolution || null,
        recorder: body.recorder || session.fullName,
        note: body.note || null
      }).select().single();
      if (saved.error) throw saved.error;
      await audit(session.fullName, 'MAT_DO', 'LOSS', saved.data.id, String(body.quantity));
      return ok(saved.data);
    }

    if (action === 'saveInventory') {
      const activeQuery = s.from('patients').select('id').eq('status','ACTIVE');
      const patientResult = body.scope === 'DEPARTMENT' ? await activeQuery.eq('department_id', body.departmentId) : await activeQuery;
      if (patientResult.error) throw patientResult.error;
      const inv = await s.from('inventories').insert({ department_id: body.scope === 'DEPARTMENT' ? body.departmentId : null, scope: body.scope, performed_by: body.performedBy, patient_count: patientResult.data.length, note: body.note }).select().single();
      if (inv.error) throw inv.error;
      const rows = body.items.map((x: any) => ({ inventory_id: inv.data.id, item_id: x.itemId, expected_qty: Number(x.expectedQty), actual_qty: Number(x.actualQty) }));
      const details = await s.from('inventory_items').insert(rows); if (details.error) throw details.error;
      await audit(session.fullName, 'KIEM_KE', 'INVENTORY', inv.data.id, body.scope);
      return ok({ patientCount: patientResult.data.length });
    }

    if (action === 'saveSettings') {
      for (const row of body.rows) { const result = await s.from('settings').upsert({ key: row.key, value: row.value, description: row.description, updated_at: new Date().toISOString() }); if (result.error) throw result.error; }
      return ok(true);
    }
    if (action === 'saveCatalog') {
      const result = await s.from('catalog_items').upsert(body.item, { onConflict: 'code' }); if (result.error) throw result.error;
      const { data: item } = await s.from('catalog_items').select('id').eq('code', body.item.code).single();
      await s.from('warehouse_stock').upsert({ item_id: item!.id, quantity: 0, warning_level: 10 }, { onConflict: 'item_id', ignoreDuplicates: true });
      return ok(true);
    }
    if (action === 'saveDepartment') {
      const result = await s.from('departments').upsert(body.department, { onConflict: 'code' }); if (result.error) throw result.error; return ok(true);
    }
    if (action === 'saveStaff') {
      const result = await s.from('staff').upsert(body.staff, { onConflict: 'code' }); if (result.error) throw result.error; return ok(true);
    }
    if (action === 'savePackage') {
      const result = await s.from('issue_packages').upsert(body.package, { onConflict: 'code' }); if (result.error) throw result.error; return ok(true);
    }
    if (action === 'savePackageItems') {
      if (!body.packageId) throw new Error('Chưa chọn gói cấp phát.');
      const disabled = await s.from('issue_package_items').update({ active:false }).eq('package_id',body.packageId); if (disabled.error) throw disabled.error;
      const rows = (body.items||[]).map((x:any)=>({package_id:body.packageId,item_id:x.itemId,quantity:Math.max(0,Number(x.quantity)),active:Boolean(x.active)}));
      if (rows.length) { const result=await s.from('issue_package_items').upsert(rows,{onConflict:'package_id,item_id'}); if(result.error)throw result.error; }
      return ok(true);
    }
    if (action === 'changePassword') {
      if (!body.password || body.password.length < 8) throw new Error('Mật khẩu mới phải có ít nhất 8 ký tự.');
      const result = await s.from('app_users').update({ password_hash: await hash(body.password, 12) }).eq('id', session.id); if (result.error) throw result.error; return ok(true);
    }
    throw new Error('Chức năng không hợp lệ.');
  } catch (error) { return fail(error); }
}
