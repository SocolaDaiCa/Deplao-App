# Specs — Dép Lào / Deplao App

Tài liệu đặc tả để mở rộng ứng dụng (thêm dịch vụ web, chỉnh shell) mà không phải đọc toàn bộ mã nguồn.

## Mục lục

| Tài liệu | Nội dung |
|----------|----------|
| [architecture.md](./architecture.md) | Kiến trúc Electron: shell, `BrowserView`, partition, IPC |
| [service-manifest.md](./service-manifest.md) | Gói dịch vụ trong `apps/<id>/`, schema `manifest.json`, checklist thêm app |

## Nguyên tắc

- Mỗi **dịch vụ** (Messenger, Zalo, …) là một thư mục dưới `apps/` cùng `manifest.json`.
- Shell (sidebar, modal tài khoản) **không** hard-code danh sách URL; lấy từ registry (`apps-registry.js`).
- Chi tiết triển khai có thể thay đổi; khi sửa hành vi, cập nhật spec tương ứng.
