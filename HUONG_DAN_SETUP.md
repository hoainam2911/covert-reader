# 📖 HƯỚNG DẪN SETUP — STV Dịch & Đọc Truyện (Web đầy đủ)

4 file bạn có: `index.html` (đăng nhập), `app.html` (web chính), `config.js` (cấu hình), `schema.sql` (lệnh tạo database).

Làm theo đúng 4 bước dưới đây — tổng thời gian khoảng 10-15 phút.

---

## BƯỚC 1 — Tạo project Supabase (database + đăng nhập, free)

1. Vào **https://supabase.com** → bấm **Start your project** → đăng nhập bằng GitHub
2. Bấm **New project**
   - Đặt tên bất kỳ, ví dụ `stv-reader`
   - Đặt mật khẩu database (lưu lại, ít dùng tới nhưng đề phòng)
   - Chọn vùng gần Việt Nam nhất, ví dụ `Southeast Asia (Singapore)`
   - Bấm **Create new project** — chờ khoảng 1-2 phút để khởi tạo

## BƯỚC 2 — Tạo bảng dữ liệu

1. Trong Supabase dashboard, vào menu trái → **SQL Editor**
2. Bấm **New query**
3. Mở file `schema.sql` (đã gửi kèm) → copy **toàn bộ nội dung**
4. Dán vào ô query → bấm **Run** (hoặc Ctrl+Enter)
5. Thấy "Success. No rows returned" là xong

6. Tiếp tục: mở file **`schema_upgrade_v2.sql`** → copy toàn bộ → dán vào **New query** khác → **Run**
   - File này tạo thêm: ảnh bìa thật (Storage bucket `covers`), bình luận, đánh giá sao, yêu thích, lịch sử đọc
   - **Nếu bạn đã setup từ trước** (đã từng chạy `schema.sql` cũ rồi) thì chỉ cần chạy file `schema_upgrade_v2.sql` này là đủ, không cần chạy lại `schema.sql`

## BƯỚC 3 — Lấy API key và điền vào config.js

1. Trong Supabase dashboard, vào **Project Settings** (icon bánh răng) → **API**
2. Bạn sẽ thấy:
   - **Project URL** — dạng `https://xxxxx.supabase.co`
   - **anon public** key — chuỗi dài bắt đầu bằng `eyJ...`
3. Mở file `config.js` bằng Notepad (hoặc bất kỳ trình soạn thảo text nào), sửa thành:

```js
window.SUPABASE_URL = "https://xxxxx.supabase.co";
window.SUPABASE_ANON_KEY = "eyJ....(chuỗi dài của bạn)....";
```

4. Lưu lại file.

> ⚠️ Mặc định Supabase **yêu cầu xác nhận email** khi đăng ký. Nếu muốn tắt (để đăng ký xong dùng luôn, không cần check email) thì vào **Authentication → Providers → Email** → tắt **Confirm email**. Khuyến nghị tắt cho dễ dùng vì đây là app cá nhân.

## BƯỚC 4 — Đưa lên GitHub Pages (host miễn phí)

1. Vào **github.com** → bấm **New repository**
   - Đặt tên ví dụ `stv-reader`
   - Chọn **Public**
   - Bấm **Create repository**
2. Trong trang repo vừa tạo, bấm **uploading an existing file** (hoặc kéo thả)
3. Kéo thả **tất cả 7 file**: `index.html`, `app.html`, `style.css`, `web-truyen-theme.css`, `translator.js`, `library.js`, `config.js` (đã điền key). **Không cần** đưa các file `.sql` lên (chỉ dùng để chạy trong Supabase SQL Editor).
4. Bấm **Commit changes**
5. Vào tab **Settings** của repo → menu trái chọn **Pages**
6. Ở mục **Branch**, chọn `main` → thư mục `/ (root)` → bấm **Save**
7. Đợi khoảng 1 phút, trang sẽ load lại và hiện link dạng:
   ```
   https://<tên-bạn>.github.io/stv-reader/
   ```
8. Mở link đó → bạn sẽ thấy trang đăng nhập!

---

## ✅ Dùng thử

1. Vào link GitHub Pages → bấm tab **Đăng ký** → nhập email + mật khẩu → **Tạo tài khoản**
2. Đăng nhập lại (hoặc tự động chuyển vào nếu đã tắt confirm email)
3. Vào **Thư viện** → bấm **➕ Dịch truyện mới** → đặt tên, chọn icon → **Tạo & bắt đầu dịch**
4. Tải file `.txt` lên, dịch như bình thường — bản dịch **tự động lưu lên cloud** sau khi dịch xong
5. Bấm **☰ Thư viện** để quay lại danh sách — vào lại bằng điện thoại/máy khác, đăng nhập cùng tài khoản là thấy y hệt

## Đồng bộ gồm những gì?
- ✅ Nội dung bản dịch của từng truyện
- ✅ Vị trí đang đọc (chương + % cuộn trang) — mở máy khác sẽ tự nhảy đúng chỗ
- ✅ Theme (sáng/tối/nâu) bạn chọn

## 🌐 Tính năng Cộng đồng — đầy đủ như 1 web truyện thật

**Ảnh bìa thật** — khi tạo truyện hoặc đăng cộng đồng, bấm vào ô "Bấm để chọn ảnh" → tải ảnh từ máy lên (tối đa 5MB), thay vì chọn icon như trước.

**Trang chi tiết truyện** — bấm vào 1 truyện trong Cộng đồng sẽ mở trang riêng gồm:
- Ảnh bìa lớn, tên truyện, tác giả, thể loại, mô tả
- Số lượt xem, số chương, điểm đánh giá trung bình
- Nút ⭐ **Đánh giá 1-5 sao** (phải đăng nhập)
- Nút ☆ **Yêu thích** — lưu lại để xem trong tab ⭐ Yêu thích
- **Danh sách chương** dạng lưới, bấm vào chương nào là nhảy thẳng tới đó
- **Bình luận** bên dưới — viết, xem bình luận người khác, xoá bình luận của chính mình

**Tab ⭐ Yêu thích** — danh sách các truyện cộng đồng bạn đã đánh dấu

**Tab 🕐 Lịch sử đọc** — tự động ghi lại truyện cộng đồng bạn đã đọc gần đây + đang ở chương nào, bấm vào để đọc tiếp

**Đăng truyện** — sau khi dịch xong 1 truyện trong thư viện riêng, bấm nút **🌐 Đăng cộng đồng** → điền ảnh bìa, tên tác giả, mô tả, thể loại (hơn 20 thể loại tu tiên/huyền huyễn), bật NSFW nếu cần (có thể tự đặt mật khẩu riêng)

> Truyện đăng lên Cộng đồng là **bản sao riêng** — sửa bản gốc trong thư viện cá nhân sau này sẽ không tự cập nhật vào bản đã đăng.

## Lưu ý chi phí
Supabase free tier: 500MB database, 50,000 lượt request xác thực/tháng, 5GB băng thông — đủ dùng thoải mái cho cá nhân, không tốn phí gì. GitHub Pages hoàn toàn miễn phí cho repo public.

## Cập nhật web sau này
Mỗi khi tôi (Claude) sửa thêm tính năng, bạn chỉ cần tải file `app.html` mới → vào lại GitHub repo → upload đè lên file cũ → Commit. Trang sẽ tự cập nhật sau ~1 phút, không cần làm lại bước Supabase.
