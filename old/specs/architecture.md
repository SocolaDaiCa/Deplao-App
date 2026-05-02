# Kiến trúc ứng dụng

## Tổng quan

Ứng dụng là **desktop shell** (Electron): một cửa sổ chứa UI điều khiển (HTML/renderer) và từng **phiên web** tải trang nhắn tin / làm việc bên trong `BrowserView`.

```
┌─────────────────────────────────────────┐
│  BrowserWindow (index.html + sidebar)    │
│ ┌──┬────────────────────────────────────┐ │
│ │  │  BrowserView (site: Messenger…)     │ │
│ │ S│  partition = persist:…  → cookies   │ │
│ │ i│  preload theo apps/<id>/ hoặc _shared │ │
│ │ d│                                     │ │
│ │ e│                                     │ │
│ │ b│                                     │ │
│ │ a│                                     │ │
│ │ r│                                     │ │
│ └──┴────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

## Thành phần chính

| Thành phần | Vai trò |
|------------|---------|
| `main.js` | Tạo cửa sổ, `BrowserView`, session, proxy, tray, auto-update, đăng ký IPC |
| `renderer.js` | Sidebar workspace (profile), modal thêm/sửa, theme/zoom/pin |
| `apps-registry.js` | Quét `apps/*/manifest.json`, chuẩn hóa cấu hình, gộp `trustedDomains` |
| `apps/<service>/` | Gói một dịch vụ: manifest, icon, preload/CSS tùy chọn |
| `apps/_shared/` | Dùng chung (preload mặc định); thư mục `_` không được đăng ký là service |

## Workspace (profile)

- Mỗi nút sidebar = một **workspace** lưu trong `localStorage` (`mp_profiles`).
- Trường quan trọng: `id`, `name`, `partition` (ví dụ `persist:nick_…`), `platform` (trùng `id` trong `manifest.json` của service), `proxy` (tuỳ chọn), `avatar` (tuỳ chọn).
- `partition` tách cookie/storage; cùng service nhưng hai tài khoản = hai workspace, hai partition.

## IPC (luồng chọn workspace)

- Renderer gửi `switch-profile` kèm object profile → main gắn `BrowserView` tương ứng (tạo lần đầu nếu chưa có), load `startUrl` và preload theo manifest của `platform`.
- `get-services-ui` (invoke): trả danh sách service để vẽ dropdown và icon mặc định.

## Tin cậy URL & quyền

- `trustedDomains` trong mỗi manifest là chuỗi con dùng với `url.includes(...)` (không phải glob đầy đủ).
- Main **gộp** mọi `trustedDomains` của mọi service để quyết định mở popup/link trong app hay `shell.openExternal`, và để `setPermissionRequestHandler` / `setPermissionCheckHandler`.
- Thêm domain login CDN/OAuth cho một service: bổ sung vào `trustedDomains` của service đó.

## Mở rộng shell (không chỉ thêm service)

Khi thay đổi hành vi toàn app (badge, notification, keyboard, window), sửa `main.js` / `renderer.js` và ghi rõ vào spec hoặc issue/PR; registry chỉ điều khiển **nội dung web** từng service.
