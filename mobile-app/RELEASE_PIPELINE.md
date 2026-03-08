# Android Release Pipeline (Expo)

## 1) Muc tieu

- Van dev nhanh bang `npx expo run:android` tren emulator.
- Khi can, co the build artifact Android ngay (APK internal test hoac AAB production).

## 2) Luong su dung

1. Dev feature:
   - `npm run android` (tuong duong `expo run:android`) de build/cai debug app tren emulator.
2. Internal test milestone:
   - `npx eas build -p android --profile preview` de tao APK.
3. Production release:
   - Tang `expo.version` (semantic version).
   - Build production profile:
     - `npx eas build -p android --profile production`
   - Neu can APK thay vi AAB:
     - `npx eas build -p android --profile preview`

## 3) Env & Config can dat truoc release

- Bat buoc tao file `.env` (khong commit) voi:
  - `EXPO_PUBLIC_SUPABASE_URL=...`
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY=...`
- Da dat:
  - `android.package`: `com.vconnect.mobile`
  - `android.versionCode`: `1`
  - `eas.json` voi `development` / `preview` / `production`

## 4) Quy uoc versioning de tranh loi upload

- `expo.version` (x.y.z): phien ban hien thi cho nguoi dung.
- `android.versionCode` (so nguyen): moi build production phai lon hon build truoc.
- Khuyen nghi:
  - Feature release: tang `minor` (vd `1.1.0`)
  - Hotfix: tang `patch` (vd `1.1.1`)
  - Major change: tang `major` (vd `2.0.0`)

`production.autoIncrement=true` trong `eas.json` se tu dong tang `versionCode` tren cloud build.

## 5) Trello task template

### Card title

`[Mobile][Release] Setup Android APK pipeline (EAS + env + signing)`

### Card description

```text
Goal
- Chuan hoa quy trinh build APK/AAB trong khi van dev bang run:android.

Scope
- Tao/kiem tra .env local cho Supabase keys.
- Chot app config: package id, version, versionCode.
- Tao eas.json voi 3 profile: development, preview, production.
- Chuan hoa lenh build:
  - preview APK: npx eas build -p android --profile preview
  - production: npx eas build -p android --profile production
- Cau hinh signing credentials tren Expo/EAS.

Definition of Done
- run:android chay duoc tren emulator.
- Build preview profile ra APK thanh cong.
- Build production profile thanh cong.
- Co tai lieu release checklist trong repo.

Checklist
- [ ] Dien bien moi truong .env (Supabase URL/key)
- [ ] Xac minh app.json (package/version/versionCode)
- [ ] Xac minh EAS login + project linked
- [ ] Tao build preview APK
- [ ] Tao build production
- [ ] Ghi lai release note + artifact link
```

## 6) Post-release strategy

- Moi lan tao artifact de chia test noi bo la 1 build.
- Moi lan release cho user/stakeholder la 1 release event.
- Nen phan biet:
  - Build event: build APK/AAB thanh cong.
  - Release event: ban build duoc chot de phat hanh.

Khuyen nghi quy trinh:

1. Chot code + tag release branch.
2. Build preview de QA nhanh.
3. Fix loi neu co.
4. Build production.
5. Luu changelog, build URL, version.

## 7) Neu chi co emulator, co on khong?

- On cho giai doan som va phan lon logic/UI.
- Rui ro con lai khi khong co may that:
  - Hanh vi network theo thiet bi/thoi diem.
  - Permission flow, performance, battery/background behavior.
  - Kich thuoc man hinh va keyboard/input edge cases.

Toi thieu nen bo sung 1 dot test tren may Android that truoc release production.
