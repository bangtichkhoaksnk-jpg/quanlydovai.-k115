# Nguyên tắc nâng cấp hệ thống quản lý đồ vải

- Giữ nguyên dữ liệu, cấu trúc Supabase và nghiệp vụ đang hoạt động.
- Không làm mất các chức năng tiếp nhận, cấp phát, thu gom, kho, kiểm kê, mất đồ, theo dõi, báo cáo và cài đặt.
- Mọi thao tác lưu phải có trạng thái đang xử lý và chặn bấm lặp.
- Bộ lọc ngày phải áp dụng thống nhất cho hiển thị, in và xuất Excel.
- Báo cáo phải tách rõ đồ vải và vật tư.
- Luôn chạy TypeScript và xác nhận Vercel trước khi bàn giao.
