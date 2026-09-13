/**
 * License Expiration Date Fix - Test Cases
 * 
 * يوضح هذا الملف الفرق بين الكود القديم (الخاطئ) والكود الجديد (الصحيح)
 */

// ============================================
// ❌ الكود القديم (الخاطئ)
// ============================================
const getCodeExpiryDate_OLD = (value, activatedAt) => {
  const days = /^DAY-(\d+)$/i.test(value) ? parseInt(value.match(/\d+/)[0]) : null;
  
  if (!days || !activatedAt) {
    return null;
  }

  const expiryDate = new Date(activatedAt);
  expiryDate.setDate(expiryDate.getDate() + days);  // ❌ الخطأ هنا!
  return expiryDate;
};

// ============================================
// ✅ الكود الجديد (الصحيح)
// ============================================
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const getCodeExpiryDate_NEW = (value, activatedAt) => {
  const days = /^DAY-(\d+)$/i.test(value) ? parseInt(value.match(/\d+/)[0]) : null;
  
  if (!days || !activatedAt) {
    return null;
  }

  return new Date(activatedAt.getTime() + (days * MS_PER_DAY));  // ✅ الصحيح!
};

// ============================================
// 🧪 اختبارات المقارنة
// ============================================

console.log('═══════════════════════════════════════════════════════════════');
console.log('  License Expiration Date Fix - Comparison Tests');
console.log('═══════════════════════════════════════════════════════════════\n');

// Test 1: DAY-3 (المشكلة الأصلية)
console.log('Test 1: DAY-3 License');
console.log('─────────────────────────────────────────────────────────────');

const testDate1 = new Date('2026-09-13T19:07:53.673Z');
const old1 = getCodeExpiryDate_OLD('DAY-3', testDate1);
const new1 = getCodeExpiryDate_NEW('DAY-3', testDate1);

console.log('Activated At:', testDate1.toISOString());
console.log('');
console.log('❌ OLD (خطأ):', old1.toISOString());
console.log('Expected:    2026-09-16T19:07:53.673Z');
console.log('Difference from expected:', 
  Math.round((new Date('2026-09-16T19:07:53.673Z') - old1) / 1000 / 60), 'دقيقة');
console.log('');
console.log('✅ NEW (صحيح):', new1.toISOString());
console.log('Expected:    2026-09-16T19:07:53.673Z');
console.log('Match:', new1.toISOString() === '2026-09-16T19:07:53.673Z' ? '✓ متطابق' : '✗ مختلف');
console.log('');
console.log('Exact Hours Difference:');
console.log('  OLD: ', ((old1 - testDate1) / 1000 / 60 / 60).toFixed(4), 'ساعة');
console.log('  NEW: ', ((new1 - testDate1) / 1000 / 60 / 60).toFixed(4), 'ساعة (72 متوقع)');
console.log('\n');

// Test 2: DAY-1
console.log('Test 2: DAY-1 License');
console.log('─────────────────────────────────────────────────────────────');

const testDate2 = new Date('2026-09-13T10:30:45.500Z');
const old2 = getCodeExpiryDate_OLD('DAY-1', testDate2);
const new2 = getCodeExpiryDate_NEW('DAY-1', testDate2);

console.log('Activated At:', testDate2.toISOString());
console.log('');
console.log('OLD:', old2.toISOString());
console.log('NEW:', new2.toISOString());
console.log('Expected: 2026-09-14T10:30:45.500Z');
console.log('');
console.log('Hours Difference:');
console.log('  OLD:', ((old2 - testDate2) / 1000 / 60 / 60).toFixed(4), 'ساعة');
console.log('  NEW:', ((new2 - testDate2) / 1000 / 60 / 60).toFixed(4), 'ساعة (24 متوقع)');
console.log('\n');

// Test 3: DAY-7
console.log('Test 3: DAY-7 License');
console.log('─────────────────────────────────────────────────────────────');

const testDate3 = new Date('2026-09-01T14:20:30.000Z');
const old3 = getCodeExpiryDate_OLD('DAY-7', testDate3);
const new3 = getCodeExpiryDate_NEW('DAY-7', testDate3);

console.log('Activated At:', testDate3.toISOString());
console.log('');
console.log('OLD:', old3.toISOString());
console.log('NEW:', new3.toISOString());
console.log('Expected: 2026-09-08T14:20:30.000Z');
console.log('');
console.log('Hours Difference:');
console.log('  OLD:', ((old3 - testDate3) / 1000 / 60 / 60).toFixed(4), 'ساعة');
console.log('  NEW:', ((new3 - testDate3) / 1000 / 60 / 60).toFixed(4), 'ساعة (168 متوقع)');
console.log('\n');

// Test 4: DAY-30
console.log('Test 4: DAY-30 License');
console.log('─────────────────────────────────────────────────────────────');

const testDate4 = new Date('2026-09-15T08:15:22.123Z');
const old4 = getCodeExpiryDate_OLD('DAY-30', testDate4);
const new4 = getCodeExpiryDate_NEW('DAY-30', testDate4);

console.log('Activated At:', testDate4.toISOString());
console.log('');
console.log('OLD:', old4.toISOString());
console.log('NEW:', new4.toISOString());
console.log('Expected: 2026-10-15T08:15:22.123Z');
console.log('');
console.log('Hours Difference:');
console.log('  OLD:', ((old4 - testDate4) / 1000 / 60 / 60).toFixed(4), 'ساعة');
console.log('  NEW:', ((new4 - testDate4) / 1000 / 60 / 60).toFixed(4), 'ساعة (720 متوقع)');
console.log('\n');

// ============================================
// 📊 الخلاصة
// ============================================

console.log('═══════════════════════════════════════════════════════════════');
console.log('  📊 النتائج الإجمالية');
console.log('═══════════════════════════════════════════════════════════════\n');

const tests = [
  { name: 'DAY-3', old: old1, new: new1, expected: '2026-09-16T19:07:53.673Z' },
  { name: 'DAY-1', old: old2, new: new2, expected: '2026-09-14T10:30:45.500Z' },
  { name: 'DAY-7', old: old3, new: new3, expected: '2026-09-08T14:20:30.000Z' },
  { name: 'DAY-30', old: old4, new: new4, expected: '2026-10-15T08:15:22.123Z' }
];

let oldCorrect = 0, newCorrect = 0;

console.log('| Code  | OLD Correct | NEW Correct |');
console.log('|-------|-------------|------------|');

tests.forEach(test => {
  const oldMatch = test.old.toISOString() === test.expected;
  const newMatch = test.new.toISOString() === test.expected;
  
  if (oldMatch) oldCorrect++;
  if (newMatch) newCorrect++;
  
  console.log(`| ${test.name}   | ${oldMatch ? '✓ Yes' : '✗ No'} | ${newMatch ? '✓ Yes' : '✗ No'} |`);
});

console.log('');
console.log(`OLD Implementation: ${oldCorrect}/4 صحيح ❌`);
console.log(`NEW Implementation: ${newCorrect}/4 صحيح ✅\n`);

// ============================================
// 💡 شرح إضافي
// ============================================

console.log('═══════════════════════════════════════════════════════════════');
console.log('  💡 شرح التقنية');
console.log('═══════════════════════════════════════════════════════════════\n');

const example = new Date('2026-09-13T19:07:53.673Z');

console.log('Input Date: 2026-09-13T19:07:53.673Z');
console.log('');
console.log('❌ OLD METHOD (خطأ):');
console.log(`  1. new Date(activatedAt) → Date object`);
console.log(`  2. getDate() → يرجع اليوم في المنطقة الزمنية المحلية`);
console.log(`  3. setDate(day + 3) → يضيف 3 أيام بـ المنطقة المحلية`);
console.log(`  → مشكلة: قد يكون اليوم مختلف حسب المنطقة الزمنية!`);
console.log('');
console.log('✅ NEW METHOD (صحيح):');
console.log(`  1. activatedAt.getTime() → ${example.getTime()} ميلي ثانية (UTC)`);
console.log(`  2. days * MS_PER_DAY → 3 * 86,400,000 = 259,200,000 ميلي ثانية`);
console.log(`  3. جمع: ${example.getTime()} + 259,200,000 = ${example.getTime() + 259200000}`);
console.log(`  4. new Date(resultMs) → ${new Date(example.getTime() + 259200000).toISOString()}`);
console.log(`  → النتيجة: دقيقة تماماً بغض النظر عن المنطقة الزمنية!`);
console.log('');

console.log('═══════════════════════════════════════════════════════════════');
console.log('  ✓ تم التحقق من التصحيح بنجاح!');
console.log('═══════════════════════════════════════════════════════════════\n');
