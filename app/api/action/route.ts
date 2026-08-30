import { hash } from 'bcryptjs';
import { db } from '@/lib/supabase';
import { requireSession } from '@/lib/auth';
import { fail, ok } from '@/lib/http';

type Line = { itemId: string; quantity: number; returnedQty?: number };

async function audit(user: string, action: string, entity: string, entityId = '', detail = '') {
  await db().from('audit_logs').insert({ user_name: user, action, entity, entity_id: entityId, detail });
}

async function changeStock(lines: Line[], type: 'RECEIPT'|'ADMISSION_ISSUE'|'EMERGENCY_ISSUE', meta: Record<string, any>) {
  const s = db();
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error('Chưa có mặt hàng để nhập kho.');
  }
  const invalidLine = lines.find(
    x => !x?.itemId || !Number.isFinite(Number(x.quantity)) || Number(x.quantity) <= 0
  );
  if (invalidLine) {
    throw new Error('Vui lòng bấm chọn mặt hàng trong danh sách và nhập số lượng lớn hơn 0.');
  }
  const clean = lines.map(x => ({ itemId: String(x.itemId), quantity: Number(x.quantity) }));
  const transactionDate = meta.date || new Date().toISOString().slice(0,10);
  const { error } = await s.rpc('apply_stock_transaction', { p_lines: clean, p_type: type, p_date: transactionDate, p_patient_id: meta.patientId || null, p_department: meta.department || null, p_performed_by: meta.performedBy, p_note: meta.note || null });
  if (!error) return;

  // Bản sao mới có thể chưa cài RPC kho. Chỉ nhập kho được phép dùng
  // cơ chế dự phòng; nghiệp vụ xuất kho vẫn bắt buộc RPC để giữ kiểm tra tồn.
  const rpcMissing = ['PGRST202', '42883'].includes(String(error.code || ''));
  if (type !== 'RECEIPT' || !rpcMissing) throw error;

  for (const line of clean) {
    const current = await s.from('warehouse_stock')
      .select('quantity,warning_level')
      .eq('item_id', line.itemId)
      .maybeSingle();
    if (current.error) throw current.error;

    const oldQuantity = Number(current.data?.quantity || 0);
    const nextQuantity = oldQuantity + line.quantity;
    const stockResult = current.data
      ? await s.from('warehouse_stock')
          .update({ quantity: nextQuantity, updated_at: new Date().toISOString() })
          .eq('item_id', line.itemId)
      : await s.from('warehouse_stock')
          .insert({ item_id: line.itemId, quantity: nextQuantity, warning_level: 10 });
    if (stockResult.error) throw stockResult.error;

    const transaction = await s.from('warehouse_transactions').insert({
      transaction_date: transactionDate,
      transaction_type: 'RECEIPT',
      item_id: line.itemId,
      in_qty: line.quantity,
      out_qty: 0,
      balance_after: nextQuantity,
      patient_id: null,
      department: null,
      performed_by: meta.performedBy,
      note: meta.note || null
    });
    if (transaction.error) throw transaction.error;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = body.action as string;
    const session = await requireSession(['saveSettings','saveCatalog','changePassword','saveDepartment','savePackage','savePackageItems','saveStaff'].includes(action));
    const s = db();

    if (action === 'receiveStock') {
      await changeStock(body.items, 'RECEIPT', { date: body.date, performedBy: body.performedBy, note: body.note });
      await audit(session.fullName, 'NHAP_KHO', 'WAREHOUSE', '', `${body.items.length} mặt hàng`);
      return ok(true);
    }

    if (action === 'saveIssue') {
      if (!body.medicalCode || !body.fullName || !body.departmentId) throw new Error('Thiếu mã KCB, họ tên hoặc khoa điều trị.');
      if (!body.items?.length) throw new Error('Chưa chọn đồ cấp phát.');
      let { data: patient } = await s.from('patients').select('*').eq('medical_code', body.medicalCode.trim()).maybeSingle();
      const existingPatient = Boolean(patient);
      if (!patient) {
        const created = await s.from('patients').insert({ medical_code: body.medicalCode.trim(), full_name: body.fullName.trim(), gender: body.gender, department_id: body.departmentId, admission_date: body.admissionDate, status: 'ACTIVE', note: body.patientNote }).select().single();
        if (created.error) throw created.error; patient = created.data;
      } else {
        const updated = await s.from('patients').update({ full_name: body.fullName.trim(), gender: body.gender, department_id: body.departmentId, status: 'ACTIVE', discharge_date: null, updated_at: new Date().toISOString() }).eq('id', patient.id).select().single();
        if (updated.error) throw updated.error; patient = updated.data;
      }
      let slipData: Record<string, any> | null = null;
      if (existingPatient) {
        const oldSlip = await s.from('issue_slips').select('*').eq('patient_id', patient.id).order('created_at',{ascending:false}).limit(1).maybeSingle();
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
      const oldItems = await s.from('issue_items').select('id,item_id,quantity').eq('slip_id', slipData.id);
      if (oldItems.error) throw oldItems.error;
      for (const line of body.items as Line[]) {
        const quantity = Number(line.quantity);
        if (!line.itemId || quantity <= 0) continue;
        const current = (oldItems.data || []).find((x: any) => x.item_id === line.itemId);
        const saved = current
          ? await s.from('issue_items').update({ quantity: Number(current.quantity) + quantity }).eq('id', current.id)
          : await s.from('issue_items').insert({ slip_id: slipData.id, item_id: line.itemId, quantity });
        if (saved.error) throw saved.error;
      }
      await audit(session.fullName, existingPatient?'BO_SUNG_PHIEU_CU':'CAP_PHAT', 'ISSUE', slipData.id, slipData.slip_no);
      return ok({ slipNo: slipData.slip_no, appended: existingPatient });
    }

    if (action === 'emergencyIssue') {
      const { data: patient } = await s.from('patients').select('*,departments(name)').eq('id', body.patientId).eq('status', 'ACTIVE').single();
      if (!patient) throw new Error('Không tìm thấy bệnh nhân đang điều trị.');
      await changeStock(body.items, 'EMERGENCY_ISSUE', { date: body.date, patientId: patient.id, department: patient.departments?.name, performedBy: body.performedBy, note: body.note });
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

