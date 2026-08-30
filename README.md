# HỆ THỐNG QUẢN LÝ ĐỒ VẢI BỆNH VIỆN 2.0.1

Dự án chạy độc lập bằng **Next.js + Supabase + GitHub + Vercel**, không sử dụng Google Apps Script hoặc Google Sheets.

## Chức năng

- Đăng nhập và phân quyền `ADMIN`/`STAFF`; Báo cáo và Cài đặt chỉ dành cho quản lý.
- Tiếp nhận bệnh nhân và cấp phát trong một lần nhập.
- Tìm bệnh nhân thông minh; cấp thêm sẽ bổ sung vào phiếu cũ.
- Túi nam, túi nữ, túi trẻ em, phòng yêu cầu và danh mục có thể sửa.
- Thu gom, đối chiếu từng món, ghi thiếu/mất và cho bệnh nhân ra viện.
- Bệnh nhân ra viện không còn trong danh sách đang điều trị.
- Nhập kho nhiều hàng trong một phiếu; thêm/xóa dòng không giới hạn.
- Cấp phát vào viện và cấp đơn lẻ/đột xuất đều trừ kho.
- Cấp đơn lẻ/đột xuất không làm thay đổi phiếu mượn bệnh nhân.
- Cảnh báo sắp hết, hết và khóa cấp khi không đủ tồn.
- Kiểm kê theo khoa hoặc toàn viện.
- Theo dõi bệnh nhân hiện tại, báo cáo kho và xuất Excel mất đồ.
- Lưu ảnh/PDF phiếu và chữ ký trong kho lưu trữ riêng tư của Supabase.
- Cài đặt tên bệnh viện, tên khoa, tiêu đề, khẩu hiệu, logo và mật khẩu.

## Bước 1 – Tạo Supabase

1. Vào `https://supabase.com`, tạo tài khoản và chọn **New project**.
2. Mở **SQL Editor** → **New query**.
3. Mở tệp `supabase/schema.sql`, sao chép toàn bộ và chạy bằng nút **Run**.
4. Mở **Project Settings → API** và giữ lại:
   - `Project URL`.
   - `service_role key`.
5. Không đưa `service_role key` lên GitHub hoặc gửi công khai.

## Bước 2 – Đưa mã nguồn lên GitHub

1. Giải nén thư mục dự án.
2. Vào `https://github.com/new` và tạo repository mới, ví dụ `quan-ly-do-vai`.
3. Chọn **uploading an existing file**.
4. Tải toàn bộ tệp/thư mục của dự án lên, trừ `node_modules`, `.next` và `.env.local`.
5. Nhấn **Commit changes**.

Nếu dùng Git trên máy:

```bash
git init
git add .
git commit -m "Hệ thống quản lý đồ vải 2.0"
git branch -M main
git remote add origin URL_REPOSITORY_CUA_BAN
git push -u origin main
```

## Bước 3 – Triển khai Vercel

1. Vào `https://vercel.com/new`.
2. Chọn repository GitHub vừa tạo và nhấn **Import**.
3. Framework để mặc định là **Next.js**.
4. Tại **Environment Variables**, thêm đúng 5 biến:

| Tên biến | Giá trị |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL của Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key của Supabase |
| `SESSION_SECRET` | Chuỗi ngẫu nhiên tối thiểu 32 ký tự |
| `INITIAL_ADMIN_USERNAME` | `admin` hoặc tên đăng nhập muốn dùng |
| `INITIAL_ADMIN_PASSWORD` | Mật khẩu quản lý ban đầu, tối thiểu 8 ký tự |

5. Nhấn **Deploy**.
6. Khi Vercel báo hoàn thành, mở địa chỉ website được cấp.

Lưu ý: `SUPABASE_SERVICE_ROLE_KEY` phải là **secret key/service_role key**. Không dùng
`anon`, `publishable` hoặc khóa bắt đầu bằng `sb_publishable_`.

## Đăng nhập lần đầu

- Tài khoản: giá trị của `INITIAL_ADMIN_USERNAME`.
- Mật khẩu: giá trị của `INITIAL_ADMIN_PASSWORD`.
- Tài khoản quản lý được tự tạo khi đăng nhập lần đầu.
- Sau khi đăng nhập, vào **Cài đặt → Đổi mật khẩu quản lý**.

## Khởi tạo tồn kho

Sau khi cài đặt, số tồn của toàn bộ mặt hàng bằng `0`, vì vậy hệ thống sẽ không cho cấp phát. Vào:

`Kho đồ vải - vật tư → Nhập đồ vải/vật tư vào kho`

Bấm **Thêm hàng**, nhập số dư đầu kỳ cho từng mặt hàng rồi chọn **Nhập toàn bộ vào kho**.

## Quy tắc kho

```text
Tồn hiện tại = Tổng nhập kho − Cấp phát vào viện − Cấp đơn lẻ/đột xuất
```

- Phiếu cấp phát vào viện được lưu vào phiếu mượn bệnh nhân.
- Cấp đồ đơn lẻ/đột xuất chỉ ghi giao dịch kho, không thay đổi phiếu mượn.
- Hàm PostgreSQL khóa dòng tồn kho khi cập nhật, ngăn hai người cấp cùng lúc làm âm kho.

## Chạy thử trên máy tính

```bash
npm install
cp .env.example .env.local
npm run dev
```

Mở `http://localhost:3000`.

## Bảo mật dữ liệu bệnh viện

- Không bật quyền đọc công khai các bảng Supabase.
- Không đưa `.env.local`, `service_role key` hoặc mật khẩu lên GitHub.
- Chỉ cấp đường dẫn phần mềm cho nhân viên được phép sử dụng.
- Nên bật xác thực hai bước cho GitHub, Supabase và Vercel.
- Thực hiện sao lưu Supabase định kỳ theo quy định của bệnh viện.

## Cập nhật phiên bản

Sau khi sửa mã và đẩy lên nhánh `main`, Vercel tự tạo bản triển khai mới. Không cần thao tác `Deploy → Manage deployments` như Google Apps Script.

