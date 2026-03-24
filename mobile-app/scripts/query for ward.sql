-- 1. Tạo bảng Phường/Xã liên kết trực tiếp với Tỉnh/Thành phố
CREATE TABLE public.wards (
    code VARCHAR(5) PRIMARY KEY, -- Mã cấp xã có 5 ký tự (VD: '00004')
    province_code VARCHAR(2) NOT NULL,
    name VARCHAR(100) NOT NULL,
    CONSTRAINT fk_ward_province FOREIGN KEY (province_code) REFERENCES public.provinces (code)
);

-- 2. Thêm trường ward_code vào bảng activities
ALTER TABLE public.activities ADD COLUMN ward_code VARCHAR(5);

-- 3. Tạo khóa ngoại từ activities tới wards
ALTER TABLE public.activities
ADD CONSTRAINT fk_activities_ward FOREIGN KEY (ward_code) REFERENCES public.wards (code);

-- 4. Tạo Index để tối ưu truy vấn theo Phường (Đáp ứng yêu cầu Mentor)
CREATE INDEX idx_activities_ward_code ON public.activities (ward_code);

ALTER TABLE public.wards ALTER COLUMN code TYPE VARCHAR(10);

ALTER TABLE public.activities
ALTER COLUMN ward_code TYPE VARCHAR(10);