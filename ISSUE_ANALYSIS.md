# تحليل مشكلة License Expiration Date

## 📋 ملخص المشكلة

عند تفعيل رخصة من نوع `DAY-3` (3 أيام)، الفرق بين `issuedAt` و `expiresAt` يقل عن 72 ساعة بمقدار **25 دقيقة و30 ثانية**.

### البيانات الفعلية:

```
issuedAt:     2026-09-13T19:07:53.673Z
expiresAt:    2026-09-16T18:42:23.189Z  ❌ خطأ
Expected:     2026-09-16T19:07:53.673Z  ✓
Difference:   -25 دقيقة و 30 ثانية
```

---

## 🔍 تحليل الكود

### المسار التنفيذي:

1. **`controllers/activationController.js` (سطر 166)**
   - استدعاء `activateLicense()`

2. **`services/licenseService.js` (سطر 287-288)**

   ```javascript
   const activateLicense = async ({ requestId, code, deviceId, fingerprint, req }) => {
     const now = nowDate();  // ✅ حصول على الوقت الحالي
   ```

3. **`services/licenseService.js` (سطر 295)**

   ```javascript
   const license = await upsertLicenseFromActivationCode({
     activationCode,
     request,
     deviceId: normalizedDeviceId,
     now, // يُمرر الوقت
   });
   ```

4. **`services/licenseService.js` (سطر 74-86)**

   ```javascript
   const upsertLicenseFromActivationCode = async ({ activationCode, request, deviceId, now }) => {
     const policy = buildPolicyFromCode(activationCode.code, now);  // 🔴 هنا يتم حساب expiresAt
     const update = {
       ...
       expiresAt: policy.expiresAt,  // تُخزن في DB
       ...
     };
   ```

5. **`services/licensePolicyService.js` (سطر 5-13)**

   ```javascript
   const buildPolicyFromCode = (code, activatedAt = new Date()) => {
     const type = resolveLicenseType(code);

     if (type === 'temporary') {
       return {
         type,
         expiresAt: getCodeExpiryDate(code, activatedAt),  // 🔴 المشكلة هنا!
         revalidationIntervalSeconds: DAY_IN_SECONDS,
         offlineGraceSeconds: 2 * DAY_IN_SECONDS,
         ...
       };
     }
   ```

6. **`utils/code.js` (سطر 19-28)** - 🔴 **مصدر المشكلة!**

   ```javascript
   const getCodeExpiryDate = (value, activatedAt) => {
     const days = getDayCodeDuration(value); // يرجع 3 للكود "DAY-3"

     if (!days || !activatedAt) {
       return null;
     }

     const expiryDate = new Date(activatedAt);
     expiryDate.setDate(expiryDate.getDate() + days); // ❌ المشكلة هنا!
     return expiryDate;
   };
   ```

---

## ⚠️ سبب المشكلة

### المشكلة الأساسية: استخدام `getDate()` و `setDate()`

في JavaScript:

- **`getDate()`**: يرجع يوم الشهر بـ **المنطقة الزمنية المحلية**
- **`setDate()`**: يعيّن يوم الشهر بـ **المنطقة الزمنية المحلية**

هذا يسبب مشاكل عديدة:

### 1️⃣ **مشكلة Timezone Offset**

إذا كان الـ Server يعمل في منطقة زمنية مختلفة عن UTC:

```
Input:   activatedAt = 2026-09-13T19:07:53.673Z (UTC)
Server TZ = UTC+X

getDate():  قد يرجع 13 أو 14 حسب المنطقة الزمنية
setDate(13+3 or 14+3): حساب خاطئ
Result: expiresAt خاطئ
```

### 2️⃣ **لماذا بالضبط 25 دقيقة و30 ثانية؟**

هناك عدة احتمالات:

- **تأخير في العمليات الـ Async**: تأخير بين استدعاء `now` وحساب `expiresAt`
- **تحويل وقت غير صحيح**: خطأ في الحساب الداخلي للـ `Date` object

### 3️⃣ **لماذا `revalidateAfter` و `offlineGraceUntil` صحيحة؟**

في `services/licenseService.js` (سطر ~260):

```javascript
const issueLicenseToken = async ({ license, binding, now = nowDate() }) => {
  const issuedAt = now;
  const revalidateAfter = new Date(issuedAt.getTime() + (license.revalidationIntervalSeconds * 1000));
  const offlineGraceUntil = new Date(revalidateAfter.getTime() + (license.offlineGraceSeconds * 1000));
```

✅ هنا يُستخدم `.getTime()` (milliseconds) و `.setTime()` وهذا **صحيح تماماً**!

---

## ✅ الحل الصحيح

### الطريقة الصحيحة: استخدام Milliseconds

بدلاً من:

```javascript
const expiryDate = new Date(activatedAt);
expiryDate.setDate(expiryDate.getDate() + days);
return expiryDate;
```

يجب أن يكون:

```javascript
const expiryDate = new Date(activatedAt.getTime() + days * 24 * 60 * 60 * 1000);
return expiryDate;
```

أو بطريقة أكثر وضوحاً:

```javascript
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const expiryDate = new Date(activatedAt.getTime() + days * MS_PER_DAY);
return expiryDate;
```

---

## 📝 ملفات مسؤولة عن المشكلة

| الملف                              | السطر | الدالة                  | المشكلة                           |
| ---------------------------------- | ----- | ----------------------- | --------------------------------- |
| `utils/code.js`                    | 19-28 | `getCodeExpiryDate()`   | استخدام `setDate()` و `getDate()` |
| `services/licensePolicyService.js` | 5-13  | `buildPolicyFromCode()` | استدعاء الدالة الخاطئة            |

---

## 🔧 التعديلات المطلوبة

### 1. تصحيح `getCodeExpiryDate()` في `utils/code.js`:

```javascript
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const getCodeExpiryDate = (value, activatedAt) => {
  const days = getDayCodeDuration(value);

  if (!days || !activatedAt) {
    return null;
  }

  // ✅ الطريقة الصحيحة: استخدام milliseconds
  return new Date(activatedAt.getTime() + days * MS_PER_DAY);
};
```

---

## ✔️ التحقق من الحسابات الأخرى

بعد التعديل، تأكد من أن جميع الحسابات صحيحة:

### في `issueLicenseToken()`:

```javascript
const issuedAt = now;
const expiresAt = license.expiresAt; // الآن ستكون صحيحة ✅
const revalidateAfter = new Date(
  issuedAt.getTime() + license.revalidationIntervalSeconds * 1000,
);
const offlineGraceUntil = new Date(
  revalidateAfter.getTime() + license.offlineGraceSeconds * 1000,
);
```

النتائج المتوقعة:

- `expiresAt = issuedAt + 72 ساعة` ✅
- `revalidateAfter = issuedAt + 24 ساعة` ✅
- `offlineGraceUntil = revalidateAfter + 48 ساعة = issuedAt + 72 ساعة` ✅

---

## 📌 ملاحظات إضافية

1. **عدم الاعتماد على `getDate()` و `setDate()`** للحسابات الكبيرة (أيام أو أكثر)
2. **استخدام milliseconds (`getTime()`)** هو الطريقة الموثوقة والآمنة
3. **المنطقة الزمنية لا تؤثر** عند التعامل مع milliseconds من Unix epoch
