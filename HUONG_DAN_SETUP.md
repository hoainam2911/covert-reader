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
5. Thấy "Success. No rows returned" là xong — các bảng `novels`, `reading_progress`, `user_settings`, `community_novels` đã được tạo

> 🔄 **Nếu bạn đã setup Supabase từ trước** (đã có bảng `novels` v.v.) và chỉ muốn thêm tính năng Cộng đồng mới: mở `schema.sql`, copy **chỉ phần từ `-- CỘNG ĐỒNG` trở xuống**, dán vào SQL Editor → Run. Không cần chạy lại từ đầu.

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
3. Kéo thả **tất cả 6 file**: `index.html`, `app.html`, `style.css`, `translator.js`, `library.js`, `config.js` (đã điền key). **Không cần** đưa `schema.sql` lên (chỉ dùng 1 lần lúc setup database).
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

## 🌐 Tính năng Cộng đồng (mới)

Sau khi dịch xong 1 truyện trong thư viện riêng, bạn có thể **đăng công khai** cho mọi người cùng đọc:

1. Mở truyện đã dịch → bấm nút **🌐 Đăng cộng đồng**
2. Điền tên tác giả hiển thị (để trống = "Ẩn danh"), mô tả ngắn, chọn **thể loại** (Tiên hiệp, Huyền huyễn, Kiếm hiệp, Đô thị, Xuyên không, Hệ thống, Đam mỹ, Ngôn tình... hơn 20 thể loại tham khảo từ các web truyện tu tiên phổ biến), chọn icon bìa
3. Nếu truyện có nội dung **18+/NSFW** → tick vào ô tương ứng, có thể **tự đặt mật khẩu riêng** để giới hạn người xem (để trống = ai cũng xem được, chỉ là vào khu NSFW riêng)
4. Bấm **Đăng truyện**

Khu vực Cộng đồng nằm ở tab **🌐 Cộng đồng** trong màn hình thư viện — có 2 mục riêng biệt: **📖 Truyện thường** và **🔞 NSFW** (mục NSFW không hiện trong mục thường), kèm bộ lọc theo thể loại. Truyện NSFW có đặt pass sẽ yêu cầu nhập đúng mật khẩu mới đọc được.

> Truyện đăng lên Cộng đồng là **bản sao riêng** (không liên kết với truyện gốc trong thư viện cá nhân) — sửa bản gốc sau này sẽ không tự cập nhật vào bản đã đăng.

## Lưu ý chi phí
Supabase free tier: 500MB database, 50,000 lượt request xác thực/tháng, 5GB băng thông — đủ dùng thoải mái cho cá nhân, không tốn phí gì. GitHub Pages hoàn toàn miễn phí cho repo public.

## Cập nhật web sau này
Mỗi khi tôi (Claude) sửa thêm tính năng, bạn chỉ cần tải file `app.html` mới → vào lại GitHub repo → upload đè lên file cũ → Commit. Trang sẽ tự cập nhật sau ~1 phút, không cần làm lại bước Supabase.
