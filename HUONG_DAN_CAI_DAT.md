# Hướng dẫn cài đặt bệnh viện mới

Gói này nhân bản mã nguồn và cấu trúc nghiệp vụ, **không chứa dữ liệu bệnh nhân** và **không chứa khóa bí mật**.

## 1. Đưa mã nguồn lên GitHub

1. Giải nén gói ZIP.
2. Mở repository GitHub đích.
3. Chọn **Add file → Upload files**.
4. Kéo toàn bộ tệp và thư mục bên trong thư mục đã giải nén vào trang tải lên.
5. Chọn **Commit changes**.

## 2. Tạo cấu trúc Supabase

1. Mở Supabase → **SQL Editor**.
2. Chạy `supabase/schema.sql`, sau đó chạy lần lượt các tệp trong `supabase/migrations/` theo thứ tự tên tăng dần.
3. Mở **Authentication → Users**, tạo tài khoản quản trị bằng email thật.
4. Trong SQL Editor, cập nhật hồ sơ tài khoản vừa tạo thành vai trò `ADMIN` theo hướng dẫn trong `README.md`.
5. Không sao chép bảng bệnh nhân, cấp phát, thu gom, mất đồ, kiểm kê hoặc nhật ký từ bệnh viện khác.

## 3. Cấu hình Vercel

Kết nối repository GitHub và đặt các Environment Variables theo `.env.example`:

- `NEXT_PUBLIC_SUPABASE_URL`: dạng `https://PROJECT.supabase.co` (không thêm `/rest/v1`).
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: khóa publishable/anon của dự án.
- `SUPABASE_SERVICE_ROLE_KEY`: khóa server-side; không đưa vào GitHub hay mã phía trình duyệt.
- `SESSION_SECRET`: chuỗi ngẫu nhiên dài ít nhất 32 ký tự.
- `INITIAL_ADMIN_USERNAME` và `INITIAL_ADMIN_PASSWORD`: chỉ dùng nếu quy trình khởi tạo của bản triển khai yêu cầu.

Sau khi lưu biến môi trường, chọn **Deploy**. Mỗi lần cập nhật nhánh `main`, Vercel sẽ tự động triển khai lại.

## 4. Kiểm tra sau triển khai

- Đăng nhập và xác nhận người không đăng nhập không mở được `/dashboard`.
- Kiểm tra Cài đặt: thông tin chung, khoa, đồ vải, vật tư, gói cấp phát, nhân viên, mật khẩu và logo.
- Kiểm tra tiếp nhận/cấp phát, thu gom/ra viện, phiếu thiếu đồ, kiểm kê khoa, theo dõi và báo cáo.
- Dùng dữ liệu thử không phải dữ liệu bệnh nhân thật, sau đó xóa dữ liệu thử trước khi vận hành.

## Lưu ý bảo mật

Nếu một khóa `service_role` hoặc mật khẩu đã từng được gửi trong tin nhắn/ảnh, hãy xoay vòng khóa và đổi mật khẩu trước khi triển khai chính thức.
