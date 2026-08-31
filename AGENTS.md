# NGUYÊN TẮC PHÁT TRIỂN VÀ TRIỂN KHAI

## Kiến trúc
- Next.js App Router và TypeScript.
- Supabase PostgreSQL; đăng nhập bằng Supabase Auth và cookie an toàn.
- Service role chỉ dùng trong API phía máy chủ.
- Giữ nguyên RLS, migration và cấu trúc dữ liệu hiện có.

## Nghiệp vụ bắt buộc
- Không xóa hoặc đổi dữ liệu cũ khi chưa có migration an toàn.
- Mọi thay đổi tồn kho phải đi qua hàm giao dịch PostgreSQL và không để tồn âm.
- Cấp thêm cho bệnh nhân đang điều trị phải nối tiếp phiếu đang có.
- Cấp đột xuất chỉ trừ kho, không sửa phiếu mượn ban đầu.
- Bệnh nhân xác nhận ra viện phải ẩn khỏi danh sách đang điều trị.
- ADMIN xem Báo cáo và Cài đặt; STAFF chỉ thực hiện nghiệp vụ.
- Danh sách tìm kiếm chỉ hiện sau khi nhập từ khóa.

## Quy trình
1. Kéo nhánh main mới nhất.
2. Chạy `npm ci` và `npm run typecheck`.
3. Chỉ cập nhật các tệp thuộc yêu cầu.
4. Đẩy lên nhánh main để Vercel tự triển khai.
5. Xác nhận trạng thái Vercel thành công trước khi bàn giao.
