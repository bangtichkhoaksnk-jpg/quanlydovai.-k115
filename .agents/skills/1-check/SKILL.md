---
name: 1-check
description: Kiểm tra TypeScript và trạng thái dự án trước khi triển khai
---

# Kiểm tra dự án

1. Chạy `npm ci` khi thư viện chưa được cài.
2. Chạy `npm run typecheck`.
3. Kiểm tra chỉ các tệp thuộc yêu cầu được thay đổi.
4. Không triển khai nếu TypeScript còn lỗi.
