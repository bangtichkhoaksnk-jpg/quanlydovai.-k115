import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fail, ok } from '@/lib/http';

export async function POST(request: Request){
  try{
    const session = await requireSession();
    const form=await request.formData();const file=form.get('file');
    if(!(file instanceof File))throw new Error('Chưa chọn hình ảnh.');
    if(file.size>8*1024*1024)throw new Error('Tệp không được lớn hơn 8 MB.');
    if(!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type))throw new Error('Chỉ nhận JPG, PNG, WEBP hoặc PDF.');
    const ext=file.name.split('.').pop()?.replace(/[^a-z0-9]/gi,'')||'bin';
    const path=`${session.id}/${new Date().toISOString().slice(0,10)}/${crypto.randomUUID()}.${ext}`;
    const supabase=await createClient();
    const {error}=await supabase.storage.from('documents').upload(path,await file.arrayBuffer(),{contentType:file.type,upsert:false});
    if(error)throw error;return ok({path});
  }catch(error){return fail(error)}
}
