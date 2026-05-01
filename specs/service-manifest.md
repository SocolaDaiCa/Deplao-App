# Spec: Gói dịch vụ (`apps/<serviceId>/`)

Một **service** = một thư mục con của `apps/` (tên thư mục thường trùng `id`, không bắt buộc).

Thư mục bắt đầu bằng `_` (ví dụ `_shared`) **bị bỏ qua** khi quét registry.

## Bố cục khuyến nghị

```
apps/
  <serviceId>/
    manifest.json      # bắt buộc
    icon.png           # tuỳ chọn — ảnh sidebar khi user chưa đặt avatar
    preload.js         # tuỳ chọn — không có → dùng apps/_shared/preload-default.js
    style.css          # tuỳ chọn — khai báo qua customCss trong manifest
```

## Schema `manifest.json`

| Trường | Bắt buộc | Kiểu | Mô tả |
|--------|----------|------|--------|
| `id` | Khuyến nghị | string | Định danh service; nếu thiếu, dùng tên thư mục. Trùng với `profile.platform` trong renderer. |
| `name` | Không | string | Tên hiển thị trong dropdown; mặc định = `id`. |
| `startUrl` | **Có** | string | URL tải khi tạo `BrowserView` lần đầu cho workspace có `platform` = `id`. |
| `trustedDomains` | Khuyến nghị | string[] | Chuỗi con kiểm tra `url.includes(domain)`. Dùng cho mở cửa sổ con, OAuth, CDN. |
| `order` | Không | number | Thứ tự trong dropdown/sort; mặc định `999`. Nhỏ hơn = hiện trước. |
| `customCss` | Không | string | Tên file CSS **trong cùng thư mục** (ví dụ `"style.css"`). Inject sau khi trang load. |
| `preload` | Không | string | Tên file preload; mặc định `"preload.js"`. File không tồn tại → preload chung. |
| `userAgent` | Không | string | UA riêng cho `loadURL`; không set → UA mặc định của app. |
| `icon` | Không | string | Tên file icon; mặc định `"icon.png"`. |

### Ví dụ tối thiểu

```json
{
  "id": "example",
  "name": "Example",
  "startUrl": "https://example.com/app",
  "order": 50,
  "trustedDomains": ["example.com", "example-cdn.net"]
}
```

### Ví dụ có CSS + preload tùy chỉnh

```json
{
  "id": "example",
  "name": "Example",
  "startUrl": "https://example.com/app",
  "trustedDomains": ["example.com"],
  "customCss": "style.css",
  "preload": "preload.js"
}
```

## Preload

- Chạy trong **world riêng** của Electron (`contextIsolation: true`, `nodeIntegration: false` trên `BrowserView`).
- **Mặc định:** `apps/_shared/preload-default.js` expose `messengerApp` (bridge IPC đồng bộ với shell).
- **Tuỳ chỉnh:** copy `preload-default.js` làm mẫu hoặc chỉ thêm logic (inject DOM, chặn request phía client, …). Tránh lộ API nhạy cảm ra trang web.

## CSS tùy chỉnh

- File được đọc từ đĩa và `insertCSS` sau `did-finish-load`.
- Chỉ áp dụng cho workspace dùng đúng `platform` (xem `main.js` + manifest `customCss`).

## Icon sidebar

- Đặt `icon.png` (hoặc chỉnh `icon` trong manifest).
- Renderer dùng đường dẫn tuyệt đối qua IPC `get-services-ui` → `iconPath` có thể null nếu file không tồn tại.

## Build / đóng gói

- `package.json` → `build.files` phải gồm `apps/**/*` (và `apps-registry.js`) để mọi manifest/asset được đưa vào bản cài.

## Checklist thêm service mới

1. Tạo `apps/<serviceId>/manifest.json` với `startUrl` và `trustedDomains` đủ cho login + tính năng.
2. (Tuỳ chọn) Thêm `icon.png`, `preload.js`, `style.css` + khai báo `customCss` / `preload` / `icon`.
3. Chạy app: service xuất hiện trong dropdown “Thêm tài khoản”.
4. Tạo workspace mới, chọn service, đăng nhập — kiểm tra popup/OAuth (bổ sung domain nếu bị mở ngoài trình duyệt).

## Ghi chú bảo mật & ToS

- Shell chỉ nhúng web; tuân thủ điều khoản từng nền tảng.
- `trustedDomains` rộng quá mức làm tăng bề mặt tấn công (mở link trong session); chỉ thêm domain cần thiết.
